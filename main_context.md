# Meridian Bay / The Champions Club — Main Context

This file is the single briefing for any AI agent (or new developer) who must understand, review or extend this project. Read it top to bottom once; then use the "Where is X?" index (section 17) to jump. It describes branch `final` PLUS the uncommitted "auth / signup / employee application / store manager / one menu" work (migrations 0005 - 0008). Where this file and an older doc disagree, this file wins.

> Naming: the product/brand on the website is **Meridian Bay**. The database is named `champions_club`, several settings/seed strings say "The Champions Club", and demo emails use `@championsclub.example`. They are the same club.

---

## 1. What the project is

A web application for a neighbourhood sports club (tennis, padel, cricket, badminton courts, a gear shop, a bar & café, memberships, and companies the owner invoices: "business clients", who have no login).

Users:

| Role (`users.role`) | Who | Home route |
|---|---|---|
| `OWNER_ADMIN` | Club owner | `/owner` |
| `FRONT_DESK` | Reception staff | `/front-desk` |
| `KITCHEN_MANAGER` | Bar & café / kitchen | `/kitchen` |
| `STORE_MANAGER` | Employee: products, stock, shop orders | `/store-manager` |
| `MEMBER` | A person with a login and club profile | `/member` |

Gold / Silver / Junior are **membership plans** (`membership_plans.membership_type`), NOT roles. All three log in as `MEMBER`.

Employees (FRONT_DESK, KITCHEN_MANAGER, STORE_MANAGER) do not self-register. State machine: sign-up page -> "Apply as an employee" -> `employee_applications` row `PENDING` (bcrypt hash kept only while pending) -> the applicant can log in but `POST /auth/login` answers `{state: EMPLOYEE_APPLICATION_PENDING, redirect_to: /employee-application-pending}` with NO token and NO role (the page says "Your job application is under review.") -> owner approves with a chosen role (one transaction: users + staff created with the same bcrypt hash, application `APPROVED`, hash cleared) or declines (`REJECTED`, hash cleared; the person can only get AUTH_INVALID afterwards and may apply again) -> after approval the same email/password logs in with the role's JWT and home route. Deactivation = `users.is_active=false` -> `ACCOUNT_DISABLED` at login and on every API call (5 s cache invalidated at once).
Member sign-up: details -> choose Gold / Silver / Junior (or employee) -> checkout ("Pay ₹x online", mock gateway) -> ONE request `POST /auth/signup` with `membership_plan_id` creates users + members + memberships + payments in one transaction (nothing is created if it fails).

Capabilities: public website (home, membership, shop, bar & café, enquiry form), login/sign-up, court booking (30-minute slot grid, 1-hour sessions), memberships with plan discounts, gear shop with stock, café ordering + kitchen board, payments ledger with refunds and GST, invoicing for business clients, staff/shifts/leave/payroll, owner reports and CSV export, club settings.

## 2. Architecture

```
Browser (React, Vite, :5173)
   │  fetch /api/v1/...  (Bearer JWT)
   ▼
Express API (Node + TypeScript, tsx, :4000)
   routes -> service -> repo (hand-written SQL, `pg`, no ORM)
   ▼
PostgreSQL 18 local database `champions_club`
```

- Modular monolith. Contract-first: `tools/api/endpoints.mjs` is the source of truth for the 109 endpoints; docs, OpenAPI and request types are generated from it.
- One fact, one place: totals, statuses and payment state are **derived by SQL views**, not stored (ADR-015/016).
- Money is `numeric(12,2)` serialised as 2-decimal strings; arithmetic in integer paise (`shared/lib/money.ts`). Business dates use IST (`Asia/Kolkata`), timestamps are UTC ISO strings.
- Frontend never touches the database; it only calls the API.

## 3. Repository layout

```
backend/            Express API (own package.json, tsconfig, tests)
  src/app.ts          app factory: CORS, request id, JSON, access log, /health, auto-mount modules, 404 + error handlers
  src/server.ts       entry point (loads .env, checks DB, listens)
  src/config.ts       zod-validated env -> typed config
  src/kernel/         shared infrastructure (db, auth, errors, http, validate, settings)
  src/modules/        one folder per API module (index.ts exports { basePath, router })
  scripts/verify-db-connection.ts   read-only DB health check (npm run verify:db)
database/           migrations, seed, migrate/reset/seed scripts, checksum helper
frontend/           React app (public site + 5 role dashboards)
shared/             code shared by backend, frontend and tools: constants, types, money/time libs
mock-data/          generated JSON seed rows (also loaded to build seed.sql) (no frontend-only files: the café menu is the `bar_menu_items` table everywhere)
tools/              generators, consistency checks, test scripts
docs/               contract, schema, rules, ADRs, requirements, flows (many files are GENERATED)
main_context.md     this file
```

## 4. Tech stack

- Backend: Node, Express 4, TypeScript, `pg`, `zod` (validation), `bcryptjs`, `jsonwebtoken`, `cors`, `dotenv`, `tsx` (runner). Tests: `node --test` + `tsx`, PGlite in-memory Postgres.
- Frontend: React 18, Vite, TypeScript, React Router, Tailwind CSS (tokens in `src/index.css`), lucide-react icons, hand-written SVG charts (no chart library), `@fontsource` fonts.
- Database: PostgreSQL (local 18; schema targets 15+ and Supabase), extension `btree_gist`.
- Tooling: Node scripts in `tools/`, PGlite (PG17 WASM) for DB checks, mermaid parser, swagger-parser.

## 5. Running it

```
# prerequisites: Node, PostgreSQL running with DB champions_club, root .env (git-ignored) with DATABASE_URL, JWT_SECRET, PORT=4000, CORS_ORIGINS incl. http://localhost:5173
npm install                      # root (tools + PGlite)
cd backend && npm install && npm run start      # API on :4000   (npm run dev = watch)
cd frontend && npm install && npm run dev       # web on :5173
```
- Mode is decided in `frontend/vite.config.ts`: **`npm run dev` always runs LIVE** (`VITE_API_BASE_URL` defaults to `http://localhost:4000` unless `frontend/.env.local` / the environment sets another value). **Preview mode is opt-in**: `npm run dev:preview` (`vite --mode preview`; dashboards use mock-data, login disabled, header badge "Demo data"). A production build keeps whatever the environment says (unset = preview). Header badge "Demo data" on a signed-in dashboard therefore means a preview server (or a stale one started before this config): restart the dev server.
- Demo logins, password for all: `Password@123`
  - owner@championsclub.example (OWNER_ADMIN), neha.sharma@championsclub.example (FRONT_DESK), kitchen@championsclub.example (KITCHEN_MANAGER), sanjay.gupta@championsclub.example (STORE_MANAGER), devika.rao@example.com / manish.kulkarni@example.com (PENDING job applicants: log in -> "under review" page), aarav.kapoor@example.com (MEMBER, Gold), plus priya.nair@, rohan.desai@, ... members.
- Never print or commit `.env`. `*.dump` backups are git-ignored.

## 6. Database

### 6.1 Migrations (database/migrations, applied in order, each in one transaction, checksum-verified)
- `0001_init.sql` — original 31-table schema, enums, constraints. NEVER edit.
- `0002_security.sql` — RLS enabled on tables (only the backend, a privileged role, reads data); revokes for `anon`/`authenticated`. NEVER edit.
- `0003_database_cleanup.sql` — dropped `memberships.status`; stored derived columns became generated/derived; exclusion constraint `memberships_no_overlap`; created views `membership_terms`, `member_membership_status`. NEVER edit.
- `0004_database_simplification.sql` — 31 → 22 tables (see 6.2), derived values moved to views, enum swaps. Preserves data (revenue/tax per category asserted unchanged; one TAB payment split pro rata). NEVER edit.
- `0005_store_manager_and_applications.sql` — `user_role`: BUSINESS_CLIENT removed, STORE_MANAGER added (the old business-client login user became a STORE_MANAGER with a staff row and a club email); `business_clients.user_id` dropped (companies only); new `application_status` enum + `employee_applications` table (CHECKs tie the stored hash to PENDING, approved_role to APPROVED; partial unique index = one PENDING application per email). Applied to `champions_club` after a backup (`champions_club_before_0005.dump`, git-ignored) and a dry run on a restored copy. 
- `0006_events.sql` — new `event_kind` enum, tables `events` (title, kind, description, location, start_at, end_at, capacity, fee) and `event_registrations` (id, event_id, member_id, UNIQUE(event_id, member_id)); same RLS lock-down as every table. Nothing existing touched (row counts verified unchanged on a restored copy and on `champions_club`; backup `champions_club_before_0006.dump`, git-ignored). The 4 seed events + 4 registrations (from `gen-mock.mjs`) were inserted into `champions_club` with INSERT-only SQL. Add `0009_*` for further changes.
- `0008_cafe_stock.sql` — `bar_menu_items.stock_quantity` / `low_stock_threshold` (never negative). Café menu items are not products (no SKU, not sold in the shop), so the kitchen's stock lives on the menu item; `POST /bar/menu-items/:id/stock-adjustments` (KITCHEN_MANAGER, OWNER_ADMIN) adds/subtracts, a café order takes its quantity off atomically (`OUT_OF_STOCK` when short) and a cancel gives it back. Kitchen Stock page = `StockStepper` +/-1 in live mode too (it used to show invented numbers and "not tracked").
- `0007_trial_bookings.sql` — `booking_type` gains `TRIAL` (`ALTER TYPE .. ADD VALUE`) and `court_bookings.guest_email` (text, nullable). A free public trial hour is an ordinary court booking (same table, calendar and exclusion constraint), not a new table. Applied to `champions_club` after `champions_club_before_0007.dump` (git-ignored); row counts unchanged. `tools/lib/schema.mjs` now understands `ALTER TYPE x ADD VALUE`.
- `database/migrate.mjs` applies migrations (`npm run db:migrate`, `db:status`); checksum = SHA-256 of CRLF-normalised text (`database/checksum.mjs`) so line endings do not matter. `reset.mjs`/`seed.mjs` are for throw-away databases ONLY (guarded; never run against `champions_club`).
- A scratch/testing rule used throughout: never run write tests against the real DB; use PGlite (backend tests) or a restored copy.

### 6.2 Final tables (25 + `schema_migrations`)
People/plans: `users`, `members`, `staff`, `employee_applications`, `business_clients` (invoiced companies, no login), `membership_plans`, `memberships`.
Courts: `courts`, `court_bookings`. Events: `events`, `event_registrations`.
Shop: `products`, `shop_orders`, `shop_order_items`.
Cafe: `bar_menu_items`, `bar_orders`, `bar_order_items`.
Money: `payments`, `invoices`, `invoice_items`.
Other: `enquiries`, `staff_shifts`, `leave_requests`, `payroll_payments`, `club_settings`.

Removed in 0004 (do not reintroduce): `order_status_events`, `bar_tabs`, `bar_tables` (now `bar_orders.table_label`), `quotes`, `enquiry_follow_ups`, `notifications`, `inventory_movements` (stock = `products.stock_quantity`), `social_sessions`, `social_session_participants` (old social sessions became guest bookings named "Social play: …").

Key table facts:
- `users`: email (unique case-insensitive), `password_hash` (bcrypt), `role` (MEMBER | FRONT_DESK | KITCHEN_MANAGER | STORE_MANAGER | OWNER_ADMIN), `full_name`, `phone`, `is_active`, `must_change_password`.
- `employee_applications`: id, full_name, email, phone, `password_hash` (only while PENDING), status PENDING|APPROVED|REJECTED, approved_role, applied_at, reviewed_at, reviewed_by_user_id, decision_note. A job application is NOT an employee.
- `members`: one per MEMBER user; `member_code` (CCM-00001), DOB, address, emergency contact, `joined_on`.
- `memberships`: member + plan + `start_date` + `end_date` + `price_paid` + `cancelled_at`/`cancellation_reason`. **No status column.** One row per term; the table is the history.
- `court_bookings`: `booking_type` REGULAR|MAINTENANCE; member or guest_name/phone; `start_at`/`end_at` (CHECK end = start + 1h, minute :00/:30); snapshots `list_price`, `discount_amount`; `cancelled_at`. Exclusion constraint `court_bookings_no_overlap` (court + time range, WHERE cancelled_at IS NULL) makes double booking impossible.
- `shop_orders`/`bar_orders`: header + items; items snapshot name and `unit_price`. `bar_orders.table_label` free text; CHECK: member, guest name or table label required.
- `payments`: the revenue ledger. Polymorphic `source_type` (COURT_BOOKING | MEMBERSHIP | SHOP_ORDER | BAR_ORDER | INVOICE) + `source_id`; `amount`, `tax_amount`, `method` (CASH|CARD|UPI|ONLINE), `refunded_amount`/`refund_reason`/`refunded_at` (refunds are recorded on the original row, never negative rows), `received_by_user_id`, `gateway_reference`.
- `invoices`: addressed to exactly one of `business_client_id` / `member_id`; stored status only DRAFT|SENT|VOID; `tax_rate`; lines in `invoice_items`.
- `club_settings`: key/jsonb value; 18 keys (hours, tax rates, delivery fee, cut-offs...).

### 6.3 Views and function (derived data — the heart of the design)
- `payment_state(amount_due, gross_paid, net_paid)` → PENDING | PARTIALLY_PAID | PAID | REFUNDED | NOT_REQUIRED.
- `membership_terms` — each term + derived status ACTIVE | EXPIRED | UPCOMING | CANCELLED from dates and `cancelled_at` (IST today).
- `member_membership_status` — per member: current/last term, status ACTIVE or EXPIRED, days remaining (a cancelled term reports EXPIRED here).
- `court_booking_totals` — status CONFIRMED|CANCELLED|COMPLETED, amount_due, amount_paid, payment_status.
- `shop_order_totals`, `bar_order_totals` — subtotal, total (shop adds delivery fee, minus discount), amount_paid, payment_status.
- `invoice_totals` — subtotal/tax/total from lines and `tax_rate` (tax-exclusive), amount_paid, `payment_state` UNPAID|PARTIALLY_PAID|PAID|OVERDUE (null unless SENT).
- `payment_ledger` — revenue_category (COURT|MEMBERSHIP|SHOP|BAR|BUSINESS) and txn status SUCCEEDED|PARTIALLY_REFUNDED|REFUNDED.
All views are `security_invoker`.

### 6.4 Data
The real local DB holds seed-like test data (19 users, 13 members, 6 staff, 67 payments, 6 invoices, 18 products, 14 menu items, 4 job applications, 4 events ...) generated by `tools/gen-mock.mjs`. 16 of 18 products have `image_url` set (photos in `frontend/public/media`). Writes made in the live app change this data.

## 7. Business rules (docs/business-rules/BUSINESS_RULES.md — authoritative, ID-cited)
Highlights: R-MEM-* membership (status derived, early renewal within 30 days, junior age ≤ `max_age`, plan change = old term ends yesterday + new term today at full price, cancel by owner); R-COURT-* (1-hour sessions every 30 min, bookable 60 days ahead, max plays/day from plan default 2 via advisory lock, discount from effective plan, cancellation refund if ≥ `cancellation_cutoff_hours`, maintenance blocks); R-SHOP-* (one shelf, atomic stock decrement, member discount, delivery fee unless ≥ free-delivery threshold, order state machine, cancel restores stock and refunds); R-BAR-* (auto member discount, one order = one kitchen ticket, states NEW→PREPARING→READY→SERVED, NEW→CANCELLED, and READY→PREPARING when the kitchen takes a ticket back for miscommunication; `ORDER_TRANSITIONS` in `shared/constants/rules.ts` is the one source); R-EVT-* (member registration, capacity checks, events table); R-FIN-* (prices tax-inclusive: tax = gross×rate/(100+rate); invoices tax-exclusive; partial payments only on invoices; refunds on original payment; revenue by IST date of `paid_at`; payment method by role); R-INVC-*; R-HR-* (shifts same-day non-overlapping, leave overlap rules, owner decides, rejection needs a note); R-ENQ-* (plain inbox, `handled_at`).

## 8. Backend

### 8.1 Kernel (backend/src/kernel)
- `db.ts` — pg pool, type parsers (numeric→string, date→string, timestamptz→ISO), `query`, `withTransaction`, `advisoryLock`, mapping of PG errors to API errors (unique/exclusion/check violations → `EMAIL_TAKEN`, `SKU_TAKEN`, `PAYROLL_EXISTS`, `SHIFT_OVERLAP`, `BOOKING_CONFLICT`, `MEMBERSHIP_ALREADY_ACTIVE`, `OUT_OF_STOCK`, `COURT_NAME_TAKEN`).
- `auth.ts` — JWT (HS256, jsonwebtoken): `signToken`, `verifyToken`; middleware `requireAuth` (Bearer token, re-checks `users.is_active`/role with a 5 s cache), `optionalAuth`, `requireRole(...roles)`, `callerScope`; claims: sub, role, and member_id | staff_id.
- `errors.ts` — `AppError(code)` with HTTP status from `shared/constants/errors.ts`; standard envelope `{success:false,error:{code,message,details}}`. Error codes include AUTH_*, FORBIDDEN, VALIDATION_ERROR, EVENT_NOT_FOUND, EVENT_FULL, EVENT_ENDED, COURT_NAME_TAKEN, and others per `shared/constants/errors.ts`.
- `http.ts` — `ok`, `created`, `page` (meta: page, page_size, total, total_pages), `csv`/`toCsv`, `asyncHandler`, JSON logger.
- `validate.ts` — zod helpers (`validateBody/Query/Params`, `money`, `isoDate`, pagination, strict objects).
- `settings.ts` — cached read of `club_settings` (30 s TTL) via `SettingsService.get/invalidate`.
- `config.ts` — env: NODE_ENV, PORT, CORS_ORIGINS, JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_ROUNDS, DATABASE_URL, DATABASE_SSL, PAYMENT_PROVIDER (mock).

### 8.2 Response conventions
Success `{success:true,data,meta?}`; lists paginated `?page&page_size` (default 20, max 100); all fields snake_case; enums UPPER_SNAKE; unknown body keys rejected. Prefix `/api/v1`. `/health` is outside the prefix.

### 8.3 Modules (auto-discovered; each `index.ts` exports `{basePath, router}`)
| Module (folder) | Base path | Notes |
|---|---|---|
| auth | /auth | login (active users first; else a PENDING application with a matching bcrypt hash -> EMPLOYEE_APPLICATION_PENDING, no token), signup (creates MEMBER; with `membership_plan_id` also the membership + online payment in the same transaction; rejects an email that has a PENDING application), logout, me (fresh token), change-password. bcrypt compare against a dummy hash when nothing matches. No rate limiting; `must_change_password` stored but not enforced (deliberately deferred). |
| members | /members | list (filters incl. no_plan), create (+ optional plan purchase), me, get/update (own or staff), history (union of bookings/memberships/orders/payments), memberships. `members/repo.ts` also has `summaryById`, `effectivePlan`. `members/service.ts` has `buyMembership` (used by purchase/create/change-plan) |
| memberships | /memberships | plans (public), plan create/update (owner), purchase, change-plan, cancel (owner), expiring |
| courts | /courts | list + availability (public; staff also see booking_id), create/update/block/unblock (owner). Duplicate name -> COURT_NAME_TAKEN. The owner UI (Courts & bookings) adds / edits / deactivates; deactivated courts disappear from every list |
| events | /events | list (any signed-in role; same rows for all, members also get `is_registered`), create (owner), `POST/DELETE /events/:id/registrations` (member; capacity checked in a transaction, EVENT_FULL / EVENT_ENDED). No payment is taken for a registration (the member price shown is informational) |
| bookings | /bookings | price, create, list, get, cancel (refund logic), **`POST /bookings/trial` (PUBLIC)**: a visitor's free trial hour. One transaction: advisory lock on the phone, at most one upcoming TRIAL per phone (`TRIAL_ALREADY_BOOKED`), first active court of the sport (by name) with no standing booking in the slot (else `BOOKING_CONFLICT`), INSERT `booking_type TRIAL` with list_price 0 (amount due 0, no payment). Staff may cancel trials. Logic lives in `bookings/service.ts` (also contains CourtsService) |
| shop | /shop | products (public; member_price; staff-only stock fields), product CRUD (owner; DELETE = deactivate), orders create/list/get/status/cancel |
| inventory | /inventory | list, low-stock, adjustments (owner) — logic in shop service |
| bar | /bar | menu (public), menu CRUD, orders create/list/get/cancel, daily-summary, **`GET /bar/member-lookup?q=` (FRONT_DESK, KITCHEN_MANAGER, OWNER_ADMIN)**: narrow till lookup by member number / e-mail / phone digits (6+) / name part (3+), active accounts only, at most 5, returns only `{member_id, member_code, full_name, membership_status, plan_name, membership_type, bar_discount_percent}`. The order is still priced by the server from `member_id` (R-BAR-01: Gold 80 -> 68) |
| kitchen | /kitchen | board list/get/status (no prices/payments) |
| payments | /payments | create (role/method rules, mock gateway reference `MOCK-…`), list/get (own scoping), refund (owner). Exports `recordPayment` / `refundInTx` reused by other modules inside their transactions |
| invoices | /invoices | list/get (customers see own, never DRAFT), create/update(DRAFT only)/send/void (void only if unpaid) |
| clients | /business-clients | list/create/get/update (owner only; companies the owner invoices, no login); totals from `invoice_totals` |
| staff | /staff | staff CRUD, shifts, leave requests (+decision/cancel), payroll (+pay), **job applications** (`staff/applications.ts`): `POST /staff/applications` (public), `GET /staff/applications`, `POST /staff/applications/:id/approve` {role, designation?, monthly_salary?}, `POST .../reject` {note?} |
| settings | /settings | list, patch (type-checked per key, whitelist `SETTING_KEYS`) |
| reports | /reports | dashboard, revenue, courts, memberships, shop, bar, finance, tax, export (CSV) — all OWNER_ADMIN |
| enquiries | /enquiries | public create; list/get/update (desk, owner) |
| public | /public | `/club` public club info |

### 8.4 Authorization matrix (enforced server-side)
- OWNER_ADMIN: everything (reports, settings, staff + job applications, members incl. deactivate, plans, refunds, invoices, clients).
- FRONT_DESK: members, bookings, shop orders/inventory read, enquiries, payments (own taken), own leave/shift views, bar orders.
- KITCHEN_MANAGER: kitchen board; **extension beyond the written contract for the built kitchen POS:** may create/list/cancel cafe orders, edit menu, and take CASH/CARD/UPI payments for `BAR_ORDER` only. Cannot list members, invoices or other finance data.
- STORE_MANAGER: shop products (create/edit/deactivate), inventory + adjustments, shop orders (list/status/cancel), counter payments for SHOP_ORDER only (CASH/CARD/UPI), own shifts/leave/payroll. No members, invoices, reports, cafe.
- MEMBER: own profile/memberships/bookings/shop & cafe orders/payments; may order cafe items for self (extension). Online payment only.
Own-record violations return a not-found style error rather than revealing existence.

### 8.5 Tests
`cd backend && npm test` (141 tests, ~30 s): kernel tests (config, db mapping, auth, errors, http, validate, settings, app/module discovery), clients tests, and `modules/__tests__/flows.test.ts` — HTTP flows across all roles against in-memory PGlite (migrations + seed loaded): logins, authorization, invoice payment/refund/void, booking/cancel/refund, walk-in booking, shop order/cancel/stock, cafe + kitchen state machine (incl. READY→PREPARING), events (owner create, member register/unregister, capacity checks, ended-event rejection), courts (owner create/update/deactivate, duplicate name error, availability sync), product visibility to public shop, leave/shifts/payroll, settings, reports vs ledger, public endpoints, membership purchase. The test pool has max 1 connection, so never call the settings cache inside a transaction after invalidation (settings PATCH reloads eagerly for this reason). `npx tsc -p tsconfig.json` type-checks.

## 9. Shared code (shared/)
- `constants/enums.ts` — all enums (mirrors SQL enums; `check` enforces).
- `constants/errors.ts` — error code → HTTP status/message table.
- `constants/rules.ts` — API prefix, pagination, slot constants, `ROLE_HOME_ROUTE`, `SETTING_KEYS`, state-machine transition maps (ORDER, SHOP_ORDER, INVOICE, LEAVE).
- `types/rows.ts` — row interfaces for the 25 tables (hand-maintained, checked against the migrations).
- `types/api.ts` — hand-written API view types (BookingDetail, ShopOrderDetail, InvoiceView, PaymentView, MemberSummary, AuthSession, report types ...).
- `types/requests.generated.ts` — GENERATED request/query types from the endpoint contract.
- `lib/money.ts` (paise maths, tax), `lib/time.ts` (IST helpers, slot generation, term end date).

## 10. Frontend

### 10.1 Structure
`src/main.tsx`, `App.tsx` (providers, routing), `routing.ts` (FeatureRoute registry: features add routes in their own `routes.ts`), `layouts/PublicLayout.tsx`, `components/ui/*` (buttons, hero media, placeholder art), `auth/` (AuthProvider, LoginForm/LoginMenu, roles), `api/` (`client.ts` fetch wrapper with Bearer token, `auth.ts`, `public.ts`, `dashboards.ts`), `features/`:
- `public/` homepage, login (`/login`), register (`/signup`), enquiry section.
- `membership/`, `shop/`, `bar-cafe/` public pages (the café page renders the database menu: `GET /bar/menu` -> `buildMenuSections` in `bar-cafe/menu.ts`; refetched on tab focus, no timer). The public shop (`ShopPage`) reads `GET /shop/products` (the `products` table the store manager edits), reloads on tab focus and never falls back to mock rows when a backend is configured.
- Public enquiry section (`#visit`): the TRIAL tab is the real **Book a trial** form (name, phone, e-mail, sport, preferred time) -> `POST /bookings/trial` -> confirmation with court + time; membership / other enquiries still go to `POST /enquiries`. Without a backend it is validated and kept nowhere (preview wording). The time input's `min` is aligned to a half hour so the 30-minute steps hit real slots.
- `demo/` temporary one-click demo identities. Live mode: `useAuth().demoLogin(role)` is just the normal `POST /auth/login` for the seeded account (JWT + role from the server, `/auth/me` on reload); a leftover `demo-session` token is discarded. Preview mode: the mock identity (`demo/session.ts`). `tools/e2e/demo-login.cjs` checks both.
- `dashboards/` all five role dashboards.

### 10.2 Two modes
- **Live mode** (`VITE_API_BASE_URL` set): real login (`POST /auth/login`), session JWT in `sessionStorage` key `mb.session` (re-validated by `/auth/me`), dashboards load data from the API, header badge "Live data". Public pages read courts/plans/products/club info from the API (fallback to mock if unreachable) and the enquiry form POSTs `/enquiries`.
- **Preview mode** (unset): login unavailable, dashboards open as labelled previews of mock-data via the local demo store.

### 10.3 Dashboard architecture (features/dashboards)
- `layout/DashboardLayout.tsx` shell + `nav.ts` (sidebar per role) + `useIdentity.ts`. `components/DashboardShell.tsx` has `Gate` (auth/role check; in live mode wraps pages in `LiveData`, which calls `startLive` before render).
- `routes.ts` registers lazy pages. Pages: member (`MemberCourts`, `MemberStore`, `MemberKitchen`, `MemberEvents`, `MemberOrderPage`), desk (`DeskCalendar`, `DeskBookings`, `DeskMembers`, `DeskPayments`), kitchen (`KitchenPos`, `KitchenOrders`, `KitchenHistory`, `KitchenInvoices`, `KitchenStock`, `KitchenProducts`), store manager (reuses `OwnerStore`: add/edit products, restock, shop orders), owner (`OwnerOverview` (KPI "Active courts" = the live `courts` reference array, so add / deactivate / reactivate move it after the next refetch), `OwnerAnalytics`, `OwnerMembers` (add / edit / deactivate / reactivate via `store/admin.ts`), `OwnerMemberships`, `OwnerBookings`, `OwnerStore`, `OwnerKitchen`, `OwnerPayments`, `OwnerBookings` (+ Courts section: add / edit / deactivate, and a "Deactivated courts" list with Reactivate: the owner's live load asks `/courts?include_inactive=true` into `inactiveCourts`; every other role sees active courts only), `OwnerStaff` (job applications with Approve-with-role / Decline, employees add / edit / deactivate, leave decisions), `OwnerEvents`, `OwnerEnquiries`, `OwnerReports`). `components/CourtCalendar.tsx` is the booking grid (modes desk/member), `BookingDrawers.tsx` the booking panels. `ui/kit.tsx`, `ui/charts.tsx`, `ui/forms.tsx` are shared building blocks. `status.ts` maps statuses to labels/tones.
- **Store** (`store/`): pages read one in-memory store `DemoState` (`demoStore.ts`: `useDemo()`, pure business helpers, and the `demo.*` actions such as `bookCourt`, `placeShopOrder`, `placeKitchenOrder`, `setKitchenStatus`, `payInvoice`). Reference data lives in `staticData.ts` (members `ALL_MEMBERS`, `courts`, plans, enquiries, staff, leave, synthetic analytics `DAILY`). `seed.ts` + `source.ts` + `derive.ts` build state from rows: in preview from mock JSON (`derive.ts` re-implements the SQL views), in live mode from API responses.
- **`store/live.ts` (the bridge to the backend)**: `startLive(session)` fetches what the role may see (role-specific endpoints), fills the same store and reference arrays in place, keeps polling every 10 s (ONE timer, started once per `startLive`; a background failure is shown once until a refresh succeeds; a dead session (AUTH_UNAUTHORIZED / ACCOUNT_DISABLED) stops polling and dispatches `SESSION_ENDED_EVENT`, AuthProvider signs out with a notice). `store/admin.ts` = management calls (employees, applications, members, courts, events incl. member registration): API first, then refetch, never an optimistic fake. A missing live session is reported as a session problem ("Your session is not active"); the "preview with sample data" notice only exists in a build without a backend. With a backend the dashboard store (`demoStore.ts`) keeps NOTHING in localStorage and `hooks.blocked` refuses any `demo.*` action when there is no live session; `LiveData` is keyed by the token so a re-rendered session never stops/restarts the store. (Before, the store persisted to localStorage, so a change that never reached the database looked saved to every role in the same browser.) `hooks.after` (set in demoStore) sends each `demo.*` action to the matching endpoint, then refreshes from the server; failures show a toast and revert via refresh. Members get anonymous occupied slots from `/courts/availability` (14 days) so taken slots show without names.
- Events are the `events` table: `OwnerEvents` creates (`admin.createEvent`), `MemberEvents` registers (`admin.registerForEvent` / `unregisterFromEvent`), `live.ts` fills `s.events` from `GET /events`. In preview mode (no backend) they stay local sample data. Only synthetic analytics for days without data remain demo-only. `DEMO_NOW` is pinned to 2026-10-03 17:15 IST (seed is generated relative to that date).

## 11. mock-data/
Generated by `npm run mock:build` (`tools/gen-mock.mjs`): one JSON per table (same shape as rows), plus `database/seed/seed.sql`. Deterministic. Keeps product photo paths. Run with `--base-date=2026-10-03` to match `DEMO_NOW` (without it the base is today and every date shifts). Password for all demo users `Password@123` (bcrypt, 10 rounds in mock).

## 12. Tools (tools/)
- `gen-docs.mjs` (`npm run docs:build`) generates API_CONTRACT, openapi.yaml, DATABASE_SCHEMA, schema.sql snapshot, ER diagram, PERMISSIONS_MATRIX, TRACEABILITY, OWNERSHIP_MAP, request types, workflow diagrams.
- `check-consistency.mjs` (`npm run check`) enforces: enums.ts↔SQL, rows.ts↔tables, mock-data↔schema (FKs, uniques), endpoints↔tables/types/requirements, README claims, doc citations of rules/ADRs/FRs.
- `check-openapi.mjs`, `check-mermaid.mjs`, `verify-db.mjs` (`check:db`: fresh PGlite install of all migrations + seed + probes), `test-db-scripts.mjs`, `test-migration-checksum.mjs`, `test-shared.mjs`.
- `lib/schema.mjs` replays migrations (DDL parser) to know the schema; `api/endpoints.mjs`, `requirements.mjs`, `ownership.mjs`, `examples.mjs` are the contract inputs.
- `npm run verify` runs the whole chain.

## 13. Documentation (docs/)
`api/API_CONTRACT.md` + `openapi.yaml` (109 operations, 18 modules; generated), `business-rules/BUSINESS_RULES.md`, `database/DATABASE_SCHEMA.md` + `schema.sql` + `er-diagram.mmd`, `contracts/` (ENUMS, ERROR_CODES, SHARED_TYPES), `decisions/ADR-001…016` (notably 002 auth, 006 booking conflicts, 009 payments ledger, 011 mocked gateway, 013 money/time, 014 contract-first, 015 derived data, 016 simplification), `requirements/` (113 FR, NFRs, traceability), `security/PERMISSIONS_MATRIX.md`, `workflows/USER_FLOWS.md`, `integration/` (environment, checklists, ownership), `ASSUMPTIONS.md`. Do not hand-edit generated files; change the inputs in `tools/` and run `docs:build`. Some docs still describe the original written contract; the frontend-driven extensions listed in 8.4 are not yet in the contract.

## 14. Security model
bcrypt password hashes; JWT HS256 8 h; server-side role checks and own-record scoping; zod validation on every input; parameterised SQL only; RLS enabled and anon/authenticated revoked (the backend connects as a privileged role); CORS allow-list from env; secrets only in git-ignored `.env`. Not implemented yet: login rate limiting, forced password change, disabling a client's login when `business_clients.is_active=false`, real payment gateway (mock only), token revocation on logout (stateless).

## 15. Known limitations / gotchas
- Stale browser tabs (dev server restarted or app redeployed while a tab was open) used to show React Router's raw "Unexpected Application Error / Failed to fetch dynamically imported module". Every route tree now has `components/RouteError.tsx` as `errorElement`: a stale-module failure reloads the tab once (guarded per URL), anything else shows a readable error page. Session state is per tab (`sessionStorage` key `mb.session`), so Owner / Member / Kitchen can be open in different tabs at once; do NOT move it to localStorage.
- The sample clock `DEMO_TODAY` (2026-10-03) can lag the real date; the live store asks `/courts/availability` from `max(DEMO_TODAY, real today)` because the API refuses past days.
- Editing files with Python on Windows rewrites line endings to CRLF, which breaks `tools/lib/ts-types.mjs` (shared/types are parsed line by line): keep `shared/` files LF (`npm run check` catches it).
- Kitchen role cannot search members, so KitchenPos member lookup shows only preview-style data in live mode.
- Public shop gets stock *status* only; the page receives placeholder quantities.
- Café menu items have NO stock column in the database: the kitchen Stock page's per-item stock and the menu half of the owner low-stock card are preview-only (live mode shows "not tracked" and leaves them out). Product stock (`products.stock_quantity`) is real: the shared `components/StockStepper.tsx` (− 1 +) -> `POST /inventory/adjustments` (±1 per click, floor 0) on the owner store, store manager and overview low-stock card, which lists EVERY low product (scrollable, no cap).
- Preview and live statuses for invoices are presented as DRAFT/SENT/PARTIALLY_PAID/PAID/OVERDUE/VOID on the UI (derived from stored status + `payment_state`).
- A cancelled membership shows as `EXPIRED` in `member_membership_status`.
- Legend text "Social play" in the booking calendar and old "Social play: …" guest bookings are leftovers of the removed feature.
- Event registration takes no payment. Owner-created members need an owner-chosen temporary password (no mail service); `must_change_password` is stored but not enforced.
- A declined applicant's stored hash is cleared, so they just get AUTH_INVALID at login (no dedicated "rejected" page).
- Business clients are invoice customers only (no login, no dashboard).
- `DEMO_NOW` is fixed; real-time slot logic in the UI uses it.
- pglite-socket drops connections after SQL errors, so tests add short settle delays.
- Windows environment; bash heredocs with certain quotes misbehave — prefer writing scripts via file tools.

## 16. Working rules agreed with the project owner
Never edit migrations 0001–0006 once applied (add a new numbered one); never run `db:reset`/`db:seed`/destructive SQL on `champions_club` without explicit approval; do not print or commit secrets; do not commit/push unless asked (branch `final` was pushed on request); keep the database simple (no stored derived values, no new tables without need); frontend is the UI source of truth; backend must enforce permissions itself.

## 17. Where is X? (quick index)
- Login/JWT: `backend/src/kernel/auth.ts`, `backend/src/modules/auth/*`; UI `frontend/src/auth/*`, `frontend/src/api/client.ts`.
- Password hashing: auth/members/staff/clients `service.ts`.
- Booking logic: `backend/src/modules/bookings/service.ts`; UI `CourtCalendar.tsx`, `BookingDrawers.tsx`; store `demoStore.ts` (`bookCourt`, `slotState`).
- Court management: owner add/edit/deactivate in `pages/owner/OwnerBookings.tsx`; API `backend/src/modules/courts/*`; admin store methods `admin.ts` (`createCourt`, `updateCourt`).
- Events: owner create in `pages/owner/OwnerEvents.tsx`, member register in `pages/member/MemberEvents.tsx`; API `backend/src/modules/events/*`; admin store methods `admin.ts` (`createEvent`, `registerForEvent`, `unregisterFromEvent`); live polling in `store/live.ts`.
- Kitchen order states: `pages/kitchen/KitchenOrders.tsx` (READY→PREPARING button), `shared/constants/rules.ts` (`ORDER_TRANSITIONS` source of truth), `backend/src/modules/bar/service.ts`.
- Payments/refunds/tax: `backend/src/modules/payments/service.ts`, `repo.ts`.
- Derived totals/status: `database/migrations/0004_database_simplification.sql` (views), mirrored for preview in `frontend/.../store/derive.ts`.
- Kitchen POS: `pages/kitchen/KitchenPos.tsx`, `store/live.ts` (`placeKitchenOrder`), `backend/src/modules/bar/service.ts`.
- Reports: `backend/src/modules/reports/service.ts`; UI `OwnerOverview/Analytics/Reports`.
- Live data loading: `frontend/src/features/dashboards/store/live.ts`.
- Public site data: `frontend/src/api/public.ts` (shop products always loaded from API when backend configured, refetched on tab focus; no fallback to mock-data).
- Endpoint contract: `tools/api/endpoints.mjs` → `docs/api/API_CONTRACT.md`.
- Business rules: `docs/business-rules/BUSINESS_RULES.md`.

## 18. Manual browser e2e (tools/e2e)
`tools/e2e/README.md`: `scratch-env.mjs up` clones `champions_club` into a scratch DB and starts API :4001 + web :5175 against it; `ui.cjs` (employee application -> pending login -> owner approve/reject -> deactivation -> product -> address -> one menu), `popup.cjs` (repeated-popup regression), `api.mjs` (cafe lifecycle, server-side member price). Never writes the real data. Needs `playwright-core` (not a dependency).
`tools/e2e/trial-pos.cjs`: public Book a trial -> `court_bookings` TRIAL -> owner and front-desk calendars; owner court count (add / deactivate / reactivate); kitchen POS member lookup and Gold price 68 in order + payment; all 12 owner pages. `tools/e2e/owner-pages.cjs` (read-only, live :5173): every owner page + Owner/Member/Kitchen in three separate browser contexts (= separate Chrome tabs). `tools/e2e/demo-login.cjs`: demo buttons = real login.
`tools/e2e/repairs.cjs`: LIVE header on owner/kitchen/store, owner court -> desk/member/availability, member DOB edit + deactivate (login -> ACCOUNT_DISABLED), kitchen drink -> member + public /bar-cafe, stock +1/-1 in PostgreSQL, 8 low-stock products all listed, READY -> PREPARING button layout, no preview popup over polls.
`tools/e2e/live-sync.cjs`: events (owner creates -> member sees by polling, registers), a new court (owner -> front desk + member + availability), kitchen READY -> PREPARING, no popup over several polls, no localStorage copy. Run it with `ui.cjs`, `popup.cjs`, `api.mjs` against the scratch clone.
