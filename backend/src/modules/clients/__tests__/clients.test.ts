/**
 * clients module tests. Everything runs against a throw-away in-memory PGlite database (migrations + seed from the
 * repository) — never the real champions_club database. Authentication uses real signed JWTs; only the "is this user
 * still active" lookup is stubbed so no users row is needed for the staff/member tokens.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { UserRole } from '@shared/constants/enums';
import { createApp } from '../../../app';
import { loadConfig } from '../../../config';
import { setUserStateLoader, signToken } from '../../../kernel/auth';
import { query } from '../../../kernel/db';
import { setLogSink } from '../../../kernel/http';
import { serve, startTestDb, TEST_JWT_SECRET, useTestEnv, type TestDb } from '../../../kernel/__tests__/helpers';
import clientsModule from '../index';

useTestEnv();

const config = loadConfig({ JWT_SECRET: TEST_JWT_SECRET, DATABASE_URL: 'postgresql://t:t@127.0.0.1:1/none' });

// Seed identities (mock-data): TechNova has a portal login, Greenfield does not.
const TECHNOVA_ID = '04000000-0000-4000-8000-000000000001';
const TECHNOVA_USER_ID = '01000000-0000-4000-8000-000000000006';
const GREENFIELD_ID = '04000000-0000-4000-8000-000000000002';
const UNKNOWN_ID = '04000000-0000-4000-8000-0000000000ff';

const SUBJECTS: Record<UserRole, { sub: string; extra: Record<string, string> }> = {
  OWNER_ADMIN: { sub: 'a0000000-0000-4000-8000-000000000001', extra: { staff_id: 'a1000000-0000-4000-8000-000000000001' } },
  FRONT_DESK: { sub: 'a0000000-0000-4000-8000-000000000002', extra: { staff_id: 'a1000000-0000-4000-8000-000000000002' } },
  KITCHEN_MANAGER: { sub: 'a0000000-0000-4000-8000-000000000003', extra: { staff_id: 'a1000000-0000-4000-8000-000000000003' } },
  MEMBER: { sub: 'a0000000-0000-4000-8000-000000000004', extra: { member_id: 'a2000000-0000-4000-8000-000000000004' } },
  BUSINESS_CLIENT: { sub: TECHNOVA_USER_ID, extra: { business_client_id: TECHNOVA_ID } },
};

const tokenFor = (role: UserRole, sub = SUBJECTS[role].sub, extra: Record<string, string> = SUBJECTS[role].extra) =>
  signToken({ sub, role, ...extra }).token;

/** The in-memory test server (pglite-socket) drops the connection after a SQL error, unlike real PostgreSQL;
 *  pause so the pool swaps in a fresh client before the next request. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

let t: TestDb;
let server: Awaited<ReturnType<typeof serve>>;
const knownUsers = new Map<string, UserRole>(Object.entries(SUBJECTS).map(([role, s]) => [s.sub, role as UserRole]));
const logged: string[] = [];

before(async () => {
  t = await startTestDb();
  setLogSink((line) => logged.push(line));
  setUserStateLoader(async (id) => {
    const role = knownUsers.get(id);
    if (role) return { is_active: true, role };
    // users created by tests (portal logins) exist in the database
    const { rows } = await query<{ is_active: boolean; role: UserRole }>('SELECT is_active, role FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  });
  server = await serve(await createApp({ config, modules: [clientsModule] }));
});
after(async () => {
  setUserStateLoader();
  setLogSink();
  await server.close();
  await t.close();
});

/** The part of Express's internal router layer this test inspects (express exposes no public types for it). */
interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: { roles?: string[] } }[] };
}

interface Envelope {
  success: boolean;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  meta?: { page: number; page_size: number; total: number; total_pages: number };
  error?: { code: string; message: string; details?: { fields?: Record<string, string> } };
}

async function call(method: string, urlPath: string, opts: { role?: UserRole; token?: string; body?: unknown } = {}): Promise<{ status: number; body: Envelope; raw: string }> {
  const token = opts.token ?? (opts.role ? tokenFor(opts.role) : undefined);
  const res = await fetch(`${server.url}/api/v1/business-clients${urlPath}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const raw = await res.text();
  if (res.status >= 400 && res.status !== 404 && res.status !== 401 && res.status !== 403 && res.status !== 400) await settle();
  return { status: res.status, body: JSON.parse(raw) as Envelope, raw };
}

const owner = (method: string, p: string, body?: unknown) => call(method, p, { role: 'OWNER_ADMIN', body });
const errorCode = (r: { body: Envelope }) => r.body.error?.code;

// ------------------------------------------------------------------ list
describe('GET /business-clients (clients.list)', () => {
  it('returns BusinessClientDetail rows in the standard paginated envelope', async () => {
    const r = await owner('GET', '');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.deepEqual(r.body.meta, { page: 1, page_size: 20, total: 2, total_pages: 1 });
    assert.deepEqual(r.body.data.map((c: { company_name: string }) => c.company_name), ['Greenfield Corp', 'TechNova Solutions Pvt Ltd']);
    const technova = r.body.data.find((c: { id: string }) => c.id === TECHNOVA_ID);
    assert.deepEqual(Object.keys(technova).sort(), [
      'billing_address', 'company_name', 'contact_name', 'created_at', 'email', 'gstin', 'id', 'invoice_count', 'is_active',
      'notes', 'phone', 'total_invoiced', 'total_outstanding', 'total_paid', 'updated_at', 'user_id',
    ]);
    assert.equal(technova.user_id, TECHNOVA_USER_ID);
    assert.match(technova.created_at, /^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/);
  });

  it('totals: issued (non-DRAFT, non-VOID) invoices; outstanding per R-FIN-08; money as 2-decimal strings', async () => {
    const r = await owner('GET', '');
    const technova = r.body.data.find((c: { id: string }) => c.id === TECHNOVA_ID);
    // seed TechNova: PAID 26904/26904 + PARTIALLY_PAID 16992/10000
    assert.equal(technova.invoice_count, 2);
    assert.equal(technova.total_invoiced, '43896.00');
    assert.equal(technova.total_paid, '36904.00');
    assert.equal(technova.total_outstanding, '6992.00');
    // seed Greenfield: OVERDUE 41300/0 counts; its DRAFT (9440) and VOID (41300) must not
    const greenfield = r.body.data.find((c: { id: string }) => c.id === GREENFIELD_ID);
    assert.equal(greenfield.invoice_count, 1);
    assert.deepEqual([greenfield.total_invoiced, greenfield.total_paid, greenfield.total_outstanding], ['41300.00', '0.00', '41300.00']);
  });

  it('totals reconcile with the invoice_totals view', async () => {
    const { rows } = await query<{ n: string }>(
      `SELECT sum(t.total_amount - t.amount_paid)::numeric(12,2) AS n FROM invoices i JOIN invoice_totals t ON t.invoice_id = i.id WHERE i.business_client_id = $1 AND i.status = 'SENT' AND t.payment_state <> 'PAID'`,
      [TECHNOVA_ID],
    );
    const r = await owner('GET', `/${TECHNOVA_ID}`);
    assert.equal(r.body.data.total_outstanding, rows[0]!.n);
  });

  it('q searches company, contact, email, phone and GSTIN (case-insensitive, partial) and treats % literally', async () => {
    const names = async (qs: string) => (await owner('GET', `?q=${encodeURIComponent(qs)}`)).body.data.map((c: { id: string }) => c.id);
    assert.deepEqual(await names('technova'), [TECHNOVA_ID]);
    assert.deepEqual(await names('MEERA'), [GREENFIELD_ID]);
    assert.deepEqual(await names('accounts@green'), [GREENFIELD_ID]);
    assert.deepEqual(await names('9820000006'), [TECHNOVA_ID]);
    assert.deepEqual(await names('aaacg9876'), [GREENFIELD_ID]);
    assert.deepEqual(await names('no such client'), []);
    assert.deepEqual(await names('%'), [], 'a bare % must not match everything');
  });

  it('is_active filters, and page / page_size paginate with the correct meta', async () => {
    const paged = await owner('GET', '?page=2&page_size=1');
    assert.equal(paged.status, 200);
    assert.deepEqual(paged.body.meta, { page: 2, page_size: 1, total: 2, total_pages: 2 });
    assert.deepEqual(paged.body.data.map((c: { id: string }) => c.id), [TECHNOVA_ID]);
    assert.equal((await owner('GET', '?is_active=true')).body.data.length, 2);
    assert.equal((await owner('GET', '?is_active=false')).body.data.length, 0);
  });

  it('rejects bad query values with VALIDATION_ERROR', async () => {
    for (const qs of ['?page_size=101', '?page=0', '?is_active=maybe']) {
      const r = await owner('GET', qs);
      assert.equal(r.status, 400, qs);
      assert.equal(errorCode(r), 'VALIDATION_ERROR');
    }
  });
});

// ------------------------------------------------------------------ create
describe('POST /business-clients (clients.create)', () => {
  const minimal = { company_name: 'Acme Sports Ltd', contact_name: 'Ravi Kumar', email: 'ravi@acme.example' };

  it('creates a client with only the required fields: 201 and a BusinessClientDetail with zero totals', async () => {
    const r = await owner('POST', '', minimal);
    assert.equal(r.status, 201);
    assert.equal(r.body.success, true);
    const c = r.body.data;
    assert.match(c.id, /^[0-9a-f-]{36}$/);
    assert.equal(c.company_name, 'Acme Sports Ltd');
    assert.equal(c.user_id, null);
    assert.equal(c.is_active, true);
    assert.equal(c.phone, null);
    assert.equal(c.invoice_count, 0);
    assert.equal(c.total_invoiced, '0.00');
    const stored = (await query('SELECT * FROM business_clients WHERE id = $1', [c.id])).rows[0]!;
    assert.equal(stored.email, 'ravi@acme.example');
  });

  it('stores every optional field and normalises email (lower-case) and GSTIN (upper-case)', async () => {
    const r = await owner('POST', '', {
      company_name: '  Zenith Corp  ', contact_name: 'Anita Rao', email: 'Anita.Rao@ZENITH.example', phone: '+919811111111',
      gstin: '27aabcz1234f1z5', billing_address: '1 Park Street, Pune', notes: 'Annual tournament sponsor',
    });
    assert.equal(r.status, 201);
    assert.deepEqual(
      { ...r.body.data, id: undefined, created_at: undefined, updated_at: undefined },
      {
        id: undefined, user_id: null, company_name: 'Zenith Corp', contact_name: 'Anita Rao', email: 'anita.rao@zenith.example',
        phone: '+919811111111', gstin: '27AABCZ1234F1Z5', billing_address: '1 Park Street, Pune', notes: 'Annual tournament sponsor',
        is_active: true, created_at: undefined, updated_at: undefined, invoice_count: 0, total_invoiced: '0.00', total_paid: '0.00', total_outstanding: '0.00',
      },
    );
  });

  it('rejects invalid bodies with VALIDATION_ERROR and details.fields', async () => {
    const cases: [string, unknown, string][] = [
      ['missing required fields', {}, 'company_name'],
      ['bad email', { ...minimal, email: 'not-an-email' }, 'email'],
      ['empty company name', { ...minimal, company_name: '   ' }, 'company_name'],
      ['bad GSTIN', { ...minimal, gstin: 'SHORT' }, 'gstin'],
      ['bad phone', { ...minimal, phone: 'call me' }, 'phone'],
      ['unknown field', { ...minimal, role: 'OWNER_ADMIN' }, 'role'],
      ['create_login without a password', { ...minimal, create_login: true }, 'initial_password'],
      ['weak password (no digit)', { ...minimal, create_login: true, initial_password: 'onlyletters' }, 'initial_password'],
      ['weak password (too short)', { ...minimal, create_login: true, initial_password: 'a1' }, 'initial_password'],
      ['password without create_login', { ...minimal, initial_password: 'Passw0rd!x' }, 'initial_password'],
      ['create_login must be a boolean', { ...minimal, create_login: 'yes' }, 'create_login'],
    ];
    for (const [label, body, field] of cases) {
      const r = await owner('POST', '', body);
      assert.equal(r.status, 400, label);
      assert.equal(r.body.success, false, label);
      assert.equal(errorCode(r), 'VALIDATION_ERROR', label);
      assert.ok(r.body.error?.details?.fields?.[field], `${label}: expected a message for "${field}", got ${JSON.stringify(r.body.error?.details)}`);
    }
    assert.equal((await query(`SELECT 1 FROM business_clients WHERE company_name = ''`)).rowCount, 0);
  });

  it('create_login: creates a BUSINESS_CLIENT user with a bcrypt hash, links it, and never leaks the password or hash', async () => {
    logged.length = 0;
    const password = 'Sup3r-Secret-Pw';
    const r = await owner('POST', '', { company_name: 'Login Co', contact_name: 'Lola Singh', email: 'Lola@Login.example', phone: '+919822222222', create_login: true, initial_password: password });
    assert.equal(r.status, 201);
    const c = r.body.data;
    assert.ok(c.user_id, 'client is linked to the new user');

    const user = (await query('SELECT * FROM users WHERE id = $1', [c.user_id])).rows[0]!;
    assert.equal(user.role, 'BUSINESS_CLIENT');
    assert.equal(user.email, 'lola@login.example');
    assert.equal(user.full_name, 'Lola Singh');
    assert.equal(user.phone, '+919822222222');
    assert.equal(user.is_active, true);
    assert.equal(user.must_change_password, true, 'owner-chosen password must be changed at first login (R-SEC-02)');
    assert.match(user.password_hash, /^\$2[aby]\$\d{2}\$/);
    assert.notEqual(user.password_hash, password);
    assert.equal(await bcrypt.compare(password, user.password_hash), true);
    assert.equal(await bcrypt.compare('wrong-password1', user.password_hash), false);

    assert.ok(!r.raw.includes(password) && !r.raw.includes(user.password_hash) && !/password/i.test(r.raw), 'response contains no password or hash');
    assert.ok(!logged.join('\n').includes(password), 'password must not be logged');
  });

  it('create_login: the new portal user can use /me; a client without a login cannot', async () => {
    const created = await owner('POST', '', { company_name: 'Portal Co', contact_name: 'Pia', email: 'pia@portal.example', create_login: true, initial_password: 'Portal-Pass1' });
    const me = await call('GET', '/me', { token: tokenFor('BUSINESS_CLIENT', created.body.data.user_id, {}) });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.id, created.body.data.id);
    assert.equal(me.body.data.company_name, 'Portal Co');
  });

  it('create_login with an email that already has an account => 409 EMAIL_TAKEN and nothing is created (case-insensitive)', async () => {
    const before = (await query<{ n: number }>('SELECT count(*) AS n FROM business_clients')).rows[0]!.n;
    const users = (await query<{ n: number }>('SELECT count(*) AS n FROM users')).rows[0]!.n;
    for (const email of ['owner@championsclub.example', 'OWNER@ChampionsClub.example']) {
      const r = await owner('POST', '', { company_name: 'Dup Co', contact_name: 'Dup', email, create_login: true, initial_password: 'Dup-Pass-123' });
      assert.equal(r.status, 409);
      assert.deepEqual(r.body, { success: false, error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
      await settle();
    }
    assert.equal((await query<{ n: number }>('SELECT count(*) AS n FROM business_clients')).rows[0]!.n, before, 'client insert rolled back');
    assert.equal((await query<{ n: number }>('SELECT count(*) AS n FROM users')).rows[0]!.n, users);
  });

  it('a client WITHOUT login may reuse an existing account email (no account is created)', async () => {
    const r = await owner('POST', '', { company_name: 'Shared Mail Co', contact_name: 'Sam', email: 'owner@championsclub.example' });
    assert.equal(r.status, 201);
  });
});

// ------------------------------------------------------------------ get
describe('GET /business-clients/:id (clients.get)', () => {
  it('returns the client with totals', async () => {
    const r = await owner('GET', `/${GREENFIELD_ID}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.company_name, 'Greenfield Corp');
    assert.equal(r.body.data.user_id, null);
  });

  it('unknown id => 404 BUSINESS_CLIENT_NOT_FOUND; malformed id => 400 VALIDATION_ERROR', async () => {
    const missing = await owner('GET', `/${UNKNOWN_ID}`);
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { success: false, error: { code: 'BUSINESS_CLIENT_NOT_FOUND', message: 'Business client not found.' } });
    const bad = await owner('GET', '/not-a-uuid');
    assert.equal(bad.status, 400);
    assert.equal(errorCode(bad), 'VALIDATION_ERROR');
  });
});

// ------------------------------------------------------------------ me
describe('GET /business-clients/me (clients.me)', () => {
  it('a business client sees their own record (not :id "me")', async () => {
    const r = await call('GET', '/me', { role: 'BUSINESS_CLIENT' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.id, TECHNOVA_ID);
    assert.equal(r.body.data.invoice_count, 2);
  });

  it('a BUSINESS_CLIENT account with no client record => 404 BUSINESS_CLIENT_NOT_FOUND', async () => {
    const orphan = 'a0000000-0000-4000-8000-0000000000bb';
    knownUsers.set(orphan, 'BUSINESS_CLIENT');
    const r = await call('GET', '/me', { token: tokenFor('BUSINESS_CLIENT', orphan, {}) });
    assert.equal(r.status, 404);
    assert.equal(errorCode(r), 'BUSINESS_CLIENT_NOT_FOUND');
  });
});

// ------------------------------------------------------------------ update
describe('PATCH /business-clients/:id (clients.update)', () => {
  let id: string;
  before(async () => {
    id = (await owner('POST', '', { company_name: 'Patch Co', contact_name: 'Pat', email: 'pat@patch.example', phone: '+919833333333', notes: 'keep me' })).body.data.id;
  });

  it('changes only the keys sent', async () => {
    const r = await owner('PATCH', `/${id}`, { contact_name: 'Patricia', email: 'Patricia@Patch.example' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.contact_name, 'Patricia');
    assert.equal(r.body.data.email, 'patricia@patch.example');
    assert.equal(r.body.data.company_name, 'Patch Co');
    assert.equal(r.body.data.phone, '+919833333333');
    assert.equal(r.body.data.notes, 'keep me');
  });

  it('null clears a nullable field; is_active can be switched off and on', async () => {
    const cleared = await owner('PATCH', `/${id}`, { notes: null, phone: null });
    assert.equal(cleared.body.data.notes, null);
    assert.equal(cleared.body.data.phone, null);
    const off = await owner('PATCH', `/${id}`, { is_active: false });
    assert.equal(off.body.data.is_active, false);
    assert.ok((await owner('GET', '?is_active=false')).body.data.some((c: { id: string }) => c.id === id));
    assert.equal((await owner('PATCH', `/${id}`, { is_active: true })).body.data.is_active, true);
  });

  it('an empty body is a valid no-op that returns the client', async () => {
    const r = await owner('PATCH', `/${id}`, {});
    assert.equal(r.status, 200);
    assert.equal(r.body.data.id, id);
  });

  it('updated_at moves forward on change (table trigger)', async () => {
    const before = (await owner('GET', `/${id}`)).body.data.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 15));
    const after = (await owner('PATCH', `/${id}`, { company_name: 'Patch Co Renamed' })).body.data.updated_at;
    assert.ok(Date.parse(after) > Date.parse(before));
  });

  it('rejects unknown keys, nulls on required fields and bad values; unknown id => 404', async () => {
    for (const [body, field] of [
      [{ user_id: UNKNOWN_ID }, 'user_id'],
      [{ company_name: null }, 'company_name'],
      [{ email: 'nope' }, 'email'],
      [{ gstin: '123' }, 'gstin'],
      [{ is_active: 'false' }, 'is_active'],
    ] as const) {
      const r = await owner('PATCH', `/${id}`, body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.body.error?.details?.fields?.[field], JSON.stringify(body));
    }
    const missing = await owner('PATCH', `/${UNKNOWN_ID}`, { notes: 'x' });
    assert.equal(missing.status, 404);
    assert.equal(errorCode(missing), 'BUSINESS_CLIENT_NOT_FOUND');
    assert.equal(errorCode(await owner('PATCH', `/${UNKNOWN_ID}`, {})), 'BUSINESS_CLIENT_NOT_FOUND');
  });
});

// ------------------------------------------------------------------ authorization
describe('authorization (tools/api/endpoints.mjs roles, PERMISSIONS_MATRIX)', () => {
  const ownerOnlyRoutes: [string, string, unknown?][] = [
    ['GET', ''],
    ['POST', '', { company_name: 'X Co', contact_name: 'X', email: 'x@x.example' }],
    ['GET', `/${TECHNOVA_ID}`],
    ['PATCH', `/${TECHNOVA_ID}`, { notes: 'x' }],
  ];

  it('no token => 401 AUTH_UNAUTHORIZED on every endpoint', async () => {
    for (const [method, p, body] of [...ownerOnlyRoutes, ['GET', '/me'] as [string, string]]) {
      const r = await call(method, p, { body });
      assert.equal(r.status, 401, `${method} ${p}`);
      assert.equal(errorCode(r), 'AUTH_UNAUTHORIZED');
    }
  });

  it('owner-only endpoints => 403 FORBIDDEN for MEMBER, FRONT_DESK, KITCHEN_MANAGER and BUSINESS_CLIENT', async () => {
    const before = (await query<{ n: number }>('SELECT count(*) AS n FROM business_clients')).rows[0]!.n;
    for (const role of ['MEMBER', 'FRONT_DESK', 'KITCHEN_MANAGER', 'BUSINESS_CLIENT'] as const) {
      for (const [method, p, body] of ownerOnlyRoutes) {
        const r = await call(method, p, { role, body });
        assert.equal(r.status, 403, `${role} ${method} ${p}`);
        assert.deepEqual(r.body, { success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
      }
    }
    assert.equal((await query<{ n: number }>('SELECT count(*) AS n FROM business_clients')).rows[0]!.n, before, 'forbidden POST created nothing');
  });

  it('/me is BUSINESS_CLIENT only: owner, front desk, kitchen and member get 403', async () => {
    for (const role of ['OWNER_ADMIN', 'FRONT_DESK', 'KITCHEN_MANAGER', 'MEMBER'] as const) {
      assert.equal((await call('GET', '/me', { role })).status, 403, role);
    }
  });

  it('a deactivated account is rejected with ACCOUNT_DISABLED', async () => {
    const id = 'a0000000-0000-4000-8000-0000000000dd';
    await query(`INSERT INTO users (id, email, password_hash, role, full_name, is_active) VALUES ($1, 'off@x.example', 'x', 'OWNER_ADMIN', 'Off', false)`, [id]);
    const r = await call('GET', '', { token: tokenFor('OWNER_ADMIN', id, {}) });
    assert.equal(r.status, 403);
    assert.equal(errorCode(r), 'ACCOUNT_DISABLED');
  });
});

// ------------------------------------------------------------------ contract conformance
describe('contract conformance (tools/api/endpoints.mjs)', () => {
  interface ContractEndpoint { id: string; module: string; method: string; path: string; roles: string[] }

  it('implements exactly the clients endpoints of the contract, with the same roles', async () => {
    const mod = (await import(pathToFileURL(path.resolve(import.meta.dirname, '../../../../../tools/api/endpoints.mjs')).href)) as { endpoints: ContractEndpoint[] };
    const contract = mod.endpoints.filter((e) => e.module === 'clients');
    assert.equal(contract.length, 5);

    const stack = (clientsModule.router as unknown as { stack: RouterLayer[] }).stack;
    const implemented = stack.flatMap(({ route }) =>
      route
        ? Object.keys(route.methods).map((method) => ({
            key: `${method.toUpperCase()} /business-clients${route.path === '/' ? '' : route.path}`,
            roles: route.stack.map((h) => h.handle.roles).find(Boolean) ?? [],
          }))
        : [],
    );

    assert.equal(implemented.length, contract.length, 'no extra, no missing routes');
    for (const ep of contract) {
      const route = implemented.find((r) => r.key === `${ep.method} ${ep.path}`);
      assert.ok(route, `${ep.id}: ${ep.method} ${ep.path} not implemented`);
      assert.deepEqual([...route.roles].sort(), ep.roles.map((r) => r.split(':')[0]).sort(), `${ep.id}: roles differ from the contract`);
    }
  });
});
