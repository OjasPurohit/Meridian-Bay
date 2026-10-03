# Integration Checklist

Run at **integration #1 (hour 4)**, **#2 (hour 8)**, the hour 10–11 bug bash, and before every merge to `main`. Automatable items have a command; the rest are manual with the expected result taken from the seed data ([mock-data/README.md](../../mock-data/README.md)). Tick, don't skim.

## A. Automated gates (must be green)

```bash
npm run check        # contracts: enums, row types, mock data, endpoints, requirements, naming, links
npm run check:db     # constraints + reconciliations on a real Postgres engine (PGlite)
npm run test:db-scripts   # migrate / seed / reset scripts
npm run docs:build && git diff --exit-code   # generated files are committed and up to date
```

## B. Contract consistency

| # | Check | How to verify |
|---|---|---|
| B1 | **API field consistency** — frontend sends/reads exactly the documented fields (no extras, none missing, all snake_case) | compare network tab of each screen with [API_CONTRACT.md](../api/API_CONTRACT.md); TypeScript compiles with `requests.generated.ts` types |
| B2 | **Database field consistency** — every column used in SQL exists in `DATABASE_SCHEMA.md` | `npm run check`; backend starts and `GET` smoke calls return 200 |
| B3 | **Enum consistency** — statuses, roles, methods come from `enums.ts` on both sides; unknown values from the server don't crash the UI | grep for string literals of enum values in `frontend/` and `backend/` (should be only via imports); `npm run check` |
| B4 | **Error format** — every failing call returns `{success:false,error:{code,message}}` with the HTTP status of `ERROR_CODES.md`; UI shows the message for the code | trigger: bad password (401), forbidden role (403), validation (400), conflict (409), unknown id (404) |
| B5 | **Date/time** — API timestamps are UTC ISO with `Z`; UI shows IST; business date logic (daily limit, reports, Friday) uses IST | book 23:30 IST (18:00Z) — appears on the correct IST day; `GET /reports/dashboard?period=TODAY` boundaries |
| B6 | **Currency** — money is a 2-decimal string everywhere; UI formats ₹ with Indian grouping; no float math | inspect responses; try ₹0.10 + ₹0.20 totals |
| B7 | **ID format** — all ids are UUID strings; no integer ids, no human numbers used as keys | grep for `parseInt`/`Number(` on ids |
| B8 | **Null/optional** — nullable fields rendered safely (guest bookings have `member_id: null`; free bookings have `payment_status: NOT_REQUIRED`) | open a guest booking, a free Gold booking, a social-session hold |
| B9 | **Pagination** — list screens send `page/page_size` and read `meta.total_pages` | page through `GET /members`, `/payments` |
| B10 | **Frontend/backend compatibility** — every `api/<module>.ts` function maps 1:1 to an `operationId` in `openapi.yaml` | script/grep; no endpoint called that isn't in the contract |

## C. Security & access

| # | Check | Expected |
|---|---|---|
| C1 | Login as each of the 5 roles → landing route | `/member`, `/front-desk`, `/kitchen`, `/business`, `/owner` |
| C2 | No token on a private endpoint | `401 AUTH_UNAUTHORIZED`; UI → `/login` |
| C3 | Role matrix: as MEMBER call `/reports/dashboard`, `/staff`, `/inventory`; as KITCHEN call `/bar/orders`, `/payments`; as FRONT_DESK call `/reports/finance`, `/staff/payroll?staff_id=other`; as BUSINESS_CLIENT call `/members` | all `403 FORBIDDEN` — compare with `docs/security/permissions.generated.json` |
| C4 | Own-record scoping: member A requests member B's booking/order/payment/invoice by id | 403/404, never data |
| C5 | Kitchen payload | contains **no** `unit_price`, `total_amount`, `discount_amount`, member contact fields |
| C6 | `GET /auth/me` / any user payload | no `password_hash` |
| C7 | Disabled account | `ACCOUNT_DISABLED`, existing token stops working |
| C8 | Anon key / RLS | with the Supabase anon key, `GET {SUPABASE_URL}/rest/v1/users` returns nothing / 401 (RLS deny-all) |
| C9 | Secrets | `git grep -nE "service_role|JWT_SECRET|postgresql://[^ ]*:[^ ]*@"` finds only `.env.example` placeholders |

## D. Critical business invariants

| # | Scenario (seed data) | Expected |
|---|---|---|
| D1 | **Booking conflicts:** fire two `POST /bookings` for the same free slot in parallel | exactly one `201`, one `409 BOOKING_CONFLICT`; one row in DB |
| D2 | Half-hour overlap: book 18:00, then try 18:30 on the same court | `BOOKING_CONFLICT`; 19:00 succeeds |
| D3 | Aarav has 2 bookings tomorrow; try a 3rd (any court) | `409 DAILY_BOOKING_LIMIT`, `details.plays_used_today = 2` |
| D4 | Pricing: Aarav (Gold) / Rohan (Silver) / Ishaan (Junior) / Sneha (expired) / Rahul (no plan) / guest — same court & slot | ₹0 / ₹400 / ₹240 / ₹800 / ₹800 / ₹800 (T1 ₹800/h); `GET /bookings/price` equals stored `amount_due` |
| D5 | Cancel ≥ 2 h before: refund recorded, slot free again; < 2 h as member: no refund | payment `REFUNDED` / unchanged; re-book same slot succeeds |
| D6 | **Inventory synchronisation:** (a) ASICS shoes (stock 0) ordered online and at the counter; (b) Wilson balls (stock 3): buy 2 online, then 2 at the counter | (a) `409 OUT_OF_STOCK` on both channels; (b) the second purchase is refused and stock ends at 1, never negative |
| D7 | Cancel a shop order | stock restored (quantities added back), payment `REFUNDED` |
| D8 | **Payment records:** for each created booking/order/membership/invoice with a method, a `payments` row exists with correct `source_type`, `source_id`, `amount`, `tax_amount` (the revenue category is derived: `payment_ledger`) | `SELECT … FROM payments ORDER BY created_at DESC` |
| D9 | Free (Gold) booking | no payment row; `payment_status = NOT_REQUIRED` |
| D10 | Partial invoice payment | `invoice_totals.amount_paid` increases; `payment_state` `PARTIALLY_PAID`; second payment completes → `PAID`; over-payment rejected |
| D11 | Revenue reconciliation: dashboard `revenue.total` for MONTH | equals `SELECT sum(amount - refunded_amount) FROM payments …` and equals the sum of its `by_category` and of its `by_method` |
| D12 | **Order states:** kitchen jumps NEW → SERVED | `409 INVALID_STATUS_TRANSITION`; the legal path NEW → PREPARING → READY → SERVED works |
| D13 | Shop order: `READY_FOR_PICKUP` on a DELIVERY order | rejected |
| D14 | Cafe order paid on its own | one `BAR_ORDER` payment equals the order total (`bar_order_totals.total_amount`); `payment_status` PAID |
| D15 | Member bar discount | Priya (Gold) order shows 15 % off automatically; guest none |
| D16 | Daily bar summary for yesterday | equals sum of BAR payments (cash + UPI + card) that day |
| D17 | Membership: early renewal for Meera (expires in 9 d) → derived status `UPCOMING`; two overlapping live terms for the same member impossible | DB rejects the overlap (`memberships_no_overlap`) |
| D18 | Enquiry inbox | a website enquiry appears with `handled_at` empty; marking it handled sets `handled_at`; reopening clears it |
| D19 | Leave & shifts | shift on an approved-leave day rejected; leave overlap rejected; payroll unique per month |

## E. Foreign keys & data integrity (run after the demo path)

```sql
-- no orphans (should all return 0 rows)
SELECT * FROM court_bookings b LEFT JOIN courts c ON c.id=b.court_id WHERE c.id IS NULL;
SELECT p.* FROM payments p WHERE p.source_type='SHOP_ORDER' AND NOT EXISTS (SELECT 1 FROM shop_orders o WHERE o.id=p.source_id);
-- (repeat for each source_type: COURT_BOOKING→court_bookings, MEMBERSHIP→memberships, BAR_ORDER→bar_orders, INVOICE→invoices)
-- invariants
SELECT * FROM products WHERE stock_quantity < 0;
SELECT a.member_id FROM memberships a JOIN memberships b ON b.member_id=a.member_id AND b.id>a.id WHERE a.cancelled_at IS NULL AND b.cancelled_at IS NULL AND daterange(a.start_date,a.end_date,'[]') && daterange(b.start_date,b.end_date,'[]');
SELECT * FROM invoice_totals WHERE total_amount <> subtotal + tax_amount OR amount_paid > total_amount;
SELECT * FROM bar_order_totals WHERE amount_paid > total_amount;
```

## F. UI states (each module, each role)
- [ ] Loading skeleton/spinner, empty state, error state with retry.
- [ ] Forms show field-level errors from `details.fields`.
- [ ] Buttons disabled while submitting (no double submit → duplicate payment/booking).
- [ ] Mobile 375 px for public + member; tablet for desk/kitchen.

## G. Release gate (before tagging `main`)
- [ ] A–F ticked on `develop` by a developer who did **not** write the code under test.
- [ ] `npm run db:status` shows **identical** applied migrations on local and Supabase.
- [ ] Demo data reset the same morning (`npm run mock:build`), demo path §8 rehearsed twice.
- [ ] Environment variables set in the hosting dashboards; `JWT_SECRET` differs from dev; no secrets in the repo.
