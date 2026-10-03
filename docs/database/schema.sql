-- GENERATED snapshot: concatenation of database/migrations/*.sql in order. DO NOT EDIT — edit/add migrations instead.
-- Regenerate: npm run docs:build

-- ===== 0001_init.sql =====
-- =====================================================================================
-- The Champions Club — CANONICAL SCHEMA (migration 0001)
-- Target: PostgreSQL 15+ (local Postgres AND Supabase Postgres run this identical file).
-- Conventions: see docs/database/DATABASE_SCHEMA.md
--   tables snake_case plural | columns snake_case | PK `id uuid` | FK `<entity>_id`
--   money NUMERIC(12,2) INR | timestamps TIMESTAMPTZ (UTC) | dates DATE (IST business date)
--   enum labels mirror shared/constants/enums.ts EXACTLY (tools/check-consistency.mjs enforces)
-- NEVER edit this file after it has been applied anywhere: add 0003_*.sql, 0004_*.sql ...
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint (no double-booking)

-- ------------------------------------------------------------------ ENUMS
CREATE TYPE user_role AS ENUM ('MEMBER','FRONT_DESK','KITCHEN_MANAGER','BUSINESS_CLIENT','OWNER_ADMIN');
CREATE TYPE membership_type AS ENUM ('GOLD','SILVER','JUNIOR');
CREATE TYPE membership_status AS ENUM ('UPCOMING','ACTIVE','EXPIRED','CANCELLED','CHANGED');
CREATE TYPE sport_type AS ENUM ('TENNIS','CRICKET','PADEL','BADMINTON');
CREATE TYPE booking_type AS ENUM ('REGULAR','SOCIAL_SESSION','TRIAL','MAINTENANCE');
CREATE TYPE booking_status AS ENUM ('PENDING','CONFIRMED','CANCELLED','COMPLETED');
CREATE TYPE customer_type AS ENUM ('MEMBER','WALK_IN');
CREATE TYPE social_session_status AS ENUM ('OPEN','CANCELLED','COMPLETED');
CREATE TYPE participant_status AS ENUM ('JOINED','CANCELLED');
CREATE TYPE product_category AS ENUM ('RACKET','BALL','SHOES','ACCESSORY','APPAREL');
CREATE TYPE menu_category AS ENUM ('FOOD','SNACK','DRINK');
CREATE TYPE order_channel AS ENUM ('PHYSICAL','ONLINE');
CREATE TYPE order_fulfillment AS ENUM ('PICKUP','DELIVERY','IN_STORE');
CREATE TYPE shop_order_status AS ENUM ('PLACED','CONFIRMED','READY_FOR_PICKUP','OUT_FOR_DELIVERY','COMPLETED','CANCELLED');
CREATE TYPE order_status AS ENUM ('NEW','ACCEPTED','PREPARING','READY','SERVED','CANCELLED');
CREATE TYPE table_status AS ENUM ('AVAILABLE','OCCUPIED','OUT_OF_SERVICE');
CREATE TYPE tab_status AS ENUM ('OPEN','SETTLED','VOID');
CREATE TYPE payment_method AS ENUM ('CASH','CARD','UPI','ONLINE');
CREATE TYPE payment_status AS ENUM ('PENDING','PARTIALLY_PAID','PAID','REFUNDED','FAILED','NOT_REQUIRED');
CREATE TYPE payment_txn_status AS ENUM ('SUCCEEDED','FAILED','PARTIALLY_REFUNDED','REFUNDED');
CREATE TYPE payment_source_type AS ENUM ('COURT_BOOKING','SOCIAL_PARTICIPANT','MEMBERSHIP','SHOP_ORDER','BAR_ORDER','TAB','INVOICE');
CREATE TYPE revenue_category AS ENUM ('COURT','MEMBERSHIP','SHOP','BAR','BUSINESS');
CREATE TYPE invoice_type AS ENUM ('BUSINESS','MEMBERSHIP');
CREATE TYPE invoice_status AS ENUM ('DRAFT','SENT','PARTIALLY_PAID','PAID','OVERDUE','VOID');
CREATE TYPE enquiry_type AS ENUM ('GENERAL','TRIAL','MEMBERSHIP','BUSINESS');
CREATE TYPE enquiry_source AS ENUM ('WEBSITE','PHONE','WALK_IN');
CREATE TYPE enquiry_status AS ENUM ('NEW','CONTACTED','QUOTE_SENT','FOLLOW_UP','CONVERTED','LOST');
CREATE TYPE follow_up_method AS ENUM ('CALL','WHATSAPP','EMAIL','IN_PERSON');
CREATE TYPE quote_status AS ENUM ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED');
CREATE TYPE shift_area AS ENUM ('FRONT_DESK','BAR','KITCHEN','SHOP','COURTS');
CREATE TYPE leave_type AS ENUM ('CASUAL','SICK','PAID','UNPAID');
CREATE TYPE leave_status AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE payroll_status AS ENUM ('PENDING','PAID');
CREATE TYPE inventory_reason AS ENUM ('OPENING','RESTOCK','SALE','RETURN','ADJUSTMENT','DAMAGE','CANCELLATION');
CREATE TYPE notification_type AS ENUM (
  'MEMBERSHIP_EXPIRING','MEMBERSHIP_EXPIRED','BOOKING_CONFIRMED','BOOKING_CANCELLED','SOCIAL_SESSION_JOINED',
  'LOW_STOCK','SHOP_ORDER_UPDATE','ORDER_READY','NEW_ENQUIRY','INVOICE_ISSUED','PAYMENT_RECEIVED',
  'LEAVE_REQUESTED','LEAVE_DECIDED','SHIFT_ASSIGNED','SYSTEM');

-- ------------------------------------------------------------------ HUMAN-READABLE NUMBER SEQUENCES
CREATE SEQUENCE seq_member_code   START 1;
CREATE SEQUENCE seq_employee_code START 1;
CREATE SEQUENCE seq_booking_number START 1;
CREATE SEQUENCE seq_shop_order_number START 1;
CREATE SEQUENCE seq_bar_order_number START 1;
CREATE SEQUENCE seq_tab_number START 1;
CREATE SEQUENCE seq_payment_number START 1;
CREATE SEQUENCE seq_invoice_number START 1;
CREATE SEQUENCE seq_quote_number START 1;

-- ------------------------------------------------------------------ IDENTITY
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL,
  password_hash        text NOT NULL,
  role                 user_role NOT NULL,
  full_name            text NOT NULL,
  phone                text,
  is_active            boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);

-- A member = a person with a login (role MEMBER) + club profile. Gold/Silver/Junior live in memberships.
CREATE TABLE members (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE REFERENCES users(id),
  member_code              text NOT NULL UNIQUE DEFAULT ('CCM-' || lpad(nextval('seq_member_code')::text, 5, '0')),
  date_of_birth            date,
  address                  text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  photo_url                text,
  notes                    text,
  joined_on                date NOT NULL DEFAULT current_date,
  created_by_user_id       uuid REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id),
  employee_code    text NOT NULL UNIQUE DEFAULT ('EMP-' || lpad(nextval('seq_employee_code')::text, 4, '0')),
  designation      text NOT NULL,
  default_area     shift_area,
  monthly_salary   numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  joined_on        date NOT NULL DEFAULT current_date,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid UNIQUE REFERENCES users(id),     -- null = invoiced but no portal login
  company_name     text NOT NULL,
  contact_name     text NOT NULL,
  email            text NOT NULL,
  phone            text,
  gstin            text,
  billing_address  text,
  notes            text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ MEMBERSHIP
CREATE TABLE membership_plans (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_type         membership_type NOT NULL,
  name                    text NOT NULL,
  description             text,
  duration_months         integer NOT NULL CHECK (duration_months > 0),
  price                   numeric(12,2) NOT NULL CHECK (price >= 0),
  court_discount_percent  numeric(5,2) NOT NULL DEFAULT 0 CHECK (court_discount_percent BETWEEN 0 AND 100), -- 100 = free courts
  shop_discount_percent   numeric(5,2) NOT NULL DEFAULT 0 CHECK (shop_discount_percent BETWEEN 0 AND 100),
  bar_discount_percent    numeric(5,2) NOT NULL DEFAULT 0 CHECK (bar_discount_percent BETWEEN 0 AND 100),
  max_plays_per_day       integer NOT NULL DEFAULT 2 CHECK (max_plays_per_day > 0),
  min_age                 integer CHECK (min_age >= 0),
  max_age                 integer CHECK (max_age >= 0),                 -- Junior: 17 (under 18)
  benefits                text[] NOT NULL DEFAULT '{}',                 -- bullet list shown on the website
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_type, duration_months)
);

-- Every purchase / renewal / plan change is a NEW row => this table IS the membership history.
CREATE TABLE memberships (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                uuid NOT NULL REFERENCES members(id),
  membership_plan_id       uuid NOT NULL REFERENCES membership_plans(id),
  status                   membership_status NOT NULL DEFAULT 'ACTIVE',
  start_date               date NOT NULL,
  end_date                 date NOT NULL,                                -- last valid day (inclusive)
  price_paid               numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_paid >= 0),
  previous_membership_id   uuid REFERENCES memberships(id),              -- set on renewal/plan change
  cancelled_at             timestamptz,
  cancellation_reason      text,
  created_by_user_id       uuid REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX memberships_one_active_per_member ON memberships (member_id) WHERE status = 'ACTIVE';
CREATE INDEX memberships_member_idx ON memberships (member_id, start_date DESC);
CREATE INDEX memberships_expiry_idx ON memberships (end_date) WHERE status = 'ACTIVE';

-- ------------------------------------------------------------------ ENQUIRIES / CRM (before bookings: trial FK)
CREATE TABLE enquiries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_type          enquiry_type NOT NULL DEFAULT 'GENERAL',
  source                enquiry_source NOT NULL DEFAULT 'WEBSITE',
  status                enquiry_status NOT NULL DEFAULT 'NEW',
  name                  text NOT NULL,
  email                 text,
  phone                 text NOT NULL,
  message               text,
  membership_plan_id    uuid REFERENCES membership_plans(id),            -- plan they asked about
  sport_type            sport_type,                                      -- trial: preferred sport
  preferred_start_at    timestamptz,                                     -- trial: preferred slot
  assigned_to_user_id   uuid REFERENCES users(id),
  next_follow_up_at     timestamptz,
  converted_member_id   uuid REFERENCES members(id),
  lost_reason           text,
  created_by_user_id    uuid REFERENCES users(id),                       -- null when submitted from website
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_status_idx ON enquiries (status, created_at DESC);

CREATE TABLE enquiry_follow_ups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id          uuid NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  done_by_user_id     uuid NOT NULL REFERENCES users(id),
  method              follow_up_method NOT NULL,
  note                text NOT NULL,
  followed_up_at      timestamptz NOT NULL DEFAULT now(),
  next_follow_up_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiry_follow_ups_enquiry_idx ON enquiry_follow_ups (enquiry_id, followed_up_at DESC);

CREATE TABLE quotes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number        text NOT NULL UNIQUE DEFAULT ('QT-' || lpad(nextval('seq_quote_number')::text, 5, '0')),
  enquiry_id          uuid NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  membership_plan_id  uuid REFERENCES membership_plans(id),
  description         text NOT NULL,
  amount              numeric(12,2) NOT NULL CHECK (amount >= 0),
  valid_until         date NOT NULL,
  status              quote_status NOT NULL DEFAULT 'DRAFT',
  sent_at             timestamptz,
  created_by_user_id  uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ COURTS / BOOKINGS / SOCIAL PLAY
CREATE TABLE courts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL UNIQUE,
  sport_type               sport_type NOT NULL,
  description              text,
  surface                  text,
  walk_in_rate_per_hour    numeric(12,2) NOT NULL CHECK (walk_in_rate_per_hour >= 0),
  image_url                text,
  sort_order               integer NOT NULL DEFAULT 0,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- court_bookings is the ONLY table that holds court occupancy (regular, trial, social-session hold, maintenance).
CREATE TABLE court_bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number        text NOT NULL UNIQUE DEFAULT ('BK-' || lpad(nextval('seq_booking_number')::text, 6, '0')),
  court_id              uuid NOT NULL REFERENCES courts(id),
  booking_type          booking_type NOT NULL DEFAULT 'REGULAR',
  status                booking_status NOT NULL DEFAULT 'CONFIRMED',
  customer_type         customer_type,                                   -- null for SOCIAL_SESSION / MAINTENANCE
  member_id             uuid REFERENCES members(id),
  membership_id         uuid REFERENCES memberships(id),                 -- membership applied for pricing (snapshot)
  guest_name            text,
  guest_phone           text,
  enquiry_id            uuid REFERENCES enquiries(id),                   -- TRIAL bookings
  start_at              timestamptz NOT NULL,
  end_at                timestamptz NOT NULL,
  list_price            numeric(12,2) NOT NULL DEFAULT 0 CHECK (list_price >= 0),     -- walk-in price at booking time
  discount_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  amount_due            numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),     -- list_price - discount_amount (tax inclusive)
  tax_amount            numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),     -- GST portion included in amount_due
  payment_status        payment_status NOT NULL DEFAULT 'PENDING',
  notes                 text,
  cancelled_at          timestamptz,
  cancelled_by_user_id  uuid REFERENCES users(id),
  cancellation_reason   text,
  created_by_user_id    uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at = start_at + interval '1 hour'),
  CHECK (date_part('minute', start_at AT TIME ZONE 'UTC') IN (0, 30) AND date_part('second', start_at AT TIME ZONE 'UTC') = 0),
  CHECK (
    (customer_type = 'MEMBER'  AND member_id IS NOT NULL) OR
    (customer_type = 'WALK_IN' AND guest_name IS NOT NULL) OR
    (customer_type IS NULL AND booking_type IN ('SOCIAL_SESSION','MAINTENANCE'))
  ),
  -- THE double-booking guard (ADR-006). Two live bookings can never overlap on one court.
  CONSTRAINT court_bookings_no_overlap EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED','COMPLETED'))
);
CREATE INDEX court_bookings_member_idx ON court_bookings (member_id, start_at);
CREATE INDEX court_bookings_day_idx ON court_bookings (court_id, start_at);

CREATE TABLE social_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_booking_id    uuid NOT NULL UNIQUE REFERENCES court_bookings(id),  -- the SOCIAL_SESSION hold on the court
  title               text NOT NULL,
  description         text,
  capacity            integer NOT NULL CHECK (capacity >= 2),
  fee_per_person      numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_per_person >= 0), -- walk-in/guest fee; members get plan court discount
  status              social_session_status NOT NULL DEFAULT 'OPEN',
  created_by_user_id  uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE social_session_participants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_session_id   uuid NOT NULL REFERENCES social_sessions(id) ON DELETE CASCADE,
  member_id           uuid REFERENCES members(id),
  guest_name          text,
  guest_phone         text,
  status              participant_status NOT NULL DEFAULT 'JOINED',
  fee_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),   -- final fee after member discount (tax inclusive)
  tax_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  payment_status      payment_status NOT NULL DEFAULT 'PENDING',
  joined_at           timestamptz NOT NULL DEFAULT now(),
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL)
);
CREATE UNIQUE INDEX social_participant_unique_member ON social_session_participants (social_session_id, member_id)
  WHERE status = 'JOINED' AND member_id IS NOT NULL;
CREATE INDEX social_participant_session_idx ON social_session_participants (social_session_id);

-- ------------------------------------------------------------------ SHOP + INVENTORY
-- Inventory = products.stock_quantity (current) + inventory_movements (ledger). One shelf for counter AND online.
CREATE TABLE products (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  text NOT NULL UNIQUE,
  name                 text NOT NULL,
  category             product_category NOT NULL,
  brand                text,
  description          text,
  price                numeric(12,2) NOT NULL CHECK (price >= 0),       -- tax inclusive
  image_url            text,
  stock_quantity       integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),  -- DB refuses negative stock
  low_stock_threshold  integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category) WHERE is_active;

CREATE TABLE shop_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         text NOT NULL UNIQUE DEFAULT ('SO-' || lpad(nextval('seq_shop_order_number')::text, 6, '0')),
  channel              order_channel NOT NULL,
  fulfillment          order_fulfillment NOT NULL,
  status               shop_order_status NOT NULL DEFAULT 'PLACED',
  member_id            uuid REFERENCES members(id),
  membership_id        uuid REFERENCES memberships(id),                  -- membership applied for discount (snapshot)
  guest_name           text,
  guest_phone          text,
  delivery_address     text,
  subtotal             numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  delivery_fee         numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  tax_amount           numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),    -- GST included in total_amount
  total_amount         numeric(12,2) NOT NULL CHECK (total_amount >= 0),            -- subtotal - discount + delivery_fee
  payment_status       payment_status NOT NULL DEFAULT 'PENDING',
  notes                text,
  placed_by_user_id    uuid REFERENCES users(id),
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (fulfillment <> 'DELIVERY' OR delivery_address IS NOT NULL),
  CHECK (channel <> 'ONLINE' OR member_id IS NOT NULL),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL OR channel = 'PHYSICAL')
);
CREATE INDEX shop_orders_member_idx ON shop_orders (member_id, created_at DESC);
CREATE INDEX shop_orders_status_idx ON shop_orders (status, created_at DESC);

CREATE TABLE shop_order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_order_id   uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id),
  product_name    text NOT NULL,                                          -- snapshot
  unit_price      numeric(12,2) NOT NULL CHECK (unit_price >= 0),         -- snapshot
  quantity        integer NOT NULL CHECK (quantity > 0),
  line_total      numeric(12,2) NOT NULL CHECK (line_total >= 0),         -- unit_price * quantity
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_order_id, product_id)
);

CREATE TABLE inventory_movements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES products(id),
  quantity_change     integer NOT NULL CHECK (quantity_change <> 0),     -- +restock / -sale
  quantity_after      integer NOT NULL CHECK (quantity_after >= 0),
  reason              inventory_reason NOT NULL,
  shop_order_id       uuid REFERENCES shop_orders(id),
  notes               text,
  created_by_user_id  uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements (product_id, created_at DESC);

-- ------------------------------------------------------------------ BAR / CAFETERIA / KITCHEN
CREATE TABLE bar_menu_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  category      menu_category NOT NULL,
  description   text,
  price         numeric(12,2) NOT NULL CHECK (price >= 0),               -- tax inclusive
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bar_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL UNIQUE,
  capacity    integer NOT NULL CHECK (capacity > 0),
  status      table_status NOT NULL DEFAULT 'AVAILABLE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bar_tabs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_number            text NOT NULL UNIQUE DEFAULT ('TAB-' || lpad(nextval('seq_tab_number')::text, 6, '0')),
  bar_table_id          uuid REFERENCES bar_tables(id),
  member_id             uuid REFERENCES members(id),
  guest_name            text,
  status                tab_status NOT NULL DEFAULT 'OPEN',
  opened_at             timestamptz NOT NULL DEFAULT now(),
  settled_at            timestamptz,
  opened_by_user_id     uuid REFERENCES users(id),
  settled_by_user_id    uuid REFERENCES users(id),
  subtotal              numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),         -- totals are written at settlement
  discount_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount            numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_status        payment_status NOT NULL DEFAULT 'PENDING',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL)
);
CREATE INDEX bar_tabs_status_idx ON bar_tabs (status, opened_at DESC);

CREATE TABLE bar_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         text NOT NULL UNIQUE DEFAULT ('BO-' || lpad(nextval('seq_bar_order_number')::text, 6, '0')),
  bar_table_id         uuid REFERENCES bar_tables(id),
  bar_tab_id           uuid REFERENCES bar_tabs(id),
  member_id            uuid REFERENCES members(id),
  membership_id        uuid REFERENCES memberships(id),                  -- membership applied for discount (snapshot)
  guest_name           text,
  status               order_status NOT NULL DEFAULT 'NEW',
  subtotal             numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount           numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),    -- GST included in total_amount
  total_amount         numeric(12,2) NOT NULL CHECK (total_amount >= 0),            -- subtotal - discount_amount
  payment_status       payment_status NOT NULL DEFAULT 'PENDING',
  notes                text,
  taken_by_user_id     uuid REFERENCES users(id),
  ready_at             timestamptz,
  served_at            timestamptz,
  cancelled_at         timestamptz,
  cancellation_reason  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL OR bar_table_id IS NOT NULL)
);
CREATE INDEX bar_orders_status_idx ON bar_orders (status, created_at);
CREATE INDEX bar_orders_tab_idx ON bar_orders (bar_tab_id);
CREATE INDEX bar_orders_day_idx ON bar_orders (created_at);

CREATE TABLE bar_order_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_order_id       uuid NOT NULL REFERENCES bar_orders(id) ON DELETE CASCADE,
  bar_menu_item_id   uuid NOT NULL REFERENCES bar_menu_items(id),
  item_name          text NOT NULL,                                       -- snapshot
  unit_price         numeric(12,2) NOT NULL CHECK (unit_price >= 0),      -- snapshot
  quantity           integer NOT NULL CHECK (quantity > 0),
  line_total         numeric(12,2) NOT NULL CHECK (line_total >= 0),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bar_order_items_order_idx ON bar_order_items (bar_order_id);

-- Audit trail of the kitchen flow (NEW -> ACCEPTED -> PREPARING -> READY -> SERVED)
CREATE TABLE order_status_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_order_id        uuid NOT NULL REFERENCES bar_orders(id) ON DELETE CASCADE,
  from_status         order_status,
  to_status           order_status NOT NULL,
  changed_by_user_id  uuid REFERENCES users(id),
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_order_idx ON order_status_events (bar_order_id, created_at);

-- ------------------------------------------------------------------ FINANCE
-- payments = every rupee received (the revenue ledger). Reports aggregate THIS table.
-- source_type + source_id is a deliberate polymorphic reference (see ADR-009); integrity enforced in PaymentsService.
CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number        text NOT NULL UNIQUE DEFAULT ('PAY-' || lpad(nextval('seq_payment_number')::text, 7, '0')),
  source_type           payment_source_type NOT NULL,
  source_id             uuid NOT NULL,
  revenue_category      revenue_category NOT NULL,
  member_id             uuid REFERENCES members(id),
  business_client_id    uuid REFERENCES business_clients(id),
  payer_name            text,                                             -- guests / walk-ins
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),        -- gross received (tax inclusive)
  tax_amount            numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),    -- GST portion of `amount`
  method                payment_method NOT NULL,
  status                payment_txn_status NOT NULL DEFAULT 'SUCCEEDED',
  gateway_reference     text,                                             -- UPI ref / card auth / online txn id
  received_by_user_id   uuid REFERENCES users(id),
  paid_at               timestamptz NOT NULL DEFAULT now(),
  refunded_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  refund_reason         text,
  refunded_at           timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_amount <= amount)
);
CREATE INDEX payments_paid_at_idx ON payments (paid_at);
CREATE INDEX payments_source_idx ON payments (source_type, source_id);
CREATE INDEX payments_category_idx ON payments (revenue_category, paid_at);

-- Invoices are TAX-EXCLUSIVE (B2B convention): total_amount = subtotal + tax_amount. All other prices are tax-inclusive.
CREATE TABLE invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('seq_invoice_number')::text, 5, '0')),
  invoice_type        invoice_type NOT NULL,
  business_client_id  uuid REFERENCES business_clients(id),
  member_id           uuid REFERENCES members(id),
  status              invoice_status NOT NULL DEFAULT 'DRAFT',
  issue_date          date NOT NULL DEFAULT current_date,
  due_date            date NOT NULL,
  subtotal            numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  tax_rate            numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount        numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid         numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  notes               text,
  sent_at             timestamptz,
  voided_at           timestamptz,
  created_by_user_id  uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date >= issue_date),
  CHECK (amount_paid <= total_amount),
  CHECK (
    (invoice_type = 'BUSINESS'   AND business_client_id IS NOT NULL AND member_id IS NULL) OR
    (invoice_type = 'MEMBERSHIP' AND member_id IS NOT NULL AND business_client_id IS NULL)
  )
);
CREATE INDEX invoices_client_idx ON invoices (business_client_id);
CREATE INDEX invoices_status_idx ON invoices (status, due_date);

CREATE TABLE invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  text NOT NULL,
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total   numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ STAFF / HR
CREATE TABLE staff_shifts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            uuid NOT NULL REFERENCES staff(id),
  shift_date          date NOT NULL,
  start_time          time NOT NULL,
  end_time            time NOT NULL,                                     -- same-day shifts only (end > start)
  area                shift_area NOT NULL,
  notes               text,
  created_by_user_id  uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  UNIQUE (staff_id, shift_date, start_time)
);
CREATE INDEX staff_shifts_date_idx ON staff_shifts (shift_date);

CREATE TABLE leave_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            uuid NOT NULL REFERENCES staff(id),
  leave_type          leave_type NOT NULL,
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  reason              text,
  status              leave_status NOT NULL DEFAULT 'PENDING',
  decided_by_user_id  uuid REFERENCES users(id),
  decided_at          timestamptz,
  decision_note       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX leave_requests_status_idx ON leave_requests (status, start_date);

CREATE TABLE payroll_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES staff(id),
  pay_period       date NOT NULL,                                        -- first day of the month being paid
  amount           numeric(12,2) NOT NULL CHECK (amount >= 0),
  method           payment_method NOT NULL,
  status           payroll_status NOT NULL DEFAULT 'PENDING',
  paid_on          date,
  paid_by_user_id  uuid REFERENCES users(id),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (date_part('day', pay_period) = 1),
  UNIQUE (staff_id, pay_period)
);

-- ------------------------------------------------------------------ PLATFORM
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         notification_type NOT NULL,
  title        text NOT NULL,
  body         text,
  entity_type  text,                                                      -- e.g. 'court_bookings' (table name)
  entity_id    uuid,
  is_read      boolean NOT NULL DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE club_settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  text NOT NULL UNIQUE,
  value                jsonb NOT NULL,
  description          text,
  is_public            boolean NOT NULL DEFAULT false,                    -- exposed by GET /public/club
  updated_by_user_id   uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ updated_at trigger on every table that has the column
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t.table_name, t.table_name);
  END LOOP;
END $$;

-- ===== 0002_security.sql =====
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

-- ===== 0003_database_cleanup.sql =====
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

-- ===== 0004_database_simplification.sql =====
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
