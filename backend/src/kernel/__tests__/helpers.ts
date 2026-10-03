/**
 * Test helpers. SAFETY: nothing here ever connects to the real `champions_club` database. DB tests use a throw-away
 * in-memory PGlite instance (migrations + seed loaded from the repository) served over the Postgres wire protocol.
 * PGlite is a root devDependency (`npm install` at the repo root), resolved by walking up from backend/.
 */
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import type { Express } from 'express';
import { readFileSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetConfigForTests } from '../../config';
import { createPool, setPoolForTests } from '../db';
import { setLogSink } from '../http';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-123456';

/** Environment for getConfig(); the DATABASE_URL is a dummy that is never connected to. */
export function useTestEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_EXPIRES_IN: '8h',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/not_a_real_database',
    CORS_ORIGINS: 'http://localhost:5173',
    BCRYPT_ROUNDS: '4',
  });
  resetConfigForTests();
  setLogSink(() => {}); // keep test output clean
}

export interface TestDb {
  db: PGlite;
  url: string;
  close(): Promise<void>;
}

/** In-memory Postgres with the canonical schema (and, by default, the demo seed) behind the kernel's pool (max 1). */
export async function startTestDb(opts: { seed?: boolean } = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { btree_gist } });
  const migrations = path.join(repoRoot, 'database/migrations');
  for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(migrations, f), 'utf8'));
  }
  if (opts.seed !== false) await db.exec(readFileSync(path.join(repoRoot, 'database/seed/seed.sql'), 'utf8'));

  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  const pool = createPool({ database_url: url, database_ssl: false, max: 1 });
  setPoolForTests(pool);

  return {
    db,
    url,
    async close() {
      setPoolForTests(undefined);
      await pool.end();
      await server.stop();
      await db.close();
    },
  };
}

/** Listen on a random port; returns the base URL and a closer. */
export async function serve(app: Express): Promise<{ url: string; close(): Promise<void> }> {
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
