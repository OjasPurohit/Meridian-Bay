-- =====================================================================================
-- 0003 — Database cleanup: one fact, one place  (additive-safe; no table is dropped, no data is lost)
-- Runs in ONE transaction (database/migrate.mjs wraps each file) — any failed precondition rolls everything back.
-- Local PostgreSQL and Supabase run this identical file. Compatible with PostgreSQL 15+ (STORED generated columns only).
--
-- Decision record: docs/decisions/ADR-015-derived-data-not-stored.md
--
-- WHAT THIS MIGRATION DOES
--   1. memberships.status        -> REMOVED. ACTIVE / EXPIRED (and UPCOMING / CANCELLED / CHANGED) are DERIVED from the
--                                   term dates by the views membership_terms and member_membership_status.
--                                   "At most one current term per member" is now an exclusion constraint on the date range.
--   2. shop_orders.channel       -> generated column (PHYSICAL <=> fulfillment = IN_STORE, R-SHOP-06)
--   3. court_bookings.customer_type -> generated column (MEMBER <=> member_id, WALK_IN <=> guest_name)
--   4. payroll_payments.status   -> generated column (PENDING <=> paid_on IS NULL, R-FIN-10)
--   5. notifications.is_read     -> generated column (read_at IS NOT NULL)
--      (2-5 keep the column in the API/row types, so no contract change, but the value can never drift from its source)
--   6. payments.status           -> KEPT (FAILED cannot be derived: ADR-011 gateway swap). A CHECK now ties it to refunded_amount.
--
-- WHAT THIS MIGRATION DELIBERATELY KEEPS (each is required — see the COMMENTs at the bottom and docs/database/DATABASE_SCHEMA.md)
--   bar_tables, bar_tabs, order_status_events, quotes  — FR-BAR-002/006/007/013, FR-KIT-*, FR-ENQ-006, R-BAR-03/04/06/07, R-ENQ-03
--   membership_id snapshots on bookings / shop / bar orders — R-MEM-11, R-COURT-05, R-MEM-04 probe
--   staff.is_active (R-HR-03), enquiry_follow_ups.next_follow_up_at (history of what was promised, vs. the live value on enquiries)
-- =====================================================================================

-- ------------------------------------------------------------------ 0. PRECONDITIONS
-- Abort (and roll back) when existing rows contradict a derivation; nothing is silently rewritten.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM shop_orders
   WHERE channel IS DISTINCT FROM (CASE WHEN fulfillment = 'IN_STORE' THEN 'PHYSICAL' ELSE 'ONLINE' END)::order_channel;
  IF n > 0 THEN RAISE EXCEPTION '0003 aborted: % shop_orders row(s) have a channel that contradicts fulfillment (IN_STORE <=> PHYSICAL). Fix them first.', n; END IF;

  SELECT count(*) INTO n FROM court_bookings
   WHERE customer_type IS DISTINCT FROM (CASE WHEN member_id IS NOT NULL THEN 'MEMBER' WHEN guest_name IS NOT NULL THEN 'WALK_IN' END)::customer_type;
  IF n > 0 THEN RAISE EXCEPTION '0003 aborted: % court_bookings row(s) have a customer_type that contradicts member_id / guest_name. Fix them first.', n; END IF;

  SELECT count(*) INTO n FROM payroll_payments WHERE status = 'PENDING' AND paid_on IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION '0003 aborted: % payroll_payments row(s) are PENDING but have a paid_on date. Fix them first.', n; END IF;

  SELECT count(*) INTO n FROM memberships WHERE cancelled_at IS NOT NULL AND status NOT IN ('CANCELLED', 'CHANGED');
  IF n > 0 THEN RAISE EXCEPTION '0003 aborted: % memberships row(s) have cancelled_at but a status other than CANCELLED/CHANGED. Fix them first.', n; END IF;

  SELECT count(*) INTO n FROM payments
   WHERE NOT ((status IN ('SUCCEEDED', 'FAILED') AND refunded_amount = 0)
           OR (status = 'PARTIALLY_REFUNDED' AND refunded_amount > 0 AND refunded_amount < amount)
           OR (status = 'REFUNDED' AND refunded_amount = amount));
  IF n > 0 THEN RAISE EXCEPTION '0003 aborted: % payments row(s) have a status that contradicts refunded_amount. Fix them first.', n; END IF;
END $$;

-- ------------------------------------------------------------------ 1. DATA NORMALISATION (no information is lost)
-- The updated_at trigger is paused so back-filled rows keep their real last-modified time.
ALTER TABLE memberships      DISABLE TRIGGER trg_memberships_updated_at;
ALTER TABLE payroll_payments DISABLE TRIGGER trg_payroll_payments_updated_at;

-- "Term ended early" is now recorded by cancelled_at alone (cancelled, or superseded by a plan change = CHANGED).
UPDATE memberships SET cancelled_at = ((end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
 WHERE status = 'CHANGED' AND cancelled_at IS NULL;          -- a plan change ends the old term the day before the new one starts (R-MEM-08)
UPDATE memberships SET cancelled_at = updated_at
 WHERE status = 'CANCELLED' AND cancelled_at IS NULL;

-- A PAID payroll row must say when it was paid (status will be derived from paid_on).
UPDATE payroll_payments SET paid_on = (updated_at AT TIME ZONE 'Asia/Kolkata')::date
 WHERE status = 'PAID' AND paid_on IS NULL;

ALTER TABLE memberships      ENABLE TRIGGER trg_memberships_updated_at;
ALTER TABLE payroll_payments ENABLE TRIGGER trg_payroll_payments_updated_at;

-- Read state: read_at is the single fact.
UPDATE notifications SET read_at = created_at WHERE is_read AND read_at IS NULL;
UPDATE notifications SET read_at = NULL       WHERE NOT is_read AND read_at IS NOT NULL;

-- Two live terms of one member may never overlap (replaces "one ACTIVE row per member"); cancelled/superseded terms are exempt.
DO $$
DECLARE n bigint; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT count(*) INTO n FROM memberships a JOIN memberships b ON a.member_id = b.member_id AND a.id < b.id
   WHERE a.cancelled_at IS NULL AND b.cancelled_at IS NULL
     AND daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]');
  IF n > 0 THEN RAISE EXCEPTION '0003 aborted: % pair(s) of overlapping membership terms for the same member. Fix them first.', n; END IF;

  SELECT count(*) INTO n FROM memberships m
   WHERE m.status::text <> CASE
           WHEN m.cancelled_at IS NOT NULL AND EXISTS (SELECT 1 FROM memberships s WHERE s.previous_membership_id = m.id) THEN 'CHANGED'
           WHEN m.cancelled_at IS NOT NULL THEN 'CANCELLED'
           WHEN m.end_date < today THEN 'EXPIRED'
           WHEN m.start_date > today THEN 'UPCOMING'
           ELSE 'ACTIVE' END;
  RAISE NOTICE '0003: % membership row(s) have a stored status different from the date-derived status (expected only where the daily expiry job had not run yet)', n;
END $$;

-- ------------------------------------------------------------------ 2. memberships: status is derived from dates
ALTER TABLE memberships DROP COLUMN status;   -- also drops memberships_one_active_per_member and memberships_expiry_idx (both used status)

ALTER TABLE memberships ADD CONSTRAINT memberships_no_overlap
  EXCLUDE USING gist (member_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (cancelled_at IS NULL);
CREATE INDEX memberships_end_date_idx ON memberships (end_date) WHERE cancelled_at IS NULL;                 -- expiring-soon list / expiry job
CREATE INDEX memberships_previous_idx ON memberships (previous_membership_id) WHERE previous_membership_id IS NOT NULL;  -- "was this term superseded?"

-- One row per term + its derived status.  UPCOMING: not started; ACTIVE: today within start..end; EXPIRED: end passed;
-- CANCELLED: ended early by the owner; CHANGED: ended early and followed by a linked later term (plan change).  IST date (R-DATA-01).
CREATE VIEW membership_terms WITH (security_invoker = true) AS
SELECT m.id, m.member_id, m.membership_plan_id, m.start_date, m.end_date, m.price_paid,
       m.previous_membership_id, m.cancelled_at, m.cancellation_reason, m.created_by_user_id, m.created_at, m.updated_at,
       (CASE
          WHEN m.cancelled_at IS NOT NULL AND EXISTS (SELECT 1 FROM memberships s WHERE s.previous_membership_id = m.id) THEN 'CHANGED'
          WHEN m.cancelled_at IS NOT NULL THEN 'CANCELLED'
          WHEN m.end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'EXPIRED'
          WHEN m.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'UPCOMING'
          ELSE 'ACTIVE'
        END)::membership_status AS status
  FROM memberships m;

-- One row per MEMBER: Gold/Silver/Junior (membership_type) and whether it is ACTIVE or EXPIRED right now.
-- membership_status is NULL when the member never had a plan (walk-in rates apply, R-MEM-05).
CREATE VIEW member_membership_status WITH (security_invoker = true) AS
SELECT mb.id AS member_id,
       t.id AS membership_id, t.membership_plan_id, p.membership_type, t.start_date, t.end_date,
       (CASE WHEN t.id IS NULL THEN NULL WHEN t.status = 'ACTIVE' THEN 'ACTIVE' ELSE 'EXPIRED' END)::membership_status AS membership_status,
       (CASE WHEN t.status = 'ACTIVE' THEN t.end_date - (now() AT TIME ZONE 'Asia/Kolkata')::date END) AS days_remaining
  FROM members mb
  LEFT JOIN LATERAL (
        SELECT x.* FROM membership_terms x
         WHERE x.member_id = mb.id AND x.status <> 'UPCOMING'
         ORDER BY (x.status = 'ACTIVE') DESC, x.end_date DESC
         LIMIT 1) t ON true
  LEFT JOIN membership_plans p ON p.id = t.membership_plan_id;

-- ------------------------------------------------------------------ 3. shop_orders.channel (derived from fulfillment)
ALTER TABLE shop_orders DROP COLUMN channel;   -- also drops the two CHECKs that mention channel (re-added below)
ALTER TABLE shop_orders ADD COLUMN channel order_channel GENERATED ALWAYS AS (CASE WHEN fulfillment = 'IN_STORE' THEN 'PHYSICAL'::order_channel ELSE 'ONLINE'::order_channel END) STORED NOT NULL;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_online_needs_member CHECK (channel <> 'ONLINE' OR member_id IS NOT NULL);
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_customer_known CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL OR channel = 'PHYSICAL');

-- ------------------------------------------------------------------ 4. court_bookings.customer_type (derived from member_id / guest_name)
ALTER TABLE court_bookings DROP COLUMN customer_type;   -- also drops the customer-shape CHECK (re-added below)
ALTER TABLE court_bookings ADD COLUMN customer_type customer_type GENERATED ALWAYS AS (CASE WHEN member_id IS NOT NULL THEN 'MEMBER'::customer_type WHEN guest_name IS NOT NULL THEN 'WALK_IN'::customer_type END) STORED;
ALTER TABLE court_bookings ADD CONSTRAINT court_bookings_customer_known CHECK (customer_type IS NOT NULL OR booking_type IN ('SOCIAL_SESSION', 'MAINTENANCE'));

-- ------------------------------------------------------------------ 5. payroll_payments.status (derived from paid_on)
ALTER TABLE payroll_payments DROP COLUMN status;
ALTER TABLE payroll_payments ADD COLUMN status payroll_status GENERATED ALWAYS AS (CASE WHEN paid_on IS NULL THEN 'PENDING'::payroll_status ELSE 'PAID'::payroll_status END) STORED NOT NULL;

-- ------------------------------------------------------------------ 6. notifications.is_read (derived from read_at)
ALTER TABLE notifications DROP COLUMN is_read;   -- also drops notifications_user_idx (recreated below)
ALTER TABLE notifications ADD COLUMN is_read boolean GENERATED ALWAYS AS (read_at IS NOT NULL) STORED NOT NULL;
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

-- ------------------------------------------------------------------ 7. payments.status stays stored, but may no longer disagree with refunded_amount
ALTER TABLE payments ADD CONSTRAINT payments_status_matches_refund CHECK (
     (status IN ('SUCCEEDED', 'FAILED') AND refunded_amount = 0)
  OR (status = 'PARTIALLY_REFUNDED' AND refunded_amount > 0 AND refunded_amount < amount)
  OR (status = 'REFUNDED' AND refunded_amount = amount));

-- ------------------------------------------------------------------ 8. SECURITY for the new views (same posture as migration 0002)
-- security_invoker => the caller's RLS applies; and Supabase's anon/authenticated roles get nothing. Only the backend reads them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON membership_terms, member_membership_status FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON membership_terms, member_membership_status FROM authenticated';
  END IF;
END $$;

-- ------------------------------------------------------------------ 9. DOCUMENTATION in the database itself (visible in pgAdmin / psql \d+)
COMMENT ON VIEW membership_terms IS 'memberships + derived status (UPCOMING/ACTIVE/EXPIRED/CANCELLED/CHANGED). Status is computed from dates and cancelled_at, never stored (R-MEM-04).';
COMMENT ON VIEW member_membership_status IS 'One row per member: current (or latest) plan type and membership_status ACTIVE/EXPIRED (NULL = never had a plan).';
COMMENT ON COLUMN memberships.cancelled_at IS 'Set when the term ended early: cancelled by the owner (R-MEM-09) or superseded by a plan change (R-MEM-08). end_date is then the last day benefits applied.';
COMMENT ON COLUMN memberships.previous_membership_id IS 'Chain of terms: set on renewal and plan change. A cancelled term that has a successor is reported as CHANGED.';
COMMENT ON COLUMN memberships.price_paid IS 'Price at purchase (snapshot, R-MEM-11): a later plan price edit never rewrites it.';
COMMENT ON COLUMN shop_orders.channel IS 'GENERATED: PHYSICAL when fulfillment = IN_STORE, otherwise ONLINE (R-SHOP-06). Not writable.';
COMMENT ON COLUMN court_bookings.customer_type IS 'GENERATED: MEMBER when member_id is set, WALK_IN when guest_name is set, NULL for social-session holds / maintenance. Not writable.';
COMMENT ON COLUMN payroll_payments.status IS 'GENERATED: PENDING until paid_on is set, then PAID (R-FIN-10). Not writable.';
COMMENT ON COLUMN notifications.is_read IS 'GENERATED: read_at IS NOT NULL. Write read_at, not this column.';
COMMENT ON COLUMN payments.status IS 'Kept stored: FAILED (real gateway, ADR-011) is not derivable. CHECK payments_status_matches_refund ties it to refunded_amount.';
COMMENT ON COLUMN court_bookings.membership_id IS 'Snapshot of the term whose discount was applied at booking time (R-MEM-11, R-COURT-05).';
COMMENT ON COLUMN shop_orders.membership_id IS 'Snapshot of the term whose discount was applied at order time (R-MEM-11, R-SHOP-04).';
COMMENT ON COLUMN bar_orders.membership_id IS 'Snapshot of the term whose discount was applied at order time (R-MEM-11, R-BAR-01).';
COMMENT ON COLUMN staff.is_active IS 'Kept with users.is_active: R-HR-03 sets both when an employee is deactivated (login blocked, history kept).';
COMMENT ON COLUMN enquiry_follow_ups.next_follow_up_at IS 'What was promised at THAT contact (history). enquiries.next_follow_up_at is the live value, editable by enquiries.update.';
COMMENT ON TABLE bar_tables IS 'Physical bar/cafeteria tables with a staff-managed status (FR-BAR-002, R-BAR-06). Read by the kitchen board.';
COMMENT ON TABLE bar_tabs IS 'A member''s or guest''s running bill, settled by ONE payment (FR-BAR-006/007/013, R-BAR-03/04).';
COMMENT ON TABLE order_status_events IS 'Append-only kitchen status trail written on every transition (R-BAR-07, ADR-009).';
COMMENT ON TABLE quotes IS 'Quotes sent for an enquiry (FR-ENQ-006, R-ENQ-03) with QT-n numbers, validity and lifecycle.';
