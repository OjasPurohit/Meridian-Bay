/**
 * Validate at the edge (zod). One schema per generated *Request / *Query type in shared/types/requests.generated.ts —
 * declare module schemas as `z.ZodType<XRequest, z.ZodTypeDef, unknown>` so the compiler flags drift from the contract.
 * Any failure is `400 VALIDATION_ERROR` with `details.fields = { "<field>": "<message>" }`.
 */
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { PAGINATION } from '@shared/constants/rules';
import { addDays } from '@shared/lib/time';
import { AppError } from './errors';

export { z };

/** Any zod schema whose parsed output is T (input is whatever arrived on the wire). */
export type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

// ------------------------------------------------------------------ error shaping
export function fieldsFromZod(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) fields[[...issue.path, key].join('.')] = 'Unknown field.';
      continue;
    }
    const key = issue.path.join('.') || 'body';
    if (!(key in fields)) fields[key] = issue.message; // first message per field
  }
  return fields;
}

/** Parse `data` or throw VALIDATION_ERROR. */
export function parse<T>(schema: Schema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError('VALIDATION_ERROR', { fields: fieldsFromZod(result.error) });
  return result.data;
}

// ------------------------------------------------------------------ middleware
/** Replaces req.body with the parsed value. Missing body is treated as `{}` so "required field" errors are per field. */
export function validateBody<T>(schema: Schema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = parse(schema, req.body ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Query-string values arrive as strings; the schema coerces them (see queryBool / queryInt). */
export function validateQuery<T>(schema: Schema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.query = parse(schema, req.query) as typeof req.query;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateParams<T>(schema: Schema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.params = parse(schema, req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ------------------------------------------------------------------ reusable fragments
const isRealDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export const uuid = z.string().uuid('Must be a UUID.');
/** IST business date "YYYY-MM-DD". */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date (YYYY-MM-DD).').refine(isRealDate, 'Not a real calendar date.');
/** Time of day "HH:mm:ss". */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, 'Must be a time (HH:mm:ss).');
/** Money: a string with exactly 2 decimals — never a JSON number. */
export const money = z.string().regex(/^\d+\.\d{2}$/, 'Must be an amount with 2 decimals, e.g. "1250.00".');
export const percent = money.refine((v) => Number(v) <= 100, 'Must be between 0.00 and 100.00.');

/** "true" | "false" from a query string (a real boolean is accepted too). */
export const queryBool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
/** Integer from a query string; unlike z.coerce.number() it rejects "" and "abc". */
export const queryInt = z.union([z.number().int(), z.string().regex(/^-?\d+$/, 'Must be an integer.').transform(Number)]);

/** `?page=1&page_size=20` (default 20, max 100 — PAGINATION). Spread into a Query schema's shape. */
export const paginationFields = {
  page: queryInt.pipe(z.number().int().min(1)).default(1),
  page_size: queryInt.pipe(z.number().int().min(1).max(PAGINATION.MAX_PAGE_SIZE)).default(PAGINATION.DEFAULT_PAGE_SIZE),
};
export const paginationQuery = z.object(paginationFields);
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const offsetOf = ({ page, page_size }: PaginationQuery): number => (page - 1) * page_size;

/** `from`/`to` of the report endpoints: inclusive IST dates, to >= from, at most 366 days. */
export const dateRangeFields = { from: isoDate, to: isoDate };
export const MAX_RANGE_DAYS = 366;

export function refineDateRange<S extends z.ZodType<{ from: string; to: string }, z.ZodTypeDef, unknown>>(schema: S) {
  return schema.superRefine((v, ctx) => {
    if (v.to < v.from) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Must be on or after "from".' });
    else if (v.to > addDays(v.from, MAX_RANGE_DAYS - 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `Range may span at most ${MAX_RANGE_DAYS} days.` });
    }
  });
}

/** `z.object(shape).strict()`: PATCH / POST bodies reject unknown keys with VALIDATION_ERROR (API_CONTRACT §1). */
export const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const idParams = strictObject({ id: uuid });
