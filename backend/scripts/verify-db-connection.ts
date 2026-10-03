/**
 * READ-ONLY database connectivity check (`npm run verify:db` in backend/). Runs SELECTs only — it never writes,
 * migrates, seeds or resets. Uses the same pool, config and type parsers as the application.
 * Prints host / database name but never the password or any secret.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigError, getConfig } from '../src/config';
import { closePool, query } from '../src/kernel/db';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let failures = 0;
const pass = (m: string) => console.log(`  ✔ ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  ✘ ${m}`);
};

async function main(): Promise<void> {
  let config;
  try {
    config = getConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  let target = '(connection string not shown)';
  try {
    const url = new URL(config.database_url);
    target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    // e.g. an unescaped special character in the password: pg may still cope, and we must not echo the string
  }
  console.log(`database check (read-only) → ${target}  ssl=${config.database_ssl}`);

  // 1. connectivity
  const info = (await query<{ db: string; version: string }>(`SELECT current_database() AS db, current_setting('server_version') AS version`)).rows[0]!;
  pass(`connected: database "${info.db}", PostgreSQL ${info.version}`);

  // 2. extension required by the booking exclusion constraint
  const ext = await query(`SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`);
  ext.rowCount ? pass('extension btree_gist installed') : fail('extension btree_gist missing');

  // 3. migrations applied and unmodified (the SAME line-ending independent checksum as database/migrate.mjs: database/checksum.mjs)
  const { migrationChecksum } = (await import(pathToFileURL(path.join(repoRoot, 'database/checksum.mjs')).href)) as { migrationChecksum: (text: string) => string };
  const applied = new Map((await query<{ filename: string; checksum: string }>('SELECT filename, checksum FROM schema_migrations')).rows.map((r) => [r.filename, r.checksum]));
  const dir = path.join(repoRoot, 'database/migrations');
  for (const file of readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
    const checksum = migrationChecksum(readFileSync(path.join(dir, file), 'utf8'));
    if (!applied.has(file)) fail(`migration ${file} is NOT applied`);
    else if (applied.get(file) !== checksum) fail(`migration ${file} checksum differs from the file in the repository`);
    else pass(`migration ${file} applied, checksum matches`);
  }

  // 4. every table of the canonical schema exists (names from tools/api/ownership.mjs, the repo's table registry)
  const { TABLE_OWNER } = (await import(pathToFileURL(path.join(repoRoot, 'tools/api/ownership.mjs')).href)) as { TABLE_OWNER: Record<string, string> };
  const present = new Set((await query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).rows.map((r) => r.table_name));
  const missing = Object.keys(TABLE_OWNER).filter((t) => !present.has(t));
  missing.length === 0 ? pass(`all ${Object.keys(TABLE_OWNER).length} schema tables exist`) : fail(`missing tables: ${missing.join(', ')}`);

  // 5. the pg type parsers behave as documented
  const r = (await query(`SELECT 1::int8 AS big, 1.5::numeric(12,2) AS money, DATE '2026-10-03' AS d, TIMESTAMPTZ '2026-10-03 18:00:00+05:30' AS ts`)).rows[0] as Record<string, unknown>;
  r.big === 1 && r.money === '1.50' && r.d === '2026-10-03' && r.ts === '2026-10-03T12:30:00.000Z'
    ? pass('type parsers: int8→number, numeric→string, date→string, timestamptz→ISO')
    : fail(`type parsers unexpected: ${JSON.stringify(r)}`);

  // 6. informational row counts (SELECT count(*) only)
  const counts: string[] = [];
  for (const table of ['users', 'members', 'payments', 'invoices', 'club_settings']) {
    if (present.has(table)) counts.push(`${table}=${(await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]!.n}`);
  }
  console.log(`  ℹ rows: ${counts.join('  ')}`);
}

main()
  .catch((err) => {
    failures++;
    console.log(`  ✘ ${err instanceof Error ? err.message : err}`);
  })
  .finally(async () => {
    await closePool();
    console.log(failures ? `\n${failures} problem(s)` : '\ndatabase connectivity OK (no data was modified)');
    process.exit(failures ? 1 : 0);
  });
