/**
 * PostgreSQL access: one pg Pool, hand-written SQL, no ORM (ADR-008).
 *   query()            – single statement on the pool
 *   withTransaction()  – one use case = one transaction; `tx` is passed down to other modules' services
 * Database errors are mapped here by SQLSTATE / constraint name (docs/contracts/ERROR_CODES.md) so no module ever
 * inspects a pg error itself.
 */
import pg from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';
import { getConfig } from '../config';
import { AppError } from './errors';
import { log } from './http';
import type { ErrorCode } from '@shared/constants/errors';

// ------------------------------------------------------------------ type parsers (backend/README rule 4) — set once
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_TIMESTAMPTZ = 1184;

let parsersInstalled = false;

export function installTypeParsers(): void {
  if (parsersInstalled) return;
  parsersInstalled = true;
  // numeric (1700) stays the pg default: a string, so money never becomes a float.
  pg.types.setTypeParser(OID_INT8, (v) => Number.parseInt(v, 10)); // counts / sums stay JS numbers
  pg.types.setTypeParser(OID_DATE, (v) => v); // IST business date stays the raw "YYYY-MM-DD" string
  const parseTimestamptz = pg.types.getTypeParser(OID_TIMESTAMPTZ) as (v: string) => unknown;
  pg.types.setTypeParser(OID_TIMESTAMPTZ, (v) => {
    const parsed = parseTimestamptz(v);
    return parsed instanceof Date ? parsed.toISOString() : String(parsed); // "2026-10-03T12:30:00.000Z"
  });
}
installTypeParsers();

// ------------------------------------------------------------------ SQLSTATE / constraint mapping
interface PgErrorLike {
  code?: string;
  constraint?: string;
  table?: string;
}

/** 23505 unique violations by constraint (index) name. The first two are mandated by ERROR_CODES.md; the rest are
 *  the other unique rules of the schema, mapped to the code the API contract lists for them. */
const UNIQUE_VIOLATIONS: Record<string, ErrorCode> = {
  users_email_key: 'EMAIL_TAKEN',
  employee_applications_pending_email_key: 'APPLICATION_PENDING',
  products_sku_key: 'SKU_TAKEN',
  courts_name_key: 'COURT_NAME_TAKEN',
  payroll_payments_staff_id_pay_period_key: 'PAYROLL_EXISTS',
  staff_shifts_staff_id_shift_date_start_time_key: 'SHIFT_OVERLAP',
  membership_plans_membership_type_duration_months_key: 'VALIDATION_ERROR',
};

/** Exposed so a test can prove every named constraint still exists in database/migrations. */
export const MAPPED_CONSTRAINTS: readonly string[] = [...Object.keys(UNIQUE_VIOLATIONS), 'court_bookings_no_overlap', 'memberships_no_overlap', 'products_stock_quantity_check'];

/** Translate a pg error into an AppError when the schema's own guarantee fired; otherwise return the error untouched
 *  (the error middleware then answers INTERNAL_ERROR and logs it). */
export function mapDbError(err: unknown): unknown {
  if (err instanceof AppError) return err;
  const e = err as PgErrorLike;
  if (!e || typeof e.code !== 'string') return err;

  switch (e.code) {
    case '23P01': // exclusion_violation: memberships_no_overlap (migration 0003) or court_bookings_no_overlap (ADR-006)
      return new AppError(e.constraint === 'memberships_no_overlap' ? 'MEMBERSHIP_ALREADY_ACTIVE' : 'BOOKING_CONFLICT');
    case '23514': // check_violation
      if (e.table === 'products' && e.constraint === 'products_stock_quantity_check') return new AppError('OUT_OF_STOCK');
      return err;
    case '23505': {
      const code = e.constraint ? UNIQUE_VIOLATIONS[e.constraint] : undefined;
      if (!code) return err;
      return code === 'VALIDATION_ERROR'
        ? new AppError('VALIDATION_ERROR', { fields: { membership_type: 'A plan with this type and duration already exists.' } })
        : new AppError(code);
    }
    default:
      return err;
  }
}

// ------------------------------------------------------------------ pool
export interface PoolSettings {
  database_url: string;
  database_ssl: boolean;
  /** Pool size (default 10). Tests against the in-memory database use 1. */
  max?: number;
}

export function createPool(settings: PoolSettings): pg.Pool {
  const pool = new pg.Pool({
    connectionString: settings.database_url,
    ssl: settings.database_ssl ? { rejectUnauthorized: false } : undefined, // same as database/migrate.mjs (Supabase)
    max: settings.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle client dying (DB restart) must not crash the process.
  pool.on('error', (err) => log('error', 'idle pg client error', { error: err.message }));
  return pool;
}

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) pool = createPool(getConfig());
  return pool;
}

/** Test hook: point the kernel at a different (e.g. throw-away in-memory) database. Closes nothing. */
export function setPoolForTests(next: pg.Pool | undefined): void {
  pool = next;
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}

// ------------------------------------------------------------------ query / transaction
/** The handle every repo/service uses: the pool inside query(), the open transaction inside withTransaction(). */
export interface Tx {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

export async function query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
  try {
    return await getPool().query<R>(text, params);
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let destroy = false;
  const tx: Tx = {
    async query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
      try {
        return await client.query<R>(text, params);
      } catch (err) {
        throw mapDbError(err);
      }
    },
  };
  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      destroy = true; // connection is in an unknown state: do not return it to the pool
      log('error', 'rollback failed', { error: (rollbackErr as Error).message });
    }
    throw mapDbError(err);
  } finally {
    client.release(destroy);
  }
}

/** Transaction-scoped advisory lock (e.g. per-member daily-play check, R-COURT-04). Released at COMMIT/ROLLBACK. */
export async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

/** SELECT 1 — used by server start-up and GET /health. Never throws; false means "database unreachable". */
export async function checkConnection(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch (err) {
    log('error', 'database connectivity check failed', { error: (err as Error).message });
    return false;
  }
}
