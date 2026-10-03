import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createPool, advisoryLock, checkConnection, getPool, mapDbError, MAPPED_CONSTRAINTS, query, setPoolForTests, withTransaction } from '../db';
import { AppError } from '../errors';
import { startTestDb, useTestEnv, type TestDb } from './helpers';

useTestEnv();

let t: TestDb;
before(async () => {
  t = await startTestDb();
});
after(() => t.close());

/** NOTE: the in-memory test server (pglite-socket) closes the TCP connection after a statement ERROR, which real
 *  PostgreSQL does not. Pause briefly after an expected failure so the pool replaces the dead client before the next query. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const codeOf = async (sql: string, params: unknown[] = []): Promise<string> => {
  try {
    await query(sql, params);
  } catch (err) {
    assert.ok(err instanceof AppError, `expected AppError, got ${(err as Error).message}`);
    await settle();
    return err.code;
  }
  return assert.fail('statement was accepted but must be rejected');
};

describe('type parsers (backend/README rule 4)', () => {
  it('numeric -> string, int8 -> number, date -> raw string, timestamptz -> ISO string', async () => {
    const { rows } = await query(
      `SELECT 1::int8 AS big, count(*) AS cnt, 1.5::numeric(12,2) AS money, DATE '2026-10-03' AS d,
              TIMESTAMPTZ '2026-10-03 18:00:00+05:30' AS ts, TIME '06:00:00' AS tod, '{"a":1}'::jsonb AS j`,
    );
    const r = rows[0] as Record<string, unknown>;
    assert.strictEqual(r.big, 1);
    assert.strictEqual(r.cnt, 1);
    assert.strictEqual(r.money, '1.50');
    assert.strictEqual(r.d, '2026-10-03');
    assert.strictEqual(r.ts, '2026-10-03T12:30:00.000Z');
    assert.strictEqual(r.tod, '06:00:00');
    assert.deepEqual(r.j, { a: 1 });
  });

  it('seed timestamps come back as UTC ISO strings with milliseconds', async () => {
    const { rows } = await query<{ created_at: string }>('SELECT created_at FROM users LIMIT 1');
    assert.match(rows[0]!.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('withTransaction', () => {
  const tagline = async () => (await query<{ value: string }>(`SELECT value FROM club_settings WHERE key = 'club_tagline'`)).rows[0]!.value;

  it('commits when the callback resolves and returns its value', async () => {
    const before = await tagline();
    const result = await withTransaction(async (tx) => {
      await tx.query(`UPDATE club_settings SET value = '"committed"'::jsonb WHERE key = 'club_tagline'`);
      return 42;
    });
    assert.equal(result, 42);
    assert.equal(await tagline(), 'committed');
    await query(`UPDATE club_settings SET value = $1::jsonb WHERE key = 'club_tagline'`, [JSON.stringify(before)]);
  });

  it('rolls EVERYTHING back when the callback throws, and rethrows the same error', async () => {
    const before = await tagline();
    const boom = new Error('boom');
    await assert.rejects(
      withTransaction(async (tx) => {
        await tx.query(`UPDATE club_settings SET value = '"rolled-back"'::jsonb WHERE key = 'club_tagline'`);
        await tx.query(`UPDATE club_settings SET value = '"rolled-back"'::jsonb WHERE key = 'club_name'`);
        throw boom;
      }),
      (e) => e === boom,
    );
    assert.equal(await tagline(), before);
    assert.notEqual((await query<{ value: string }>(`SELECT value FROM club_settings WHERE key = 'club_name'`)).rows[0]!.value, 'rolled-back');
  });

  it('rolls back when a statement fails mid-way, surfacing the mapped AppError', async () => {
    const before = await tagline();
    await assert.rejects(
      withTransaction(async (tx) => {
        await tx.query(`UPDATE club_settings SET value = '"half-done"'::jsonb WHERE key = 'club_tagline'`);
        await tx.query('UPDATE products SET stock_quantity = -1 WHERE id = (SELECT id FROM products LIMIT 1)');
      }),
      (e) => e instanceof AppError && e.code === 'OUT_OF_STOCK',
    );
    assert.equal(await tagline(), before);
  });

  it('releases the connection: the single-connection pool is usable after failures', async () => {
    for (let i = 0; i < 3; i++) await assert.rejects(withTransaction(async () => { throw new Error('x'); }));
    assert.equal((await query('SELECT 1 AS one')).rows[0]!.one, 1);
  });

  it('advisoryLock runs inside a transaction', async () => {
    await withTransaction((tx) => advisoryLock(tx, 'member:test'));
  });
});

describe('SQLSTATE / constraint mapping against the real schema', () => {
  it('23505 users_email_key (case-insensitive) -> EMAIL_TAKEN', async () => {
    assert.equal(await codeOf(`INSERT INTO users (email, password_hash, role, full_name) SELECT upper(email), password_hash, role, 'Dup' FROM users LIMIT 1`), 'EMAIL_TAKEN');
  });

  it('23514 products stock check -> OUT_OF_STOCK', async () => {
    assert.equal(await codeOf('UPDATE products SET stock_quantity = -1 WHERE id = (SELECT id FROM products LIMIT 1)'), 'OUT_OF_STOCK');
  });

  it('23P01 court_bookings_no_overlap (same slot AND half-hour offset) -> BOOKING_CONFLICT', async () => {
    const { rows } = await query<{ court_id: string; start_at: string }>(`SELECT court_id, start_at FROM court_bookings WHERE cancelled_at IS NULL LIMIT 1`);
    const { court_id, start_at } = rows[0]!;
    for (const offsetMin of [0, 30]) {
      const start = new Date(Date.parse(start_at) + offsetMin * 60_000).toISOString();
      const end = new Date(Date.parse(start) + 3_600_000).toISOString();
      assert.equal(
        await codeOf(`INSERT INTO court_bookings (court_id, guest_name, start_at, end_at) VALUES ($1, 'X', $2, $3)`, [court_id, start, end]),
        'BOOKING_CONFLICT',
      );
    }
  });

  it('23P01 memberships_no_overlap (two live terms of one member) -> MEMBERSHIP_ALREADY_ACTIVE', async () => {
    assert.equal(
      await codeOf(`INSERT INTO memberships (member_id, membership_plan_id, start_date, end_date)
                    SELECT member_id, membership_plan_id, current_date, current_date FROM membership_terms WHERE status = 'ACTIVE' LIMIT 1`),
      'MEMBERSHIP_ALREADY_ACTIVE',
    );
  });

  it('23505 on the other unique rules -> the code the API contract lists for them', async () => {
    assert.equal(await codeOf(`INSERT INTO products (sku, name, category, price) SELECT sku, 'Dup', category, price FROM products LIMIT 1`), 'SKU_TAKEN');
    assert.equal(await codeOf(`INSERT INTO payroll_payments (staff_id, pay_period, amount, method) SELECT staff_id, pay_period, amount, method FROM payroll_payments LIMIT 1`), 'PAYROLL_EXISTS');
    assert.equal(await codeOf(`INSERT INTO staff_shifts (staff_id, shift_date, start_time, end_time, area) SELECT staff_id, shift_date, start_time, end_time, area FROM staff_shifts LIMIT 1`), 'SHIFT_OVERLAP');
    assert.equal(await codeOf(`INSERT INTO membership_plans (membership_type, name, duration_months, price) SELECT membership_type, 'Dup', duration_months, price FROM membership_plans LIMIT 1`), 'VALIDATION_ERROR');
  });

  it('every constraint named in the mapping exists in the schema (guards against silent drift)', async () => {
    const { rows } = await query<{ name: string }>(
      `SELECT conname AS name FROM pg_constraint UNION SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const existing = new Set(rows.map((r) => r.name));
    for (const name of MAPPED_CONSTRAINTS) assert.ok(existing.has(name), `constraint/index "${name}" not found in database/migrations`);
  });

  it('unmapped errors pass through untouched (the error middleware turns them into INTERNAL_ERROR)', () => {
    const generic = new Error('x');
    assert.equal(mapDbError(generic), generic);
    const other = Object.assign(new Error('fk'), { code: '23503', constraint: 'whatever_fkey' });
    assert.equal(mapDbError(other), other);
    const unknownUnique = Object.assign(new Error('u'), { code: '23505', constraint: 'some_other_key' });
    assert.equal(mapDbError(unknownUnique), unknownUnique);
    const app = new AppError('NOT_FOUND');
    assert.equal(mapDbError(app), app);
  });
});

describe('checkConnection', () => {
  it('true when the database answers', async () => {
    assert.equal(await checkConnection(), true);
  });

  it('false (and no throw) when it is unreachable', async () => {
    const live = getPool();
    const dead = createPool({ database_url: 'postgresql://x:y@127.0.0.1:1/none', database_ssl: false, max: 1 });
    setPoolForTests(dead);
    try {
      assert.equal(await checkConnection(), false);
    } finally {
      setPoolForTests(live);
      await dead.end();
    }
  });
});
