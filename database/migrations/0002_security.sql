-- =====================================================================================
-- 0002 — Security hardening (identical on local Postgres and Supabase)
-- Architecture: ONLY the backend talks to the database (ADR-001/002). The browser never uses
-- supabase-js against tables. Therefore:
--   * Row Level Security is ENABLED on every table with NO policies  => Supabase's public
--     PostgREST/anon/authenticated roles can read/write NOTHING, even if the anon key leaks.
--   * The backend connects with DATABASE_URL (role `postgres`, which bypasses RLS).
-- Authorisation of business users is done in the API layer (docs/security/PERMISSIONS_MATRIX.md).
-- =====================================================================================

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Supabase-only roles: revoke anything granted by default. Skipped automatically on plain local Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
