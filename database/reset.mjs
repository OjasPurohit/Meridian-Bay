// Drops everything in schema `public`, re-applies ALL migrations, then loads the seed.
//   npm run db:reset                  (local database only)
// GUARDS (a reset on Supabase would destroy production data):
//   1. ALLOW_DB_RESET=true must be set explicitly
//   2. the DATABASE_URL host must be localhost / 127.0.0.1 / ::1 (Supabase hosts are always refused)
import 'dotenv/config';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectionConfig, migrate } from './migrate.mjs';
import { assertLocalOrExplicit } from './guards.mjs';
import { seed } from './seed.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertLocalOrExplicit('db:reset');
  const client = new pg.Client(connectionConfig());
  await client.connect();
  try {
    await client.query('DROP EXTENSION IF EXISTS btree_gist CASCADE'); // re-created by migration 0001
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('Schema public dropped and recreated.');
  } finally { await client.end(); }
  await migrate();
  await seed({ force: false });
}
