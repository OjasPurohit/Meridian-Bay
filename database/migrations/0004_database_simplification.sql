-- =====================================================================================
-- 0004 — Database simplification: 31 tables -> 22.  One table = one real-world thing, one column = one fact.
-- Runs in ONE transaction (database/migrate.mjs wraps each file): any failed precondition rolls EVERYTHING back.
-- Decision record: docs/decisions/ADR-016-database-simplification.md  (builds on ADR-015 / migration 0003).
--
-- TABLES REMOVED (9)
--   order_status_events  kitchen status log — no reader, bar_orders.status is the state
--   bar_tabs, bar_tables running tab + table management -> a cafe order carries an optional table_label and is paid by itself
--   quotes, enquiry_follow_ups  CRM pipeline -> enquiries is a plain inbox (handled_at)
--   notifications        every message was derivable from live data (new enquiries, expiring memberships, low stock ...)
--   inventory_movements  stock ledger -> products.stock_quantity is the stock
--   social_sessions, social_session_participants  Friday social play is not part of the product any more
--                        (history is kept: each session's court hold becomes an ordinary booking carrying the participant payments)
-- DERIVED VALUES REMOVED  (computed by views instead; one fact, one place)
--   amount due / totals / payment status of bookings, shop orders, cafe orders and invoices, payments.status,
--   payments.revenue_category, memberships.status (already 0003), booking status, line_total, tax copies on source rows ...
-- DATA SAFETY
--   * payments are never deleted: tab payments are split pro rata across the tab's orders (totals unchanged),
--     social-play payments are re-pointed to the converted court booking;
--   * every column that is discarded and still holds values is announced with RAISE NOTICE (the backup is the way back);
--   * unexpected data (FAILED payments, orphan payment sources, inconsistent totals ...) RAISES and rolls everything back;
--   * revenue per category (net of refunds) and tax collected are asserted unchanged at the end.
-- DELIBERATELY KEPT (existing history must not be lost): payments.payer_name / refund_reason / refunded_at / notes,
--   members.joined_on, memberships.cancelled_at + cancellation_reason, invoices.member_id (membership invoices),
--   business_clients exactly as they are (a client may have no login, FR-INVC-001 / built clients module).
-- =====================================================================================

-- ------------------------------------------------------------------ 0. PRECONDITIONS
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM payments WHERE status = 'FAILED';
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % FAILED payment row(s); the simplified ledger has no FAILED state', n; END IF;

  -- every payment source must resolve, otherwise re-pointing / the new views would hide a pre-existing problem
  SELECT count(*) INTO n FROM payments p WHERE NOT CASE p.source_type
      WHEN 'COURT_BOOKING'      THEN EXISTS (SELECT 1 FROM court_bookings x WHERE x.id = p.source_id)
      WHEN 'SOCIAL_PARTICIPANT' THEN EXISTS (SELECT 1 FROM social_session_participants x WHERE x.id = p.source_id)
      WHEN 'MEMBERSHIP'         THEN EXISTS (SELECT 1 FROM memberships x WHERE x.id = p.source_id)
      WHEN 'SHOP_ORDER'         THEN EXISTS (SELECT 1 FROM shop_orders x WHERE x.id = p.source_id)
      WHEN 'BAR_ORDER'          THEN EXISTS (SELECT 1 FROM bar_orders x WHERE x.id = p.source_id)
      WHEN 'TAB'                THEN EXISTS (SELECT 1 FROM bar_tabs x WHERE x.id = p.source_id)
      WHEN 'INVOICE'            THEN EXISTS (SELECT 1 FROM invoices x WHERE x.id = p.source_id)
    END;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % payment(s) point at a source row that does not exist', n; END IF;

  SELECT count(*) INTO n FROM payments p WHERE p.source_type = 'TAB'
     AND (SELECT coalesce(sum(o.total_amount), 0) FROM bar_orders o WHERE o.bar_tab_id = p.source_id AND o.status <> 'CANCELLED') = 0;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % tab payment(s) whose tab has no billable order (cannot be split)', n; END IF;

  -- a stored value that is about to become derived must already equal what the derivation gives
  SELECT count(*) INTO n FROM court_bookings WHERE amount_due <> list_price - discount_amount;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % court_bookings row(s) with amount_due <> list_price - discount_amount', n; END IF;
  SELECT count(*) INTO n FROM shop_order_items WHERE line_total <> unit_price * quantity;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % shop_order_items row(s) with line_total <> unit_price * quantity', n; END IF;
  SELECT count(*) INTO n FROM bar_order_items WHERE line_total <> unit_price * quantity;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % bar_order_items row(s) with line_total <> unit_price * quantity', n; END IF;
  SELECT count(*) INTO n FROM invoice_items WHERE line_total <> unit_price * quantity;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % invoice_items row(s) with line_total <> unit_price * quantity', n; END IF;
  SELECT count(*) INTO n FROM shop_orders o
   WHERE o.subtotal <> coalesce((SELECT sum(i.unit_price * i.quantity) FROM shop_order_items i WHERE i.shop_order_id = o.id), 0)
      OR o.total_amount <> o.subtotal - o.discount_amount + o.delivery_fee;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % shop_orders row(s) whose subtotal/total disagree with their lines', n; END IF;
  SELECT count(*) INTO n FROM bar_orders o
   WHERE o.subtotal <> coalesce((SELECT sum(i.unit_price * i.quantity) FROM bar_order_items i WHERE i.bar_order_id = o.id), 0)
      OR o.total_amount <> o.subtotal - o.discount_amount;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % bar_orders row(s) whose subtotal/total disagree with their lines', n; END IF;
  SELECT count(*) INTO n FROM invoices v
   WHERE v.subtotal <> coalesce((SELECT sum(i.unit_price * i.quantity) FROM invoice_items i WHERE i.invoice_id = v.id), 0)
      OR v.tax_amount <> round(v.subtotal * v.tax_rate / 100, 2)
      OR v.total_amount <> v.subtotal + v.tax_amount
      OR v.amount_paid <> coalesce((SELECT sum(p.amount - p.refunded_amount) FROM payments p WHERE p.source_type = 'INVOICE' AND p.source_id = v.id), 0);
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % invoices row(s) whose stored totals/amount_paid disagree with their lines/payments', n; END IF;

  SELECT count(*) INTO n FROM staff s JOIN users u ON u.id = s.user_id WHERE s.is_active <> u.is_active;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % staff row(s) whose is_active differs from users.is_active', n; END IF;
  SELECT count(*) INTO n FROM court_bookings WHERE cancelled_at IS NOT NULL AND status <> 'CANCELLED';
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % court_bookings row(s) with cancelled_at but a status other than CANCELLED', n; END IF;
  SELECT count(*) INTO n FROM bar_orders o
   WHERE o.member_id IS NULL AND o.guest_name IS NULL AND o.bar_table_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM bar_tabs t WHERE t.id = o.bar_tab_id);
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % bar_orders row(s) with no customer and no table', n; END IF;
END $$;

-- ------------------------------------------------------------------ 1. SNAPSHOT (compared at the end) + DISCARD LOG
CREATE TEMP TABLE _pre_revenue ON COMMIT DROP AS
  SELECT revenue_category::text AS category, sum(amount - refunded_amount) AS net, sum(tax_amount) AS tax
    FROM payments GROUP BY revenue_category;

-- Everything below is dropped. Say what still holds data, so nothing is discarded silently (restore point: the pg_dump backup).
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT t, c FROM (VALUES
      ('users','last_login_at'), ('members','notes'), ('members','created_by_user_id'),
      ('staff','employee_code'), ('staff','default_area'), ('membership_plans','min_age'),
      ('memberships','previous_membership_id'), ('memberships','created_by_user_id'),
      ('enquiries','source'), ('enquiries','assigned_to_user_id'), ('enquiries','next_follow_up_at'), ('enquiries','converted_member_id'),
      ('enquiries','lost_reason'), ('enquiries','created_by_user_id'),
      ('court_bookings','membership_id'), ('court_bookings','enquiry_id'), ('court_bookings','tax_amount'), ('court_bookings','notes'),
      ('court_bookings','cancelled_by_user_id'), ('court_bookings','cancellation_reason'), ('court_bookings','created_by_user_id'),
      ('shop_orders','membership_id'), ('shop_orders','tax_amount'), ('shop_orders','notes'), ('shop_orders','placed_by_user_id'),
      ('shop_orders','completed_at'), ('shop_orders','cancelled_at'), ('shop_orders','cancellation_reason'),
      ('bar_orders','membership_id'), ('bar_orders','tax_amount'), ('bar_orders','taken_by_user_id'), ('bar_orders','ready_at'),
      ('bar_orders','served_at'), ('bar_orders','cancelled_at'), ('bar_orders','cancellation_reason'),
      ('invoices','sent_at'), ('invoices','voided_at'), ('invoices','created_by_user_id'),
      ('staff_shifts','notes'), ('staff_shifts','created_by_user_id'),
      ('leave_requests','decided_by_user_id'), ('leave_requests','decided_at'),
      ('payroll_payments','paid_by_user_id'), ('payroll_payments','notes'), ('club_settings','updated_by_user_id')
    ) AS v(t, c)
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I IS NOT NULL', r.t, r.c) INTO n;
    IF n > 0 THEN RAISE NOTICE '0004 discards %.% (% non-null value(s))', r.t, r.c, n; END IF;
  END LOOP;
  FOR r IN SELECT t FROM (VALUES ('order_status_events'), ('bar_tabs'), ('bar_tables'), ('quotes'), ('enquiry_follow_ups'),
                                 ('notifications'), ('inventory_movements'), ('social_sessions'), ('social_session_participants')) AS v(t)
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.t) INTO n;
    RAISE NOTICE '0004 drops table % (% row(s))', r.t, n;
  END LOOP;
END $$;

-- ------------------------------------------------------------------ 2. DATA CONVERSIONS (before anything is dropped)
-- The updated_at trigger is paused so converted rows keep their real last-modified time.
ALTER TABLE court_bookings DISABLE TRIGGER trg_court_bookings_updated_at;
ALTER TABLE payments       DISABLE TRIGGER trg_payments_updated_at;
ALTER TABLE bar_orders     DISABLE TRIGGER trg_bar_orders_updated_at;
ALTER TABLE enquiries      DISABLE TRIGGER trg_enquiries_updated_at;
ALTER TABLE memberships    DISABLE TRIGGER trg_memberships_updated_at;

-- 2a. Social play -> ordinary bookings. The session's court hold becomes a REGULAR guest booking named after the session;
--     its price is what the JOINED participants owed, and their payments now belong to that booking (revenue unchanged).
UPDATE payments p SET source_type = 'COURT_BOOKING', source_id = s.court_booking_id
  FROM social_session_participants sp JOIN social_sessions s ON s.id = sp.social_session_id
 WHERE p.source_type = 'SOCIAL_PARTICIPANT' AND p.source_id = sp.id;

UPDATE court_bookings b
   SET guest_name = 'Social play: ' || s.title,
       list_price = coalesce((SELECT sum(sp.fee_amount) FROM social_session_participants sp WHERE sp.social_session_id = s.id AND sp.status = 'JOINED'), 0),
       discount_amount = 0
  FROM social_sessions s WHERE s.court_booking_id = b.id;
UPDATE court_bookings SET amount_due = list_price - discount_amount;

-- 2b. Cancelled bookings carry their cancellation time (status is derived from it).
UPDATE court_bookings SET cancelled_at = updated_at WHERE status = 'CANCELLED' AND cancelled_at IS NULL;

-- 2c. Cafe: a tab's customer and table label move onto its orders; each TAB payment is split across the tab's billable orders.
ALTER TABLE bar_orders ADD COLUMN table_label text;
UPDATE bar_orders o SET table_label = coalesce(
    (SELECT bt.label FROM bar_tables bt WHERE bt.id = o.bar_table_id),
    (SELECT bt.label FROM bar_tabs t JOIN bar_tables bt ON bt.id = t.bar_table_id WHERE t.id = o.bar_tab_id));
UPDATE bar_orders o SET member_id = coalesce(o.member_id, t.member_id), guest_name = coalesce(o.guest_name, t.guest_name)
  FROM bar_tabs t WHERE t.id = o.bar_tab_id;

DO $$
DECLARE
  p record; o record; n int; i int; sum_t numeric;
  alloc_a numeric; alloc_t numeric; alloc_r numeric; sh_a numeric; sh_t numeric; sh_r numeric;
  note text := 'Tab settlement split across its orders (migration 0004)';
BEGIN
  FOR p IN SELECT * FROM payments WHERE source_type = 'TAB' ORDER BY paid_at, id LOOP
    SELECT count(*), sum(total_amount) INTO n, sum_t FROM bar_orders WHERE bar_tab_id = p.source_id AND status <> 'CANCELLED' AND total_amount > 0;
    i := 0; alloc_a := 0; alloc_t := 0; alloc_r := 0;
    FOR o IN SELECT id, total_amount FROM bar_orders WHERE bar_tab_id = p.source_id AND status <> 'CANCELLED' AND total_amount > 0 ORDER BY created_at, id LOOP
      i := i + 1;
      IF i = n THEN   -- the last order absorbs the rounding remainder, so the shares add up exactly
        sh_a := p.amount - alloc_a; sh_t := p.tax_amount - alloc_t; sh_r := p.refunded_amount - alloc_r;
      ELSE
        sh_a := round(p.amount * o.total_amount / sum_t, 2); sh_t := round(p.tax_amount * o.total_amount / sum_t, 2); sh_r := round(p.refunded_amount * o.total_amount / sum_t, 2);
      END IF;
      alloc_a := alloc_a + sh_a; alloc_t := alloc_t + sh_t; alloc_r := alloc_r + sh_r;
      IF i = 1 THEN   -- the original payment row (id, number, paid_at) is kept for the first order
        UPDATE payments SET source_type = 'BAR_ORDER', source_id = o.id, amount = sh_a, tax_amount = sh_t, refunded_amount = sh_r,
               status = CASE WHEN sh_r = 0 THEN 'SUCCEEDED' WHEN sh_r >= sh_a THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END::payment_txn_status,
               notes = concat_ws('; ', notes, note)
         WHERE id = p.id;
      ELSE
        INSERT INTO payments (source_type, source_id, revenue_category, member_id, business_client_id, payer_name, amount, tax_amount, method, status,
                              gateway_reference, received_by_user_id, paid_at, refunded_amount, refund_reason, refunded_at, notes)
        VALUES ('BAR_ORDER', o.id, p.revenue_category, p.member_id, p.business_client_id, p.payer_name, sh_a, sh_t, p.method,
                CASE WHEN sh_r = 0 THEN 'SUCCEEDED' WHEN sh_r >= sh_a THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END::payment_txn_status,
                p.gateway_reference, p.received_by_user_id, p.paid_at, sh_r, p.refund_reason, p.refunded_at, concat_ws('; ', p.notes, note));
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 2d. Enquiries: "handled" = anything past NEW (time of the last follow-up, else last update).
ALTER TABLE enquiries ADD COLUMN handled_at timestamptz;
UPDATE enquiries e
   SET handled_at = coalesce((SELECT max(f.followed_up_at) FROM enquiry_follow_ups f WHERE f.enquiry_id = e.id), e.updated_at)
 WHERE e.status <> 'NEW';

-- 2e. Memberships: a term replaced by a plan change simply ENDED (its end_date is already the day before the next term).
--     Only a real cancellation keeps cancelled_at.
UPDATE memberships m SET cancelled_at = NULL, cancellation_reason = NULL
 WHERE m.cancelled_at IS NOT NULL AND EXISTS (SELECT 1 FROM memberships s WHERE s.previous_membership_id = m.id);

ALTER TABLE court_bookings ENABLE TRIGGER trg_court_bookings_updated_at;
ALTER TABLE payments       ENABLE TRIGGER trg_payments_updated_at;
ALTER TABLE bar_orders     ENABLE TRIGGER trg_bar_orders_updated_at;
ALTER TABLE enquiries      ENABLE TRIGGER trg_enquiries_updated_at;
ALTER TABLE memberships    ENABLE TRIGGER trg_memberships_updated_at;

-- ------------------------------------------------------------------ 3. DROP THE OBSOLETE VIEWS (re-created at the end on the new types)
DROP VIEW member_membership_status;
DROP VIEW membership_terms;

-- ------------------------------------------------------------------ 4. DROP THE OBSOLETE TABLES (children first)
DROP TABLE order_status_events;
DROP TABLE enquiry_follow_ups;
DROP TABLE quotes;
DROP TABLE notifications;
DROP TABLE inventory_movements;
DROP TABLE social_session_participants;
DROP TABLE social_sessions;
ALTER TABLE bar_orders DROP COLUMN bar_table_id, DROP COLUMN bar_tab_id;   -- the two FKs that held the cafe tables/tabs together
DROP TABLE bar_tabs;
DROP TABLE bar_tables;

-- ------------------------------------------------------------------ 5. DROP THE REDUNDANT COLUMNS
-- Constraints that mention a column that goes away are dropped first and re-created (section 7) in their new form.
ALTER TABLE court_bookings DROP CONSTRAINT court_bookings_no_overlap;
ALTER TABLE court_bookings DROP CONSTRAINT court_bookings_customer_known;
ALTER TABLE shop_orders DROP CONSTRAINT shop_orders_online_needs_member;
ALTER TABLE shop_orders DROP CONSTRAINT shop_orders_customer_known;

ALTER TABLE users DROP COLUMN last_login_at;
ALTER TABLE members DROP COLUMN notes, DROP COLUMN created_by_user_id;
ALTER TABLE staff DROP COLUMN employee_code, DROP COLUMN default_area, DROP COLUMN is_active;   -- account state lives in users.is_active
ALTER TABLE membership_plans DROP COLUMN min_age;
ALTER TABLE memberships DROP COLUMN previous_membership_id, DROP COLUMN created_by_user_id;
ALTER TABLE enquiries DROP COLUMN source, DROP COLUMN status, DROP COLUMN assigned_to_user_id, DROP COLUMN next_follow_up_at,
                      DROP COLUMN converted_member_id, DROP COLUMN lost_reason, DROP COLUMN created_by_user_id;
ALTER TABLE court_bookings DROP COLUMN customer_type, DROP COLUMN status, DROP COLUMN membership_id, DROP COLUMN enquiry_id, DROP COLUMN amount_due,
                           DROP COLUMN tax_amount, DROP COLUMN payment_status, DROP COLUMN notes, DROP COLUMN cancelled_by_user_id,
                           DROP COLUMN cancellation_reason, DROP COLUMN created_by_user_id;   -- also drops court_bookings_no_overlap (re-created below)
ALTER TABLE shop_orders DROP COLUMN channel, DROP COLUMN membership_id, DROP COLUMN subtotal, DROP COLUMN tax_amount, DROP COLUMN total_amount,
                        DROP COLUMN payment_status, DROP COLUMN notes, DROP COLUMN placed_by_user_id, DROP COLUMN completed_at,
                        DROP COLUMN cancelled_at, DROP COLUMN cancellation_reason;
ALTER TABLE shop_order_items DROP COLUMN line_total;
ALTER TABLE bar_orders DROP COLUMN membership_id, DROP COLUMN subtotal, DROP COLUMN tax_amount, DROP COLUMN total_amount, DROP COLUMN payment_status,
                       DROP COLUMN taken_by_user_id, DROP COLUMN ready_at, DROP COLUMN served_at, DROP COLUMN cancelled_at, DROP COLUMN cancellation_reason;
ALTER TABLE bar_order_items DROP COLUMN line_total;
ALTER TABLE payments DROP COLUMN status, DROP COLUMN revenue_category;
ALTER TABLE invoices DROP COLUMN invoice_type, DROP COLUMN subtotal, DROP COLUMN tax_amount, DROP COLUMN total_amount, DROP COLUMN amount_paid,
                     DROP COLUMN sent_at, DROP COLUMN voided_at, DROP COLUMN created_by_user_id;
ALTER TABLE invoice_items DROP COLUMN line_total;
ALTER TABLE staff_shifts DROP COLUMN notes, DROP COLUMN created_by_user_id;
ALTER TABLE leave_requests DROP COLUMN leave_type, DROP COLUMN decided_by_user_id, DROP COLUMN decided_at;
ALTER TABLE payroll_payments DROP COLUMN status, DROP COLUMN paid_by_user_id, DROP COLUMN notes;
ALTER TABLE club_settings DROP COLUMN updated_by_user_id;

-- ------------------------------------------------------------------ 6. ENUM TYPES: shrink the ones that stay, drop the ones nothing uses
-- booking_type: REGULAR | MAINTENANCE (a trial is an ordinary guest booking; social holds were converted above)
ALTER TYPE booking_type RENAME TO booking_type_old;
CREATE TYPE booking_type AS ENUM ('REGULAR','MAINTENANCE');
ALTER TABLE court_bookings ALTER COLUMN booking_type DROP DEFAULT;
ALTER TABLE court_bookings ALTER COLUMN booking_type TYPE booking_type USING (CASE booking_type::text WHEN 'MAINTENANCE' THEN 'MAINTENANCE' ELSE 'REGULAR' END)::booking_type;
ALTER TABLE court_bookings ALTER COLUMN booking_type SET DEFAULT 'REGULAR';
DROP TYPE booking_type_old;

-- order_status: the kitchen flow is NEW -> PREPARING -> READY -> SERVED (a cafe order that was ACCEPTED had not been started: NEW)
ALTER TYPE order_status RENAME TO order_status_old;
CREATE TYPE order_status AS ENUM ('NEW','PREPARING','READY','SERVED','CANCELLED');
ALTER TABLE bar_orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE bar_orders ALTER COLUMN status TYPE order_status USING (CASE status::text WHEN 'ACCEPTED' THEN 'NEW' ELSE status::text END)::order_status;
ALTER TABLE bar_orders ALTER COLUMN status SET DEFAULT 'NEW';
DROP TYPE order_status_old;

-- payment_source_type: what a payment pays for (social participants and tabs no longer exist)
ALTER TYPE payment_source_type RENAME TO payment_source_type_old;
CREATE TYPE payment_source_type AS ENUM ('COURT_BOOKING','MEMBERSHIP','SHOP_ORDER','BAR_ORDER','INVOICE');
ALTER TABLE payments ALTER COLUMN source_type TYPE payment_source_type USING source_type::text::payment_source_type;
DROP TYPE payment_source_type_old;

-- invoice_status: the stored lifecycle only. Paid / partially paid / overdue are derived (view invoice_totals).
ALTER TYPE invoice_status RENAME TO invoice_status_old;
CREATE TYPE invoice_status AS ENUM ('DRAFT','SENT','VOID');
ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT;
ALTER TABLE invoices ALTER COLUMN status TYPE invoice_status USING (CASE status::text WHEN 'DRAFT' THEN 'DRAFT' WHEN 'VOID' THEN 'VOID' ELSE 'SENT' END)::invoice_status;
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'DRAFT';
DROP TYPE invoice_status_old;

-- Types that are no longer stored anywhere but are returned by the derived views: re-created with only the values still meaningful.
DROP TYPE membership_status;
CREATE TYPE membership_status AS ENUM ('UPCOMING','ACTIVE','EXPIRED','CANCELLED');
DROP TYPE booking_status;
CREATE TYPE booking_status AS ENUM ('CONFIRMED','CANCELLED','COMPLETED');
DROP TYPE payment_status;
CREATE TYPE payment_status AS ENUM ('PENDING','PARTIALLY_PAID','PAID','REFUNDED','NOT_REQUIRED');
DROP TYPE payment_txn_status;
CREATE TYPE payment_txn_status AS ENUM ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED');
CREATE TYPE invoice_payment_state AS ENUM ('UNPAID','PARTIALLY_PAID','PAID','OVERDUE');

DROP TYPE table_status, tab_status, quote_status, follow_up_method, notification_type, inventory_reason, social_session_status,
          participant_status, enquiry_source, enquiry_status, leave_type, payroll_status, customer_type, order_channel;
DROP SEQUENCE seq_tab_number, seq_quote_number, seq_employee_code;

-- ------------------------------------------------------------------ 7. CONSTRAINTS & INDEXES that the dropped columns took with them
ALTER TABLE court_bookings ADD CONSTRAINT court_bookings_no_overlap
  EXCLUDE USING gist (court_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&) WHERE (cancelled_at IS NULL);   -- ADR-006; cancelled_at replaces status
ALTER TABLE court_bookings ADD CONSTRAINT court_bookings_customer_known
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL OR booking_type = 'MAINTENANCE');
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_online_needs_member CHECK (fulfillment = 'IN_STORE' OR member_id IS NOT NULL);
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_customer_known CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL OR fulfillment = 'IN_STORE');
ALTER TABLE bar_orders ADD CONSTRAINT bar_orders_customer_known CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL OR table_label IS NOT NULL);
ALTER TABLE invoices ADD CONSTRAINT invoices_one_recipient CHECK ((business_client_id IS NOT NULL) <> (member_id IS NOT NULL));
CREATE INDEX enquiries_open_idx ON enquiries (created_at DESC) WHERE handled_at IS NULL;   -- the front desk's inbox

-- ------------------------------------------------------------------ 8. DERIVED VALUES: one function + read-only views (IST date, R-DATA-01)
-- "How much of this bill is paid?" is answered the same way for every payable thing.
CREATE FUNCTION payment_state(amount_due numeric, gross_paid numeric, net_paid numeric) RETURNS payment_status
LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN amount_due = 0 THEN 'NOT_REQUIRED'
               WHEN gross_paid = 0 THEN 'PENDING'
               WHEN net_paid <= 0 THEN 'REFUNDED'
               WHEN net_paid < amount_due THEN 'PARTIALLY_PAID'
               ELSE 'PAID' END)::payment_status
$$;

-- Membership: member + plan + start/end date. ACTIVE / EXPIRED (UPCOMING, CANCELLED) are computed, never stored.
CREATE VIEW membership_terms WITH (security_invoker = true) AS
SELECT m.id, m.member_id, m.membership_plan_id, m.start_date, m.end_date, m.price_paid, m.cancelled_at, m.cancellation_reason, m.created_at, m.updated_at,
       (CASE
          WHEN m.cancelled_at IS NOT NULL THEN 'CANCELLED'
          WHEN m.end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'EXPIRED'
          WHEN m.start_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'UPCOMING'
          ELSE 'ACTIVE'
        END)::membership_status AS status
  FROM memberships m;

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

-- Court booking: derived status, amount due, amount paid (net of refunds) and payment status (a cancelled booking nobody paid is NOT_REQUIRED).
CREATE VIEW court_booking_totals WITH (security_invoker = true) AS
SELECT b.id AS court_booking_id,
       (CASE WHEN b.cancelled_at IS NOT NULL THEN 'CANCELLED' WHEN b.end_at <= now() THEN 'COMPLETED' ELSE 'CONFIRMED' END)::booking_status AS status,
       (b.list_price - b.discount_amount)::numeric(12,2) AS amount_due,
       coalesce(p.net, 0)::numeric(12,2) AS amount_paid,
       payment_state(CASE WHEN b.cancelled_at IS NOT NULL AND coalesce(p.gross, 0) = 0 THEN 0 ELSE b.list_price - b.discount_amount END, coalesce(p.gross, 0), coalesce(p.net, 0)) AS payment_status
  FROM court_bookings b
  LEFT JOIN LATERAL (SELECT sum(x.amount) AS gross, sum(x.amount - x.refunded_amount) AS net
                       FROM payments x WHERE x.source_type = 'COURT_BOOKING' AND x.source_id = b.id) p ON true;

-- Shop order: subtotal from its lines, total = subtotal - discount + delivery fee, and its payment status.
CREATE VIEW shop_order_totals WITH (security_invoker = true) AS
SELECT o.id AS shop_order_id,
       l.subtotal::numeric(12,2) AS subtotal,
       (l.subtotal - o.discount_amount + o.delivery_fee)::numeric(12,2) AS total_amount,
       coalesce(p.net, 0)::numeric(12,2) AS amount_paid,
       payment_state(CASE WHEN o.status = 'CANCELLED' AND coalesce(p.gross, 0) = 0 THEN 0 ELSE l.subtotal - o.discount_amount + o.delivery_fee END, coalesce(p.gross, 0), coalesce(p.net, 0)) AS payment_status
  FROM shop_orders o
  LEFT JOIN LATERAL (SELECT coalesce(sum(i.unit_price * i.quantity), 0) AS subtotal FROM shop_order_items i WHERE i.shop_order_id = o.id) l ON true
  LEFT JOIN LATERAL (SELECT sum(x.amount) AS gross, sum(x.amount - x.refunded_amount) AS net
                       FROM payments x WHERE x.source_type = 'SHOP_ORDER' AND x.source_id = o.id) p ON true;

-- Cafe order: same shape as a shop order (no delivery fee).
CREATE VIEW bar_order_totals WITH (security_invoker = true) AS
SELECT o.id AS bar_order_id,
       l.subtotal::numeric(12,2) AS subtotal,
       (l.subtotal - o.discount_amount)::numeric(12,2) AS total_amount,
       coalesce(p.net, 0)::numeric(12,2) AS amount_paid,
       payment_state(CASE WHEN o.status = 'CANCELLED' AND coalesce(p.gross, 0) = 0 THEN 0 ELSE l.subtotal - o.discount_amount END, coalesce(p.gross, 0), coalesce(p.net, 0)) AS payment_status
  FROM bar_orders o
  LEFT JOIN LATERAL (SELECT coalesce(sum(i.unit_price * i.quantity), 0) AS subtotal FROM bar_order_items i WHERE i.bar_order_id = o.id) l ON true
  LEFT JOIN LATERAL (SELECT sum(x.amount) AS gross, sum(x.amount - x.refunded_amount) AS net
                       FROM payments x WHERE x.source_type = 'BAR_ORDER' AND x.source_id = o.id) p ON true;

-- Invoice (tax-exclusive, R-FIN-03): totals from its lines and tax_rate, amount paid from payments, and the derived payment state.
CREATE VIEW invoice_totals WITH (security_invoker = true) AS
SELECT v.id AS invoice_id,
       (CASE WHEN v.business_client_id IS NOT NULL THEN 'BUSINESS' ELSE 'MEMBERSHIP' END)::invoice_type AS invoice_type,
       l.subtotal::numeric(12,2) AS subtotal,
       round(l.subtotal * v.tax_rate / 100, 2)::numeric(12,2) AS tax_amount,
       (l.subtotal + round(l.subtotal * v.tax_rate / 100, 2))::numeric(12,2) AS total_amount,
       coalesce(p.net, 0)::numeric(12,2) AS amount_paid,
       (CASE WHEN v.status <> 'SENT' THEN NULL
             WHEN coalesce(p.net, 0) >= l.subtotal + round(l.subtotal * v.tax_rate / 100, 2) THEN 'PAID'
             WHEN v.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'OVERDUE'
             WHEN coalesce(p.net, 0) > 0 THEN 'PARTIALLY_PAID'
             ELSE 'UNPAID' END)::invoice_payment_state AS payment_state
  FROM invoices v
  LEFT JOIN LATERAL (SELECT coalesce(sum(i.unit_price * i.quantity), 0) AS subtotal FROM invoice_items i WHERE i.invoice_id = v.id) l ON true
  LEFT JOIN LATERAL (SELECT sum(x.amount - x.refunded_amount) AS net FROM payments x WHERE x.source_type = 'INVOICE' AND x.source_id = v.id) p ON true;

-- Payment: which revenue stream it belongs to and whether it has been refunded. Reports group by this.
CREATE VIEW payment_ledger WITH (security_invoker = true) AS
SELECT p.id AS payment_id,
       (CASE p.source_type
          WHEN 'COURT_BOOKING' THEN 'COURT'
          WHEN 'MEMBERSHIP'    THEN 'MEMBERSHIP'
          WHEN 'SHOP_ORDER'    THEN 'SHOP'
          WHEN 'BAR_ORDER'     THEN 'BAR'
          WHEN 'INVOICE'       THEN CASE WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.id = p.source_id AND i.business_client_id IS NOT NULL) THEN 'BUSINESS' ELSE 'MEMBERSHIP' END
        END)::revenue_category AS revenue_category,
       (CASE WHEN p.refunded_amount = 0 THEN 'SUCCEEDED' WHEN p.refunded_amount >= p.amount THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END)::payment_txn_status AS status
  FROM payments p;

-- ------------------------------------------------------------------ 8b. SETTINGS of the features that no longer exist
DO $$
DECLARE n bigint;
BEGIN
  DELETE FROM club_settings WHERE key IN ('social_play_weekday', 'social_play_start_time', 'social_play_end_time');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '0004 removes % club_settings row(s) of the retired social-play feature', n;
END $$;

-- ------------------------------------------------------------------ 9. SECURITY (same posture as migration 0002: only the backend reads data)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON membership_terms, member_membership_status, court_booking_totals, shop_order_totals, bar_order_totals, invoice_totals, payment_ledger FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION payment_state(numeric, numeric, numeric) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON membership_terms, member_membership_status, court_booking_totals, shop_order_totals, bar_order_totals, invoice_totals, payment_ledger FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION payment_state(numeric, numeric, numeric) FROM authenticated';
  END IF;
END $$;

-- ------------------------------------------------------------------ 10. FINAL ASSERTIONS: no revenue lost, nothing orphaned
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM (
      (SELECT category, net, tax FROM _pre_revenue
       EXCEPT
       SELECT l.revenue_category::text, sum(p.amount - p.refunded_amount), sum(p.tax_amount) FROM payments p JOIN payment_ledger l ON l.payment_id = p.id GROUP BY 1)
      UNION ALL
      (SELECT l.revenue_category::text, sum(p.amount - p.refunded_amount), sum(p.tax_amount) FROM payments p JOIN payment_ledger l ON l.payment_id = p.id GROUP BY 1
       EXCEPT
       SELECT category, net, tax FROM _pre_revenue)
  ) d;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: revenue / tax per category changed during the migration (% category row(s) differ)', n; END IF;

  SELECT count(*) INTO n FROM payments p WHERE NOT CASE p.source_type
      WHEN 'COURT_BOOKING' THEN EXISTS (SELECT 1 FROM court_bookings x WHERE x.id = p.source_id)
      WHEN 'MEMBERSHIP'    THEN EXISTS (SELECT 1 FROM memberships x WHERE x.id = p.source_id)
      WHEN 'SHOP_ORDER'    THEN EXISTS (SELECT 1 FROM shop_orders x WHERE x.id = p.source_id)
      WHEN 'BAR_ORDER'     THEN EXISTS (SELECT 1 FROM bar_orders x WHERE x.id = p.source_id)
      WHEN 'INVOICE'       THEN EXISTS (SELECT 1 FROM invoices x WHERE x.id = p.source_id)
    END;
  IF n > 0 THEN RAISE EXCEPTION '0004 aborted: % payment(s) lost their source row', n; END IF;
END $$;

-- ------------------------------------------------------------------ 11. DOCUMENTATION in the database itself (pgAdmin / psql \d+)
COMMENT ON VIEW membership_terms IS 'memberships + derived status (UPCOMING/ACTIVE/EXPIRED/CANCELLED) computed from the dates and cancelled_at, never stored (R-MEM-04).';
COMMENT ON VIEW member_membership_status IS 'One row per member: current or latest plan type and membership_status ACTIVE/EXPIRED (NULL = never had a plan).';
COMMENT ON VIEW court_booking_totals IS 'Per court booking: derived status, amount_due = list_price - discount_amount, amount_paid (net of refunds) and payment_status.';
COMMENT ON VIEW shop_order_totals IS 'Per shop order: subtotal from its lines, total_amount = subtotal - discount + delivery fee, amount_paid and payment_status.';
COMMENT ON VIEW bar_order_totals IS 'Per cafe order: subtotal from its lines, total_amount = subtotal - discount, amount_paid and payment_status.';
COMMENT ON VIEW invoice_totals IS 'Per invoice: subtotal and tax from its lines and tax_rate, total_amount, amount_paid and the derived payment_state (NULL unless SENT).';
COMMENT ON VIEW payment_ledger IS 'Per payment: revenue_category (from what it pays for) and status SUCCEEDED/PARTIALLY_REFUNDED/REFUNDED (from refunded_amount).';
COMMENT ON FUNCTION payment_state(numeric, numeric, numeric) IS 'Payment status of one bill from its amount due, gross paid and net paid (after refunds). Used by every *_totals view.';
COMMENT ON COLUMN memberships.cancelled_at IS 'Set only when the owner cancels a term (R-MEM-09). A replaced or finished term just has an earlier end_date.';
COMMENT ON COLUMN memberships.price_paid IS 'Price at purchase (snapshot, R-MEM-11): a later plan price edit never rewrites it.';
COMMENT ON COLUMN court_bookings.cancelled_at IS 'NULL = the booking stands. The exclusion constraint only guards bookings that are not cancelled.';
COMMENT ON COLUMN court_bookings.list_price IS 'Walk-in price at booking time (snapshot). amount due = list_price - discount_amount (view court_booking_totals).';
COMMENT ON COLUMN court_bookings.discount_amount IS 'Member discount granted at booking time (snapshot, R-MEM-11).';
COMMENT ON COLUMN bar_orders.table_label IS 'Free-text table or seat the cafe order is served at (replaces the former bar_tables / bar_tabs).';
COMMENT ON COLUMN enquiries.handled_at IS 'NULL = new, waiting for the front desk. Set when somebody has dealt with the enquiry.';
COMMENT ON COLUMN payments.source_type IS 'What this payment pays for. Together with source_id a deliberate polymorphic reference (ADR-009), no FK.';
COMMENT ON COLUMN payments.tax_amount IS 'GST portion of amount at payment time (snapshot): reports sum this column (R-FIN-07).';
