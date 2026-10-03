import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Router } from 'express';
import { createApp, discoverModules } from '../../app';
import { loadConfig } from '../../config';
import { createPool, getPool, setPoolForTests } from '../db';
import { AppError } from '../errors';
import { asyncHandler, ok } from '../http';
import { serve, startTestDb, TEST_JWT_SECRET, useTestEnv, type TestDb } from './helpers';

useTestEnv();

const config = loadConfig({
  JWT_SECRET: TEST_JWT_SECRET,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/not_a_real_database',
  CORS_ORIGINS: 'http://localhost:5173',
});

let t: TestDb;
before(async () => {
  t = await startTestDb({ seed: false });
});
after(() => t.close());

describe('createApp (real modules directory)', () => {
  let server: Awaited<ReturnType<typeof serve>>;
  before(async () => {
    server = await serve(await createApp({ config }));
  });
  after(() => server.close());

  it('discovery of the real modules directory succeeds', async () => {
    assert.ok(Array.isArray(await discoverModules()));
  });

  it('GET /health answers 200 { success, data: { status, database } } and checks the database', async () => {
    const res = await fetch(`${server.url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true, data: { status: 'ok', database: 'up' } });
  });

  it('/health is outside /api/v1', async () => {
    assert.equal((await fetch(`${server.url}/api/v1/health`)).status, 404);
  });

  it('unknown API routes get the standard NOT_FOUND envelope', async () => {
    const res = await fetch(`${server.url}/api/v1/no-such-module`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
  });

  it('adds a request id and honours CORS_ORIGINS', async () => {
    const allowed = await fetch(`${server.url}/health`, { headers: { origin: 'http://localhost:5173' } });
    assert.ok(allowed.headers.get('x-request-id'));
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const other = await fetch(`${server.url}/health`, { headers: { origin: 'http://evil.test' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${server.url}/api/v1/bookings`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204);
  });

  it('does not advertise Express', async () => {
    assert.equal((await fetch(`${server.url}/health`)).headers.get('x-powered-by'), null);
  });
});

describe('GET /health when the database is down', () => {
  it('returns the standard error envelope (INTERNAL_ERROR, 500)', async () => {
    const live = getPool();
    const dead = createPool({ database_url: 'postgresql://x:y@127.0.0.1:1/none', database_ssl: false, max: 1 });
    setPoolForTests(dead);
    const server = await serve(await createApp({ config }));
    try {
      const res = await fetch(`${server.url}/health`);
      assert.equal(res.status, 500);
      const body = (await res.json()) as { success: boolean; error: { code: string; message: string; details: unknown } };
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.deepEqual(body.error.details, { database: 'down' });
    } finally {
      await server.close();
      setPoolForTests(live);
      await dead.end();
    }
  });
});

describe('module mounting and auto-discovery', () => {
  const makeRouter = () => {
    const router = Router();
    router.get('/ping', (_req, res) => ok(res, 'pong'));
    router.get('/fail', asyncHandler(async () => { throw new AppError('COURT_NOT_FOUND'); }));
    return router;
  };

  it('mounts injected modules under /api/v1<basePath> (and "/" for multi-prefix modules)', async () => {
    const other = Router();
    other.get('/quotes/ping', (_req, res) => ok(res, 'quotes'));
    const server = await serve(await createApp({ config, modules: [{ basePath: '/courts', router: makeRouter() }, { basePath: '/', router: other }] }));
    try {
      assert.deepEqual(await (await fetch(`${server.url}/api/v1/courts/ping`)).json(), { success: true, data: 'pong' });
      assert.deepEqual(await (await fetch(`${server.url}/api/v1/quotes/ping`)).json(), { success: true, data: 'quotes' });
      const fail = await fetch(`${server.url}/api/v1/courts/fail`);
      assert.equal(fail.status, 404);
      assert.equal(((await fail.json()) as { error: { code: string } }).error.code, 'COURT_NOT_FOUND');
      assert.equal((await fetch(`${server.url}/courts/ping`)).status, 404, 'not mounted without the /api/v1 prefix');
    } finally {
      await server.close();
    }
  });

  describe('filesystem discovery (throw-away fixtures in the OS temp dir, not in the repository)', () => {
    let dir: string;
    before(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'cc-modules-'));
    });
    after(() => rmSync(dir, { recursive: true, force: true }));

    const addModule = (name: string, source: string | null) => {
      mkdirSync(path.join(dir, name), { recursive: true });
      if (source !== null) writeFileSync(path.join(dir, name, 'index.ts'), source);
    };
    const routerSource = (base: string) =>
      // a plain middleware function is a valid "router" and avoids resolving `express` from the temp directory
      `const router = (req: any, res: any, next: any) => (req.path === '/hello' ? res.json({ from: '${base}' }) : next());\nexport default { basePath: '${base}', router };\n`;

    it('missing directory => no modules', async () => {
      assert.deepEqual(await discoverModules(path.join(dir, 'does-not-exist')), []);
    });

    it('loads every <name>/index.ts alphabetically, skips folders without one, and mounts them', async () => {
      addModule('zeta', routerSource('/zeta'));
      addModule('alpha', routerSource('/alpha'));
      addModule('empty-folder', null);
      const found = await discoverModules(dir);
      assert.deepEqual(found.map((m) => m.name), ['alpha', 'zeta']);
      const server = await serve(await createApp({ config, modulesDir: dir }));
      try {
        assert.deepEqual(await (await fetch(`${server.url}/api/v1/alpha/hello`)).json(), { from: '/alpha' });
        assert.deepEqual(await (await fetch(`${server.url}/api/v1/zeta/hello`)).json(), { from: '/zeta' });
      } finally {
        await server.close();
      }
    });

    it('fails fast on a malformed module export or a duplicate basePath', async () => {
      const bad = mkdtempSync(path.join(os.tmpdir(), 'cc-modules-bad-'));
      const dup = mkdtempSync(path.join(os.tmpdir(), 'cc-modules-dup-'));
      try {
        mkdirSync(path.join(bad, 'oops'));
        writeFileSync(path.join(bad, 'oops', 'index.ts'), 'export default { basePath: "no-slash" };\n');
        await assert.rejects(discoverModules(bad), /must default-export \{ basePath/);
        mkdirSync(path.join(dup, 'one'));
        mkdirSync(path.join(dup, 'two'));
        writeFileSync(path.join(dup, 'one', 'index.ts'), routerSource('/same'));
        writeFileSync(path.join(dup, 'two', 'index.ts'), routerSource('/same'));
        await assert.rejects(discoverModules(dup), /both use basePath \/same/);
      } finally {
        rmSync(bad, { recursive: true, force: true });
        rmSync(dup, { recursive: true, force: true });
      }
    });
  });
});
