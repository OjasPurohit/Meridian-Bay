# Mock data (seed data)

Realistic demo data for **every table**, one JSON file per table (file name = table name with `_` → `-`). Rows contain **exactly** the columns of the canonical schema — no extra fields, none missing (explicit `null`s). `npm run check` enforces this, plus enum validity, ID/timestamp/money formats, foreign keys, unique columns and the polymorphic `payments.source_*` references. `database/seed/seed.sql` is generated from the same generator, so JSON and database always agree.

> **Do not edit these JSON files by hand.** Edit [`tools/gen-mock.mjs`](../tools/gen-mock.mjs) and run `npm run mock:build`. Frontend developers can import the JSON directly as fixtures while the backend is not ready (shapes = `shared/types/rows.ts`).

| Requested name | Actual file(s) |
|---|---|
| users | `users.json` |
| members | `members.json` |
| memberships (plans + terms) | `membership-plans.json`, `memberships.json` |
| courts | `courts.json` |
| bookings | `court-bookings.json` (incl. social-session holds, trial, maintenance) |
| social sessions | `social-sessions.json`, `social-session-participants.json` |
| products / inventory | `products.json`, `inventory-movements.json` |
| orders (shop) | `shop-orders.json`, `shop-order-items.json` |
| bar tables / menu | `bar-tables.json`, `bar-menu-items.json` |
| bar orders / tabs | `bar-orders.json`, `bar-order-items.json`, `bar-tabs.json` |
| kitchen orders | the kitchen queue **is** `bar-orders.json`; its status history is `order-status-events.json` (see ADR-009 note: no separate kitchen table) |
| payments | `payments.json` |
| invoices / business clients | `invoices.json`, `invoice-items.json`, `business-clients.json` |
| enquiries / quotes | `enquiries.json`, `enquiry-follow-ups.json`, `quotes.json` |
| staff / shifts / leave / payroll | `staff.json`, `staff-shifts.json`, `leave-requests.json`, `payroll-payments.json` |
| notifications | `notifications.json` |
| settings | `club-settings.json` |

## Anchor date
Generated for a **base date** (default: the day you run `npm run mock:build`; `-- --base-date=YYYY-MM-DD` to pin). Mock "now" = base date **17:15 IST**. Everything is relative to it (bookings from −6 to +6 days, memberships expiring in +9 / +28 days, Friday social sessions on the previous and next Friday). Regenerate on the morning of the demo.

## Demo logins (password for ALL accounts: `Password@123`)

| Role | Email | Notes |
|---|---|---|
| OWNER_ADMIN | `owner@championsclub.example` | Vikram Malhotra |
| FRONT_DESK | `neha.sharma@championsclub.example`, `arjun.mehta@championsclub.example`, `pooja.iyer@championsclub.example` | Pooja works the bar counter |
| KITCHEN_MANAGER | `kitchen@championsclub.example` | Ramesh Patil |
| BUSINESS_CLIENT | `sanjay.gupta@technova.example` | TechNova Solutions (Greenfield Corp is invoiced without a login) |
| MEMBER · Gold | `aarav.kapoor@example.com`, `priya.nair@example.com`, `karan.bhatia@example.com` (expires in 28 d), `tanvi.shah@example.com` (upgraded from Silver) | |
| MEMBER · Silver | `rohan.desai@example.com`, `ananya.iyer@example.com`, `kabir.singh@example.com` (new, converted from an enquiry), `meera.joshi@example.com` (expires in 9 d), `sneha.kulkarni@example.com` (**expired** 9 days ago) | |
| MEMBER · Junior | `ishaan.verma@example.com` (14), `diya.reddy@example.com` (16) | |
| MEMBER · no plan | `rahul.menon@example.com` | signed up online, never bought a plan: pays walk-in rates |
| MEMBER · cancelled plan | `vihaan.patel@example.com` | Silver plan `CANCELLED` by the owner (no refund) → walk-in rates |

## Scenario map — which rows exercise which rule

| Rule / demo moment | Where in the data |
|---|---|
| **Max 2 plays/day** | Aarav has two Tennis Court 1 bookings tomorrow (18:00, 19:00) → a third attempt must fail with `DAILY_BOOKING_LIMIT` |
| **No double booking** | any `CONFIRMED` booking slot; also half-hour overlaps. Court T2 is blocked for maintenance in +5 days (10:00, 11:00) |
| **Gold free / Silver 50% / Junior 70% / walk-in full price** | compare `list_price`, `discount_amount`, `amount_due` across `court-bookings.json` |
| **Expired membership pays walk-in rate** | Sneha (expired) booking `membership_id = null`, full price; Rahul (no plan) likewise |
| **Plan change history** | Tanvi: SILVER (`CHANGED`) → GOLD (`ACTIVE`, `previous_membership_id` set) |
| **Expiry warnings** | Meera (+9 d), Karan (+28 d, renewal invoice `INV-00005` already sent), Sneha (expired, `MEMBERSHIP_EXPIRED` notification) |
| **Cancellation + refund** | Ananya's cancelled badminton booking yesterday: payment `REFUNDED` |
| **Friday social play** | previous Friday: two `COMPLETED` sessions; next Friday: 18:00 session (5 joined, 1 left) and a **FULL** 19:00 session (6/6) |
| **Trial session** | `TRIAL` booking in +2 days for enquiry "Siddharth Rao" |
| **Shop: same shelf / low stock** | Wilson US Open balls 3 (threshold 5), Babolat string 4 (10), ASICS Gel-Resolution 0 (out of stock); stock = ledger sum |
| **Shop pickup / delivery / cancel** | orders in `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`, `PLACED`, `CONFIRMED`, `COMPLETED`, and one `CANCELLED` (stock restored, refunded) |
| **Bar: member discount automatic, tabs** | Priya's open tab (Table 3, 15% off), Imran's open tab (Table 5, guest, list price); settled tabs yesterday |
| **Kitchen board** | orders currently `NEW`, `ACCEPTED`, `PREPARING`, `READY` (plus served ones); `order-status-events.json` has the transitions |
| **Daily bar revenue** | yesterday: cash + UPI + card, a settled tab, one cancelled order |
| **Enquiry funnel** | NEW, CONTACTED (trial), QUOTE_SENT, FOLLOW_UP (due today 16:00), CONVERTED (Kabir), LOST, BUSINESS |
| **Invoices** | `PAID`, `PARTIALLY_PAID` (₹10,000 of ₹16,992), `OVERDUE` (Greenfield), `DRAFT`, membership invoice `SENT`, and one `VOID` duplicate |
| **Staff** | shifts for −3..+6 days; one `PENDING` leave (Arjun), approved/rejected others; payroll: last month `PAID`, this month `PENDING` |
| **Taxes** | court/membership/shop 18%, bar 5% (tax-inclusive); invoices 18% (tax-exclusive) |

## Intentionally empty columns
Every column of every table is populated by at least one row **except** these three, which depend on features that are not part of the mock (`npm run check` fails if any other column is left empty):

| Column | Why empty |
|---|---|
| `members.photo_url` | member photo upload is NICE-to-have (FR-MEM-015) |
| `courts.image_url`, `products.image_url` | no image hosting in the mock; the UI falls back to a sport/category icon |

Other nullable columns are legitimately null on *some* rows (guest bookings have no `member_id`; free bookings have no payment; open tabs have no `settled_at`) — those are exactly the null-handling cases the UI must cope with.
