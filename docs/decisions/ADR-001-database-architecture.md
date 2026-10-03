# ADR-001 — Database architecture: one canonical PostgreSQL schema for local and Supabase

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
The team develops against local PostgreSQL (with pgAdmin) and demos on Supabase PostgreSQL. Two hand-maintained schemas would drift within hours and cause integration failures.

## Decision
There is exactly **one** schema: ordered SQL files in `database/migrations/`, applied by `database/migrate.mjs` to whichever database `DATABASE_URL` points at (checksummed, one transaction per file, applied files immutable). pgAdmin and the Supabase dashboard are *viewers only*.

Supabase is used purely as managed Postgres. Row Level Security is **enabled with no policies** on every table (migration 0002), so the public Supabase REST/anon API can read or write nothing; **only the Express backend** connects, through `DATABASE_URL`. Extensions: only `btree_gist` (for the booking exclusion constraint); ids use the built-in `gen_random_uuid()` so both targets behave identically.

## Consequences
- ✅ Zero schema drift; reproducible resets; migrations reviewed like code.
- ✅ A leaked Supabase anon key exposes nothing.
- ⚠️ No supabase-js shortcuts from the browser (we give up instant CRUD, gain security and a single auth model).
- ⚠️ Developers write SQL migrations rather than clicking in a GUI.

## Alternatives considered
Prisma/Drizzle migrations (extra tooling to learn in 12 h) · separate SQL per environment (drift) · Supabase-only schema (no offline development).
