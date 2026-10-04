// Clones champions_club into a scratch database (champions_club_e2e) and starts a throw-away backend (:4001) and
// Vite dev server (:5175) against it, so the browser tests can write freely without touching the real data.
// Never prints the password. `node e2e_env.mjs up` / `node e2e_env.mjs down`
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').replace(/\\/g, '/');
const require = createRequire(ROOT + '/package.json');
require('dotenv').config({ path: ROOT + '/.env' });
const pg = require('pg');
const url = new URL(process.env.DATABASE_URL);
const PGBIN = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin'; // folder with pg_dump / pg_restore
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const common = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)];
const SCRATCH = 'champions_club_e2e';
const dump = path.join(ROOT, 'e2e_clone.dump'); // *.dump is git-ignored
const pidFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'e2e_pids.json');

const sh = (bin, args) => {
  const r = spawnSync(path.join(PGBIN, bin), args, { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${bin}: ${(r.stderr || '').slice(0, 400)}`);
};
const admin = new pg.Client({ connectionString: url.toString().replace(url.pathname, '/postgres') });
await admin.connect();

if (process.argv[2] === 'down') {
  try {
    for (const pid of JSON.parse(fs.readFileSync(pidFile, 'utf8'))) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  } catch { /* nothing running */ }
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [SCRATCH]);
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH}`);
  try { fs.unlinkSync(dump); } catch { /* none */ }
  await admin.end();
  console.log('scratch environment removed');
  process.exit(0);
}

await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [SCRATCH]);
await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH}`);
await admin.query(`CREATE DATABASE ${SCRATCH}`);
sh('pg_dump.exe', [...common, '-Fc', '-f', dump, url.pathname.slice(1)]);
sh('pg_restore.exe', [...common, '-d', SCRATCH, '--no-owner', dump]);
await admin.end();
const scratchUrl = new URL(url.toString());
scratchUrl.pathname = '/' + SCRATCH;
console.log('cloned into', SCRATCH);

const pids = [];
const be = spawn('cmd', ['/c', 'npx tsx src/server.ts'], {
  cwd: ROOT + '/backend', detached: true, stdio: ['ignore', fs.openSync(path.join(ROOT, 'e2e_backend.log'), 'w'), 'inherit'],
  env: { ...env, DATABASE_URL: scratchUrl.toString(), PORT: '4001', CORS_ORIGINS: 'http://localhost:5175', BCRYPT_ROUNDS: '8' },
});
pids.push(be.pid);
const fe = spawn('cmd', ['/c', 'npx vite --port 5175 --strictPort'], {
  cwd: ROOT + '/frontend', detached: true, stdio: ['ignore', fs.openSync(path.join(ROOT, 'e2e_frontend.log'), 'w'), 'inherit'],
  env: { ...process.env, VITE_API_BASE_URL: 'http://localhost:4001' },
});
pids.push(fe.pid);
fs.writeFileSync(pidFile, JSON.stringify(pids));
be.unref();
fe.unref();
console.log('started', pids.join(','));
