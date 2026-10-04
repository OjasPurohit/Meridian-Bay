-- =====================================================================================
-- 0006 — Club events become real data
--
-- Events (tournaments, clinics, camps, socials) were a frontend-only demo list. `events` is the one source the owner
-- creates into and every member reads; `event_registrations` records which member signed up (one row per member and
-- event), so capacity and "Registered" come from the database too. Nothing existing is touched.
-- =====================================================================================

CREATE TYPE event_kind AS ENUM ('TOURNAMENT','CLINIC','CAMP','MIXER','SOCIAL');

CREATE TABLE events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  kind         event_kind NOT NULL,
  description  text,
  location     text NOT NULL,
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  capacity     integer NOT NULL CHECK (capacity > 0),
  fee          numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX events_start_idx ON events (start_at);

CREATE TABLE event_registrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES members(id),
  registered_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX event_registrations_member_idx ON event_registrations (member_id);

CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- same lock-down as every other table (0002): only the backend reads or writes it
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE events, event_registrations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE events, event_registrations FROM authenticated';
  END IF;
END $$;
