// Applies database/migrations/*.sql in order to whatever DATABASE_URL points at (local Postgres OR Supabase).
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --status  list applied / pending without changing anything
// Safety: each file runs in its own transaction; a file that was already applied is NEVER re-run and is
// checksum-verified — editing an applied migration fails loudly (add a new numbered file instead).
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrationChecksum } from './checksum.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function connectionConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.'); process.exit(1); }
  return { connectionString: url, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined };
}

export async function migrate({ statusOnly = false } = {}) {
  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Map((await client.query('SELECT filename, checksum FROM schema_migrations')).rows.map((r) => [r.filename, r.checksum]));
    const dir = path.join(root, 'database/migrations');
    const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    let ran = 0;
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), 'utf8');
      const checksum = migrationChecksum(sql); // line-ending independent (see checksum.mjs)
      if (applied.has(file)) {
        if (applied.get(file) !== checksum) throw new Error(`Migration ${file} was modified after being applied. Never edit applied migrations — add a new one.`);
        console.log(`  ✔ ${file} (already applied)`);
        continue;
      }
      if (statusOnly) { console.log(`  … ${file} (PENDING)`); continue; }
      process.stdout.write(`  → applying ${file} … `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log('done'); ran++;
      } catch (e) { await client.query('ROLLBACK'); console.log('FAILED'); throw e; }
    }
    console.log(statusOnly ? '' : `Migrations complete (${ran} applied).`);
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate({ statusOnly: process.argv.includes('--status') }).catch((e) => { console.error('\n' + e.message); process.exit(1); });
}
