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
