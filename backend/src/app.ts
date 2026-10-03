/**
 * Express application factory.
 *
 * Middleware chain (SYSTEM_ARCHITECTURE §6): CORS -> request-id -> JSON body -> [routes: requireAuth -> requireRole ->
 * validate -> handler] -> not-found -> error middleware. requireAuth / requireRole / validate are applied per route by
 * each module (PUBLIC endpoints exist), never globally.
 *
 * Modules are AUTO-DISCOVERED: every `modules/<name>/index.ts` must default-export `{ basePath, router }` and is
 * mounted at `/api/v1<basePath>`. There is no shared router file, so modules never conflict. With no modules yet the
 * API simply answers NOT_FOUND for everything under /api/v1.
 */
import cors from 'cors';
import express, { Router, type Express } from 'express';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { API_PREFIX } from '@shared/constants/rules';
import { getConfig, type Config } from './config';
import { checkConnection } from './kernel/db';
import { AppError, errorHandler, notFoundHandler } from './kernel/errors';
import { asyncHandler, log, ok, requestId } from './kernel/http';

export interface ModuleDefinition {
  /** Path below /api/v1, e.g. '/bookings'. Use '/' when a module owns several top-level paths. */
  basePath: string;
  router: Router;
}

export interface DiscoveredModule extends ModuleDefinition {
  name: string;
}

const defaultModulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'modules');

function isModuleDefinition(value: unknown): value is ModuleDefinition {
  const v = value as Partial<ModuleDefinition> | null;
  return !!v && typeof v.basePath === 'string' && v.basePath.startsWith('/') && typeof v.router === 'function';
}

/** Find and load every modules/<name>/index.ts. A missing or empty modules directory is fine. */
export async function discoverModules(modulesDir: string = defaultModulesDir): Promise<DiscoveredModule[]> {
  if (!existsSync(modulesDir)) return [];
  const found: DiscoveredModule[] = [];
  const names = readdirSync(modulesDir)
    .filter((entry) => statSync(path.join(modulesDir, entry)).isDirectory())
    .sort();

  for (const name of names) {
    const indexFile = ['index.ts', 'index.js'].map((f) => path.join(modulesDir, name, f)).find((f) => existsSync(f));
    if (!indexFile) {
      log('warn', 'module folder has no index.ts — skipped', { module: name });
      continue;
    }
    const loaded = (await import(pathToFileURL(indexFile).href)) as { default?: unknown };
    if (!isModuleDefinition(loaded.default)) {
      throw new Error(`modules/${name}/index.ts must default-export { basePath: '/path', router }`);
    }
    found.push({ name, basePath: loaded.default.basePath, router: loaded.default.router });
  }

  const seen = new Map<string, string>();
  for (const m of found) {
    if (m.basePath === '/') continue; // a module owning several top-level paths; its routes are absolute
    const clash = seen.get(m.basePath);
    if (clash) throw new Error(`modules "${clash}" and "${m.name}" both use basePath ${m.basePath}`);
    seen.set(m.basePath, m.name);
  }
  return found;
}

export interface CreateAppOptions {
  config?: Config;
  /** Inject modules directly (tests); skips filesystem discovery. */
  modules?: ModuleDefinition[];
  modulesDir?: string;
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const config = options.config ?? getConfig();
  const modules = options.modules ?? (await discoverModules(options.modulesDir));

  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.cors_origins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
    }),
  );
  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));

  // Access log: request id on every line; path only (never the query string, headers or body).
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      log('info', 'request', { request_id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started });
    });
    next();
  });

  // Operational endpoint, deliberately OUTSIDE /api/v1: it is not part of the API contract.
  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      if (!(await checkConnection())) throw new AppError('INTERNAL_ERROR', { database: 'down' }, 'Database unreachable.');
      ok(res, { status: 'ok', database: 'up' });
    }),
  );

  for (const m of modules) {
    app.use(m.basePath === '/' ? API_PREFIX : `${API_PREFIX}${m.basePath}`, m.router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
