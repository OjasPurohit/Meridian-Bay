// Integration test for database/migrate.mjs, seed.mjs, reset.mjs against a throw-away in-memory Postgres
// (PGlite exposed over the real Postgres wire protocol). Proves the SAME scripts work with any DATABASE_URL.
//   npm run test:db-scripts
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 54329;
const db = new PGlite({ extensions: { btree_gist } });
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();

let fails = 0;
// Must be async: the Postgres server lives in THIS process, so a blocking spawnSync would deadlock it.
const exec = (script, args, env) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(root, script), ...args], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, ...env },
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
const run = async (label, script, args = [], env = {}, expectFail = false) => {
  const r = await exec(script, args, env);
  const good = expectFail ? r.status !== 0 : r.status === 0;
  console.log(`  ${good ? '✔' : '✘'} ${label}${good ? '' : `\n${r.stdout}\n${r.stderr}`}`);
  if (!good) fails++;
  return r;
};

console.log('database scripts against in-memory Postgres:');
await run('migrate (fresh database)', 'database/migrate.mjs');
await run('migrate again is a no-op', 'database/migrate.mjs');
await run('seed loads mock data', 'database/seed.mjs');
await run('seed refuses when data exists', 'database/seed.mjs', [], {}, true);
await run('reset refused without ALLOW_DB_RESET', 'database/reset.mjs', [], { ALLOW_DB_RESET: 'false' }, true);
await run('reset refused for a non-local host (Supabase-like URL)', 'database/reset.mjs', [], { ALLOW_DB_RESET: 'true', DATABASE_URL: 'postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres' }, true);
await run('reset (local, ALLOW_DB_RESET=true) rebuilds + reseeds', 'database/reset.mjs', [], { ALLOW_DB_RESET: 'true' });
const n = (await db.query('SELECT count(*)::int AS n FROM payments')).rows[0].n;
const m = (await db.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n;
console.log(`  ${n > 0 && m === 2 ? '✔' : '✘'} after reset: payments=${n}, schema_migrations=${m}`);
if (!(n > 0 && m === 2)) fails++;

await server.stop();
await db.close();
console.log(fails ? `\n${fails} FAILED` : '\ndatabase scripts OK');
process.exit(fails ? 1 : 0);
