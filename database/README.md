# Database — one schema, two environments

```
database/migrations/0001_init.sql      ← the canonical schema (tables, enums, constraints, indexes, triggers)
database/migrations/0002_security.sql  ← RLS deny-all (Supabase) + revokes
database/migrations/000N_*.sql         ← every future change = a NEW numbered file
database/seed/seed.sql                 ← GENERATED from mock-data/*.json (never hand-edited)
database/migrate.mjs  seed.mjs  reset.mjs  guards.mjs
```

**There is exactly one definition of the schema: `database/migrations/*.sql`.** Local PostgreSQL and Supabase PostgreSQL both receive *those files* through the *same* script. Nobody edits a table in pgAdmin or in the Supabase dashboard, ever (see rule 1). Human-readable docs: [DATABASE_SCHEMA.md](../docs/database/DATABASE_SCHEMA.md) · ER diagram [er-diagram.mmd](../docs/database/er-diagram.mmd) · flat snapshot [schema.sql](../docs/database/schema.sql) (generated).

## Requirements
PostgreSQL 15+ with the `btree_gist` extension (ships with PostgreSQL's contrib; Supabase has it). Nothing else — IDs use the built-in `gen_random_uuid()`.

## Local setup (PostgreSQL + pgAdmin)

1. Install PostgreSQL 15+ and pgAdmin. In pgAdmin: *Servers → PostgreSQL → Databases → Create → Database…* name it `champions_club`.
2. `cp .env.example .env` and set `DATABASE_URL=postgresql://postgres:<your password>@localhost:5432/champions_club`, `ALLOW_DB_RESET=true`.
3. `npm install` (repo root), then:

```bash
npm run db:migrate     # apply all pending migrations
npm run mock:build     # (re)generate mock-data + seed.sql for "today" (optional; a seed for the last build is committed)
npm run db:seed        # load demo data
# or everything at once, from scratch:
npm run db:reset       # DROP schema public → migrate → seed   (local only)
```

pgAdmin is only a **viewer/query tool** here: browse tables, run `SELECT`s, inspect the ER diagram. Do not create or alter tables through the GUI.

## Supabase (cloud) setup

1. Create a Supabase project. Note the **database password** you chose.
2. Dashboard → *Project Settings → Database → Connection string* → copy the **Session pooler** (or direct) URI (port **5432**; the *transaction* pooler on 6543 is for app traffic, not for migrations).
3. Run the same script against it **from one person's machine** (the deployer):

```bash
# PowerShell
$env:DATABASE_URL="postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"; $env:DATABASE_SSL="true"
npm run db:status      # shows applied / pending
npm run db:migrate
npm run db:seed        # demo data only, for the hackathon demo environment
```
```bash
# bash
DATABASE_URL='postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres' DATABASE_SSL=true npm run db:migrate
```

4. The deployed backend gets the same `DATABASE_URL` (+ `DATABASE_SSL=true`) in its hosting environment variables.
5. `reset.mjs` and `seed --force` **refuse to run against non-local hosts** — a Supabase database can only be moved forward with new migrations.

## How a schema change works (the only way)

| Step | Who | What |
|---|---|---|
| 1 | proposer | Post the change in the team chat: table/column, why, which module. Tables are owned (see [DATABASE_SCHEMA.md](../docs/database/DATABASE_SCHEMA.md)); the owner must agree. |
| 2 | proposer | Add `database/migrations/000N_short_name.sql` (next free number — check `main` first to avoid number clashes). **Additive and idempotent where possible** (`ADD COLUMN IF NOT EXISTS`). Never edit an applied file: `migrate.mjs` checksums them and fails. |
| 3 | proposer | Update, in the SAME PR: `shared/constants/enums.ts` (new enum values), `shared/types/rows.ts`, `tools/api/endpoints.mjs` (if API changes), `tools/gen-mock.mjs` (mock rows), `tools/api/ownership.mjs` (new table purpose/owner). Run `npm run mock:build && npm run docs:build && npm run check && npm run check:db`. |
| 4 | reviewers | Another developer re-runs `npm run db:reset` locally on the PR branch. |
| 5 | deployer | After merge: `npm run db:migrate` against Supabase. |

Adding an enum label: `ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'NO_SHOW';` in a migration of its own (Postgres cannot use a new enum value inside the same transaction that adds it — `migrate.mjs` runs one file per transaction, so keep it alone).

## Keeping environments synchronised

- `schema_migrations(filename, checksum, applied_at)` records what each database has. `npm run db:status` shows pending files.
- **Rule: if it is on `main`, it must be migrated everywhere before the demo.** The deployer runs `db:migrate` against Supabase after every merge that touches `database/migrations`.
- Never hotfix Supabase directly. If someone did, capture it as a migration immediately (`pg_dump --schema-only` diff) and merge it so local matches.
- Drift check: `npm run db:status` on both databases must list identical files; for deeper checks compare `pg_dump --schema-only --no-owner` output.

## Seeding

`seed.sql` is generated from `mock-data/*.json` by `tools/gen-mock.mjs`, so mock data and database can never disagree (the generator validates every row against the parsed migrations). Dev password for every seeded account: `Password@123` (bcrypt hashes are in the JSON). **Never seed demo data into a database with real members.** Anchor date: relative to the day you ran `mock:build` — re-run it the morning of the demo so "today", "this Friday" and "expiring in 9 days" are true.

## Verification without Postgres

`npm run check:db` loads migrations + seed into an in-memory Postgres (PGlite), then proves: double-booking is rejected, off-grid slots rejected, negative stock rejected, a second ACTIVE membership rejected, and money/stock reconcile (payments ↔ invoices, stock ↔ ledger, totals ↔ lines). `npm run test:db-scripts` runs migrate/seed/reset themselves against a Postgres wire-protocol server.

## Rules (read once)

1. Schema changes only via numbered migration files; never via GUI, never by editing applied files.
2. Money is `numeric(12,2)`; timestamps are `timestamptz` (UTC); ids are `uuid`; conventions in [DATABASE_SCHEMA.md](../docs/database/DATABASE_SCHEMA.md).
3. The backend is the only client of the database (RLS has no policies). No `supabase-js` table access from the browser.
4. Don't query another module's tables directly if a service exists — call the owning module's service (see [SYSTEM_ARCHITECTURE.md](../docs/architecture/SYSTEM_ARCHITECTURE.md#5-internal-service-contracts)).
