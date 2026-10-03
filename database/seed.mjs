// Loads database/seed/seed.sql (generated from mock-data/*.json) into DATABASE_URL.
//   npm run db:seed            refuses if data already exists
//   npm run db:seed -- --force truncates all data tables first (local DB only; see reset.mjs guards)
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, connectionConfig } from './migrate.mjs';
import { assertLocalOrExplicit } from './guards.mjs';

export async function seed({ force = false } = {}) {
  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    const has = (await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
    if (has > 0 && !force) {
      console.error(`Database already has ${has} users. Use --force (local DB only) or npm run db:reset.`);
      process.exitCode = 1;
      return;
    }
    if (has > 0 && force) {
      assertLocalOrExplicit('seed --force');
      const t = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations'`)).rows.map((r) => `"${r.tablename}"`);
      await client.query(`TRUNCATE ${t.join(', ')} RESTART IDENTITY CASCADE`);
    }
    await client.query(readFileSync(path.join(root, 'database/seed/seed.sql'), 'utf8')); // seed.sql has its own BEGIN/COMMIT
    console.log('Seed loaded. Dev logins use password "Password@123" (see mock-data/README.md).');
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed({ force: process.argv.includes('--force') }).catch((e) => { console.error(e.message); process.exit(1); });
}
