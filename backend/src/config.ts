/**
 * Validated environment (docs/integration/ENVIRONMENT.md, rule 6): read once, fail fast with a clear message.
 * Error messages name the variable and the problem — never the value (JWT_SECRET / DATABASE_URL are secrets).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const PLACEHOLDER_SECRET_PREFIX = 'replace-with';

/** pg parses DATABASE_URL as a URL; check the same thing here so a typo fails at start-up with a clear message. */
function isCompleteConnectionString(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname !== '' && url.pathname.length > 1;
  } catch {
    return false;
  }
}

const boolFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const optionalString = z.string().optional();

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    APP_TIMEZONE: optionalString,
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().min(2).default('8h'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
    DATABASE_URL: z
      .string()
      .min(1, 'is required')
      .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgresql:// connection string')
      .refine(isCompleteConnectionString, 'is not a complete connection string: expected postgresql://user:password@host:port/database (percent-encode special characters in the password)'),
    DATABASE_SSL: boolFromString,
    SUPABASE_URL: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
    PAYMENT_PROVIDER_KEY: optionalString,
    PAYMENT_PROVIDER_SECRET: optionalString,
    PAYMENT_WEBHOOK_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.startsWith(PLACEHOLDER_SECRET_PREFIX)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'must not be the .env.example placeholder in production' });
    }
  });

export interface Config {
  node_env: 'development' | 'production' | 'test';
  port: number;
  cors_origins: string[];
  jwt_secret: string;
  jwt_expires_in: string;
  bcrypt_rounds: number;
  database_url: string;
  database_ssl: boolean;
  payment_provider: 'mock' | 'razorpay';
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\nSee docs/integration/ENVIRONMENT.md and .env.example.`);
    this.name = 'ConfigError';
  }
}

/** Pure: validate an env object (process.env or a test fixture) into a typed Config. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`));
  }
  const e = parsed.data;
  const cors_origins = e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  return Object.freeze({
    node_env: e.NODE_ENV,
    port: e.PORT,
    cors_origins,
    jwt_secret: e.JWT_SECRET,
    jwt_expires_in: e.JWT_EXPIRES_IN,
    bcrypt_rounds: e.BCRYPT_ROUNDS,
    database_url: e.DATABASE_URL,
    database_ssl: e.DATABASE_SSL,
    payment_provider: e.PAYMENT_PROVIDER,
  });
}

let cached: Config | undefined;

/** The single `.env` lives at the repository root (it is git-ignored). Existing process env always wins. */
export function getConfig(): Config {
  if (!cached) {
    const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
    dotenv.config({ path: rootEnv });
    cached = loadConfig(process.env);
  }
  return cached;
}

/** Test hook: forget the memoised config so the next getConfig() re-reads process.env. */
export function resetConfigForTests(): void {
  cached = undefined;
}
