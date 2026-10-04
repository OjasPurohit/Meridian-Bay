-- =====================================================================================
-- 0005 — Store Manager replaces the Business Client login; employee job applications
--
-- 1. user_role: BUSINESS_CLIENT is removed, STORE_MANAGER is added. Any user that held BUSINESS_CLIENT becomes a
--    STORE_MANAGER with a staff row (nothing is deleted, so payments / invoices that point at them keep working).
-- 2. business_clients stays (companies the owner invoices) but loses its portal login: user_id is dropped.
-- 3. employee_applications: a JOB APPLICATION is not an employee. It holds the applicant's bcrypt hash only while it
--    is PENDING (so the applicant can log in to see "under review"); the hash is cleared on approval/rejection.
-- Preconditions are asserted first; the migration fails (and rolls back) on anything unexpected.
-- =====================================================================================

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM users WHERE role = 'BUSINESS_CLIENT' AND NOT is_active;
  IF n > 0 THEN RAISE EXCEPTION '0005: inactive BUSINESS_CLIENT users exist (%) - resolve before migrating', n; END IF;
END $$;

-- ------------------------------------------------------------------ 1. role enum swap
ALTER TYPE user_role RENAME TO user_role_old;
CREATE TYPE user_role AS ENUM ('MEMBER','FRONT_DESK','KITCHEN_MANAGER','STORE_MANAGER','OWNER_ADMIN');
ALTER TABLE users ALTER COLUMN role TYPE user_role
  USING (CASE role::text WHEN 'BUSINESS_CLIENT' THEN 'STORE_MANAGER' ELSE role::text END)::user_role;
DROP TYPE user_role_old;

-- Former business-client logins are club staff now: give them a staff row and a club email.
UPDATE users u SET email = lower(regexp_replace(u.full_name, '[^A-Za-z]+', '.', 'g')) || '@championsclub.example'
  WHERE u.role = 'STORE_MANAGER' AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM users o WHERE o.id <> u.id AND lower(o.email) = lower(regexp_replace(u.full_name, '[^A-Za-z]+', '.', 'g')) || '@championsclub.example');
INSERT INTO staff (user_id, designation, monthly_salary)
  SELECT u.id, 'Store Manager', 38000 FROM users u
  WHERE u.role = 'STORE_MANAGER' AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id);

-- ------------------------------------------------------------------ 2. business clients: invoiced companies only
ALTER TABLE business_clients DROP COLUMN user_id;

-- ------------------------------------------------------------------ 3. job applications
CREATE TYPE application_status AS ENUM ('PENDING','APPROVED','REJECTED');

CREATE TABLE employee_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            text NOT NULL,
  email                text NOT NULL,
  phone                text,
  password_hash        text,                                   -- bcrypt; only while PENDING, cleared on a decision
  status               application_status NOT NULL DEFAULT 'PENDING',
  approved_role        user_role,                              -- set on APPROVED: FRONT_DESK | KITCHEN_MANAGER | STORE_MANAGER
  applied_at           timestamptz NOT NULL DEFAULT now(),
  reviewed_at          timestamptz,
  reviewed_by_user_id  uuid REFERENCES users(id),
  decision_note        text,
  CHECK ((status = 'PENDING') = (password_hash IS NOT NULL)),
  CHECK ((status = 'PENDING') = (reviewed_at IS NULL)),
  CHECK ((status = 'APPROVED') = (approved_role IS NOT NULL)),
  CHECK (approved_role IS NULL OR approved_role IN ('FRONT_DESK','KITCHEN_MANAGER','STORE_MANAGER'))
);
CREATE UNIQUE INDEX employee_applications_pending_email_key ON employee_applications (lower(email)) WHERE status = 'PENDING';
CREATE INDEX employee_applications_status_idx ON employee_applications (status, applied_at DESC);

-- same lock-down as every other table (0002): only the backend reads or writes it
ALTER TABLE employee_applications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE employee_applications FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE employee_applications FROM authenticated';
  END IF;
END $$;
