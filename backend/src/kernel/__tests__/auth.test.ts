import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { USER_ROLE, type UserRole } from '@shared/constants/enums';
import {
  callerScope, invalidateUserCache, optionalAuth, requireAuth, requireRole, setUserStateLoader, signToken, verifyToken,
  type TokenClaims,
} from '../auth';
import { errorHandler } from '../errors';
import { ok } from '../http';
import { TEST_JWT_SECRET, serve, useTestEnv } from './helpers';

useTestEnv();

const claimsFor = (role: UserRole): TokenClaims => ({
  sub: '11111111-1111-4111-8111-111111111111',
  role,
  ...(role === 'MEMBER' ? { member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } : {}),
  ...(role === 'BUSINESS_CLIENT' ? { business_client_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } : {}),
  ...(role === 'FRONT_DESK' || role === 'KITCHEN_MANAGER' || role === 'OWNER_ADMIN' ? { staff_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } : {}),
});

describe('tokens', () => {
  it('signToken / verifyToken round-trip claims and expose expires_at (8 h)', () => {
    const { token, expires_at } = signToken(claimsFor('MEMBER'));
    assert.deepEqual(verifyToken(token), claimsFor('MEMBER'));
    const hours = (Date.parse(expires_at) - Date.now()) / 3_600_000;
    assert.ok(hours > 7.9 && hours <= 8, `expected ~8h, got ${hours}`);
    assert.match(expires_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('rejects garbage, a wrong signature, an expired token, a wrong algorithm and an unknown role', () => {
    const base = { role: 'MEMBER' };
    const expired = jwt.sign(base, TEST_JWT_SECRET, { subject: 'u', expiresIn: -10 });
    const wrongKey = jwt.sign(base, 'another-secret-another-secret-another-1', { subject: 'u', expiresIn: '1h' });
    const wrongAlg = jwt.sign(base, TEST_JWT_SECRET, { subject: 'u', expiresIn: '1h', algorithm: 'HS512' });
    const badRole = jwt.sign({ role: 'SUPERUSER' }, TEST_JWT_SECRET, { subject: 'u', expiresIn: '1h' });
    const noSubject = jwt.sign(base, TEST_JWT_SECRET, { expiresIn: '1h' });
    for (const t of ['garbage', expired, wrongKey, wrongAlg, badRole, noSubject]) {
      assert.throws(() => verifyToken(t), (e: unknown) => (e as { code: string }).code === 'AUTH_UNAUTHORIZED', t.slice(0, 20));
    }
  });
});

describe('requireAuth / optionalAuth / requireRole / callerScope', () => {
  let server: Awaited<ReturnType<typeof serve>>;
  let lookups = 0;
  let state: { is_active: boolean; role: UserRole } | null;
  const setState = (next: typeof state) => {
    state = next;
    invalidateUserCache();
  };

  before(async () => {
    const app = express();
    app.get('/private', requireAuth, (req, res) => ok(res, { user: req.user }));
    app.get('/owner-only', requireAuth, requireRole(USER_ROLE.OWNER_ADMIN), (_req, res) => ok(res, 'owner'));
    app.get('/staff', requireAuth, requireRole(USER_ROLE.FRONT_DESK, USER_ROLE.OWNER_ADMIN), (_req, res) => ok(res, 'staff'));
    app.get('/public', optionalAuth, (req, res) => ok(res, { role: req.user?.role ?? null }));
    app.get('/scope', requireAuth, (req, res) => ok(res, callerScope(req)));
    app.use(errorHandler);
    server = await serve(app);
  });
  after(() => {
    setUserStateLoader();
    return server.close();
  });
  beforeEach(() => {
    lookups = 0;
    setState({ is_active: true, role: 'MEMBER' });
    setUserStateLoader(async () => {
      lookups++;
      return state;
    });
  });

  const call = async (path: string, role?: UserRole, token?: string) => {
    const t = token ?? (role ? signToken(claimsFor(role)).token : undefined);
    const res = await fetch(`${server.url}${path}`, { headers: t ? { authorization: `Bearer ${t}` } : {} });
    return { status: res.status, body: (await res.json()) as { success: boolean; data?: unknown; error?: { code: string } } };
  };

  it('no token / malformed header => 401 AUTH_UNAUTHORIZED', async () => {
    const none = await call('/private');
    assert.equal(none.status, 401);
    assert.equal(none.body.error?.code, 'AUTH_UNAUTHORIZED');
    const res = await fetch(`${server.url}/private`, { headers: { authorization: 'Token abc' } });
    assert.equal(res.status, 401);
    assert.equal((await call('/private', undefined, 'not.a.jwt')).status, 401);
  });

  it('valid token => req.user from the claims', async () => {
    const r = await call('/private', 'MEMBER');
    assert.equal(r.status, 200);
    assert.deepEqual((r.body.data as { user: unknown }).user, { id: claimsFor('MEMBER').sub, role: 'MEMBER', member_id: claimsFor('MEMBER').member_id });
  });

  it('deactivated user => 403 ACCOUNT_DISABLED; deleted user => 401', async () => {
    setState({ is_active: false, role: 'MEMBER' });
    const disabled = await call('/private', 'MEMBER');
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.error?.code, 'ACCOUNT_DISABLED');
    setState(null);
    invalidateUserCache();
    assert.equal((await call('/private', 'MEMBER')).status, 401);
  });

  it('role changed since the token was issued => 401', async () => {
    setState({ is_active: true, role: 'FRONT_DESK' });
    assert.equal((await call('/private', 'MEMBER')).status, 401);
  });

  it('caches the active-user lookup briefly, and invalidateUserCache() makes a change apply at once', async () => {
    await call('/private', 'MEMBER');
    await call('/private', 'MEMBER');
    assert.equal(lookups, 1);
    state = { is_active: false, role: 'MEMBER' }; // deliberately NOT via setState: no invalidation
    assert.equal((await call('/private', 'MEMBER')).status, 200); // still cached
    invalidateUserCache(claimsFor('MEMBER').sub);
    assert.equal((await call('/private', 'MEMBER')).status, 403);
  });

  it('requireRole: allowed roles pass, others get 403 FORBIDDEN, and the guard exposes its roles', async () => {
    setState({ is_active: true, role: 'OWNER_ADMIN' });
    assert.equal((await call('/owner-only', 'OWNER_ADMIN')).status, 200);
    setState({ is_active: true, role: 'FRONT_DESK' });
    const denied = await call('/owner-only', 'FRONT_DESK');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error?.code, 'FORBIDDEN');
    assert.equal((await call('/staff', 'FRONT_DESK')).status, 200);
    assert.deepEqual(requireRole('MEMBER', 'OWNER_ADMIN').roles, ['MEMBER', 'OWNER_ADMIN']);
  });

  it('requireRole without requireAuth in front is a 401, never a pass', async () => {
    const guard = requireRole('MEMBER');
    let err: unknown;
    guard({} as express.Request, {} as express.Response, (e?: unknown) => { err = e; });
    assert.equal((err as { code: string }).code, 'AUTH_UNAUTHORIZED');
  });

  it('optionalAuth: anonymous passes, a valid token is honoured, a bad token is still rejected', async () => {
    assert.deepEqual((await call('/public')).body.data, { role: null });
    assert.deepEqual((await call('/public', 'MEMBER')).body.data, { role: 'MEMBER' });
    assert.equal((await call('/public', undefined, 'bad.token.here')).status, 401);
  });

  it('callerScope returns the profile id that matches the role', async () => {
    setState({ is_active: true, role: 'MEMBER' });
    assert.deepEqual((await call('/scope', 'MEMBER')).body.data, { member_id: claimsFor('MEMBER').member_id });
    setState({ is_active: true, role: 'BUSINESS_CLIENT' });
    assert.deepEqual((await call('/scope', 'BUSINESS_CLIENT')).body.data, { business_client_id: claimsFor('BUSINESS_CLIENT').business_client_id });
    for (const role of ['FRONT_DESK', 'KITCHEN_MANAGER', 'OWNER_ADMIN'] as const) {
      setState({ is_active: true, role });
      assert.deepEqual((await call('/scope', role)).body.data, { staff_id: claimsFor(role).staff_id });
    }
  });

  it('callerScope: a profile-less account is FORBIDDEN', async () => {
    setState({ is_active: true, role: 'MEMBER' });
    const { token } = signToken({ sub: claimsFor('MEMBER').sub, role: 'MEMBER' });
    const r = await call('/scope', undefined, token);
    assert.equal(r.status, 403);
  });
});
