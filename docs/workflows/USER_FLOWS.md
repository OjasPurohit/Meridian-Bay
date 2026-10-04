# User Flows

Every flow names the **API operations** it uses (operation id = row in [API_CONTRACT.md](../api/API_CONTRACT.md); `POST /bookings` = `bookings.create`) and the **tables** it touches, so workflows, APIs and database stay aligned. Diagrams are exported to [workflows.mmd](workflows.mmd) (generated). Rules referenced as `R-xx` live in [BUSINESS_RULES.md](../business-rules/BUSINESS_RULES.md). Scope: [ADR-016](../decisions/ADR-016-database-simplification.md) (no social play, tabs, CRM pipeline, notifications or stock ledger).

| # | Flow | Primary actor |
|---|---|---|
| 1 | [Public visitor](#1-public-visitor-flow) | Visitor |
| 2 | [Signup / login](#2-signup--login-flow) | Visitor → any |
| 3 | [Member](#3-member-flow) | Member |
| 4 | [Gold / Silver / Junior behaviour](#4-gold--silver--junior-behaviour) | Member |
| 5 | [Front desk](#5-front-desk-flow) | Front desk |
| 6 | [Court booking](#6-court-booking-flow) | Member / Front desk |
| 7 | [Court cancellation](#7-court-cancellation-flow) | Member / Front desk |
| 8 | [Shop — physical purchase](#8-shop--physical-purchase-flow) | Front desk |
| 9 | [Shop — online purchase](#9-shop--online-purchase-flow) | Member |
| 10 | [Pickup](#10-pickup-flow) | Member / Front desk |
| 11 | [Delivery](#11-delivery-flow) | Member / Front desk |
| 12 | [Cafe order](#12-cafe-order-flow) | Front desk |
| 13 | [Kitchen](#13-kitchen-flow) | Kitchen manager |
| 14 | [Enquiry](#14-enquiry-flow) | Visitor / Front desk |
| 15 | [Business-client invoice](#15-business-client-invoice-flow) | Owner / Business client |
| 16 | [Owner / admin](#16-owner--admin-flow) | Owner |
| 17 | [Staff & leave](#17-staff--leave-flow) | Staff / Owner |
| 18 | [Finance & reporting](#18-finance--reporting-flow) | Owner |

---

## 1. Public visitor flow
Goal: a stranger understands the club and reaches out — without logging in. (FR-PUB-*, FR-ENQ-001/002)

```mermaid
flowchart LR
  V["Online visitor"] --> H["Home: club, timings, contact"]
  H --> P["Plans: Gold / Silver / Junior + prices"]
  H --> C["Courts + availability this week"]
  H --> S["Shop catalogue"]
  H --> B["Cafe menu"]
  P --> E["Enquiry / Trial form"]
  C --> E
  C --> T["Trial request"]
  E --> SUB["Submit enquiry"]
  T --> SUB
  SUB --> N["Waits in the front desk inbox (handled_at empty)"]
  N --> FU["Front desk contacts the visitor"]
  H --> L["Login / Signup"]
```
Operations: `public.club`, `memberships.plans`, `courts.list`, `courts.availability`, `shop.products`, `bar.menu`, `enquiries.create`. Tables: `club_settings`, `membership_plans`, `courts`, `court_bookings`, `products`, `bar_menu_items`, `enquiries`.

## 2. Signup / login flow
```mermaid
sequenceDiagram
  actor U as Visitor
  participant FE as Frontend
  participant API as API
  participant DB as Database
  U->>FE: fill signup form
  FE->>API: POST /auth/signup
  API->>DB: INSERT users(role=MEMBER) + members (one transaction)
  API-->>FE: AuthSession (token, redirect_to=/member)
  U->>FE: later: email + password
  FE->>API: POST /auth/login
  API->>DB: find user, bcrypt compare
  alt invalid
    API-->>FE: 401 AUTH_INVALID
  else disabled
    API-->>FE: 403 ACCOUNT_DISABLED
  else ok
    API-->>FE: AuthSession (role, profile, redirect_to)
    FE->>FE: store token, navigate to ROLE_HOME_ROUTE[role]
  end
```
Role → landing: MEMBER → `/member` · FRONT_DESK → `/front-desk` · KITCHEN_MANAGER → `/kitchen` · STORE_MANAGER → `/store-manager` · OWNER_ADMIN → `/owner`. A person who only has a PENDING job application gets no session: `POST /auth/login` answers `EMPLOYEE_APPLICATION_PENDING` and the app shows `/employee-application-pending`. A user who is not authenticated stays on the public website; private routes and APIs answer `AUTH_UNAUTHORIZED`.

## 3. Member flow
```mermaid
flowchart TB
  L["Login"] --> D["Member dashboard"]
  D --> PR["Profile, plan, benefits, expiry, history"]
  D --> AV["Court availability"] --> BK["Book court"] --> MB["My bookings"] --> CN["Cancel booking"]
  D --> SH["Shop: browse, order, pickup or delivery"] --> SO["My shop orders"]
  D --> BA["My cafe orders"]
  D --> PY["Payments and receipts"]
  D --> RN["Renew membership"]
```
Operations: `members.me`, `members.memberships`, `members.history`, `courts.availability`, `bookings.price/create/list/cancel`, `shop.products/orderCreate/orderList`, `bar.orderList`, `payments.list/get`, `memberships.purchase`. All data scoped to the caller (`member_id`).

## 4. Gold / Silver / Junior behaviour
The UI and API never branch on the type name. Behaviour = the member's **effective membership** → plan columns.

```mermaid
flowchart TB
  A["Request: price / discount / limit for member M on date D"] --> Q["getEffectiveMembership(M, D)"]
  Q -->|none or expired| W["Walk-in price, no discount, default max 2 plays/day"]
  Q -->|plan found| P["membership_plans row"]
  P --> C1["court_discount_percent (100 = free) -> court price"]
  P --> C2["shop_discount_percent -> shop order discount"]
  P --> C3["bar_discount_percent -> cafe order discount"]
  P --> C4["max_plays_per_day -> daily limit"]
  P --> C5["max_age -> eligibility at purchase (Junior < 18)"]
```
Seed values: Gold 100 % court / 15 % shop / 15 % cafe · Silver 50 % / 10 % / 10 % · Junior 70 % / 5 % / 5 % (all editable by the owner via `memberships.planUpdate`; changing a plan never rewrites past bookings/orders — prices are snapshotted).

## 5. Front desk flow
```mermaid
flowchart TB
  FD["Front desk dashboard"] --> M1["Search member: name / phone / code"]
  M1 --> M2["Member card: plan, expiry, plays today, history"]
  M2 --> M3["Book court / sell product / cafe order"]
  FD --> R["Register new member (+ buy plan)"]
  FD --> W["Walk-in guest: book / buy / order, pay cash-card-UPI"]
  FD --> BKV["Bookings day view: create, cancel"]
  FD --> E["Enquiry inbox: log phone enquiry, mark handled"]
  FD --> POS["Shop counter + cafe orders"]
  FD --> SC["Staff schedule (read-only) and own leave"]
```
Operations: `members.list/create/get/history`, `memberships.purchase/changePlan/expiring`, `bookings.*`, `enquiries.*`, `shop.orderCreate/orderStatus`, `bar.*`, `staff.shifts`, `staff.leaveCreate`. Front desk does **not** see finance reports, payroll of others, plan/product/menu administration.

## 6. Court booking flow
Rules: R-COURT-01…09. The DB exclusion constraint is the final arbiter.

```mermaid
sequenceDiagram
  actor U as Member or Front desk
  participant FE as Frontend
  participant API as Bookings API
  participant MS as MembershipService
  participant PS as PaymentsService
  participant DB as Database
  U->>FE: pick date, sport
  FE->>API: GET /courts/availability?date&sport_type
  API-->>FE: slots (AVAILABLE / BOOKED / BLOCKED / PAST)
  U->>FE: pick slot
  FE->>API: GET /bookings/price?court_id&start_at
  API-->>FE: PriceBreakdown (discount, amount_due, plays_used_today)
  U->>FE: confirm (member, or guest name + phone for walk-ins)
  FE->>API: POST /bookings
  API->>DB: BEGIN, advisory lock on member
  API->>MS: getEffectiveMembership(member, IST date)
  API->>DB: count the member's bookings that stand that IST day
  alt plays >= max_plays_per_day
    API-->>FE: 409 DAILY_BOOKING_LIMIT
  else
    API->>DB: INSERT court_bookings (list_price + discount_amount snapshot)
    alt overlap (SQLSTATE 23P01)
      API-->>FE: 409 BOOKING_CONFLICT
    else inserted
      opt payment_method given and amount due > 0
        API->>PS: record(COURT_BOOKING)
      end
      API->>DB: COMMIT
      API-->>FE: 201 BookingDetail
    end
  end
```
Phone callers: the desk uses the same availability endpoint and `POST /bookings` with `member_id` or `guest_*`. A free trial is a guest booking whose discount equals the list price. Free bookings (Gold) report `payment_status = NOT_REQUIRED` (derived by `court_booking_totals`). Operations: `courts.availability`, `bookings.price`, `bookings.create`, `payments.create` (pay later at the desk).

## 7. Court cancellation flow
```mermaid
flowchart TB
  S["Cancel request (member own / front desk)"] --> C1{"Booking stands (cancelled_at empty) and start_at in the future?"}
  C1 -->|no| X["409 BOOKING_NOT_CANCELLABLE"]
  C1 -->|yes| C2{"Hours until start >= cancellation_cutoff_hours?"}
  C2 -->|yes| R["Refund the payment in full (refunded_amount); booking reports payment_status REFUNDED"]
  C2 -->|no and member| N["No refund (policy)"]
  C2 -->|no and staff| O["Staff may override with refund=true"]
  R --> F["cancelled_at set; derived status CANCELLED; slot becomes AVAILABLE again"]
  N --> F
  O --> F
```
Operations: `bookings.cancel` (calls `PaymentsService.refundSource`). The exclusion constraint only covers bookings with `cancelled_at IS NULL`, so a cancelled row frees the slot instantly.

## 8. Shop — physical purchase flow
```mermaid
sequenceDiagram
  actor FD as Front desk
  participant API as Shop API
  participant DB as Database
  FD->>API: GET /shop/products (search)
  FD->>API: POST /shop/orders {items, fulfillment IN_STORE, member_id or guest, payment_method}
  API->>DB: BEGIN
  loop each line
    API->>DB: UPDATE products SET stock_quantity = stock_quantity - q WHERE id AND stock_quantity >= q
    alt 0 rows
      API-->>FD: 409 OUT_OF_STOCK (rollback)
    end
  end
  API->>DB: INSERT shop_orders(IN_STORE, COMPLETED) + items (price snapshots, member discount)
  API->>DB: INSERT payments (SHOP_ORDER)
  API->>DB: COMMIT
  API-->>FD: 201 ShopOrderDetail (receipt)
```
Member discount is applied automatically when the member is identified; guests pay list price. Low stock is read from `inventory.lowStock`: no message is sent.

## 9. Shop — online purchase flow
```mermaid
flowchart TB
  M["Member browses /shop/products (member_price shown)"] --> CART["Cart"]
  CART --> CH{"Fulfilment"}
  CH -->|PICKUP| PO["POST /shop/orders PICKUP"]
  CH -->|DELIVERY| AD["Enter delivery address"] --> DO["POST /shop/orders DELIVERY"]
  PO --> OK["Stock decremented atomically; order PLACED; paid ONLINE"]
  DO --> OK
  OK -->|stock short| ERR["409 OUT_OF_STOCK: nothing written"]
  OK --> TR["Member tracks status in My orders"]
```
Counter and online orders decrement the **same** `products.stock_quantity` (R-SHOP-01). Delivery fee = `delivery_fee` setting unless the discounted subtotal ≥ `free_delivery_above`.

## 10. Pickup flow
```mermaid
stateDiagram-v2
  [*] --> PLACED
  PLACED --> CONFIRMED : staff confirms
  CONFIRMED --> READY_FOR_PICKUP : packed
  READY_FOR_PICKUP --> COMPLETED : member collects, desk marks complete
  PLACED --> CANCELLED
  CONFIRMED --> CANCELLED
  READY_FOR_PICKUP --> CANCELLED
```
Operations: `shop.orderStatus` (FRONT_DESK/OWNER), `shop.orderCancel`.

## 11. Delivery flow
```mermaid
stateDiagram-v2
  [*] --> PLACED
  PLACED --> CONFIRMED
  CONFIRMED --> OUT_FOR_DELIVERY : handed to rider
  OUT_FOR_DELIVERY --> COMPLETED : delivered
  PLACED --> CANCELLED
  CONFIRMED --> CANCELLED
  OUT_FOR_DELIVERY --> CANCELLED
```
Same endpoints as pickup; `OUT_FOR_DELIVERY` only for `fulfillment = DELIVERY`, `READY_FOR_PICKUP` only for `PICKUP` (server enforces). The delivery address lives on the order (`delivery_address`).

## 12. Cafe order flow
```mermaid
sequenceDiagram
  actor FD as Front desk (cafe counter)
  participant API as Cafe API
  participant DB as Database
  actor K as Kitchen
  FD->>API: GET /bar/menu
  FD->>API: POST /bar/orders {table_label?, member_id?, guest_name?, items, payment_method?}
  API->>DB: price items (snapshots), apply member bar_discount_percent automatically
  API->>DB: INSERT bar_orders(NEW) + bar_order_items
  API-->>FD: 201 BarOrderDetail
  Note over K: order appears on the kitchen board (polling 5 s)
  alt customer pays now
    FD->>API: payment in the same call (CASH/CARD/UPI)
  else pays when leaving
    FD->>API: POST /payments {BAR_ORDER, payment_method} later
  end
```
Members never ask for their discount: identifying the member (`member_id`) is enough. The order carries a free-text `table_label`: there are no table or tab records, and every order is paid by itself. Operations: `bar.menu`, `bar.orderCreate`, `bar.orderCancel`, `payments.create`.

## 13. Kitchen flow
```mermaid
stateDiagram-v2
  [*] --> NEW : front desk places order
  NEW --> PREPARING : kitchen starts
  PREPARING --> READY
  READY --> SERVED : delivered to table
  NEW --> CANCELLED : rejected
```
Operations: `kitchen.list` (board, no prices), `kitchen.get`, `kitchen.status`. `bar_orders.status` is the only record of progress. Illegal jumps → `409 INVALID_STATUS_TRANSITION`.

## 14. Enquiry flow
```mermaid
stateDiagram-v2
  [*] --> NEW : website form / phone / walk-in (handled_at empty)
  NEW --> HANDLED : front desk marks it handled (handled_at set)
  HANDLED --> NEW : reopened
```
Operations: `enquiries.create` (public or staff), `enquiries.list` (the inbox, filter `handled=false`), `enquiries.get`, `enquiries.update`. Nothing else is modelled: the front desk replies by phone or email and, when the visitor joins, registers them with `members.create`.

## 15. Business-client invoice flow
```mermaid
sequenceDiagram
  actor O as Owner
  actor B as Business client
  participant API as API
  O->>API: POST /business-clients (a company to invoice, no login)
  O->>API: POST /invoices {business_client_id, items (tax-exclusive), due_date, send_now}
  B->>API: GET /invoices (own), GET /invoices/:id
  B->>API: POST /payments {INVOICE, amount (partial ok), ONLINE}
  API->>API: ledger row, then the view invoice_totals derives amount_paid and payment_state
  B->>API: GET /payments (own) = transaction history
```
Membership renewal invoices are addressed to a member (`member_id`) instead of a business client (R-FIN-05). Voiding is allowed only with no payments (`invoices.void`). Overdue is derived from `due_date`: no job is needed.

## 16. Owner / admin flow
```mermaid
flowchart TB
  O["Owner dashboard (period: today / week / month)"] --> K["KPI tiles: revenue by stream, members, courts, shop, cafe, enquiries, finance, staff"]
  O --> A1["Membership: members, plans, expiring, revenue"]
  O --> A2["Courts: availability, bookings, utilisation, maintenance blocks, rates"]
  O --> A3["Shop: products, stock, low stock, orders, sales"]
  O --> A4["Cafe: menu, orders, daily sales"]
  O --> A5["Finance: payments, refunds, invoices, outstanding, payroll, tax"]
  O --> A6["Staff: records, shifts, leave approval"]
  O --> A7["Enquiries: inbox"]
  O --> A8["Reports + CSV export"]
  O --> A9["Settings: hours, tax rates, delivery, cut-offs"]
```
Operations: `reports.*`, plus the admin endpoints of each module (all marked OWNER_ADMIN in the [permissions matrix](../security/PERMISSIONS_MATRIX.md)).

## 17. Staff & leave flow
```mermaid
sequenceDiagram
  actor O as Owner
  actor S as Staff (front desk / kitchen)
  participant API as API
  O->>API: POST /staff (account + employee record)
  O->>API: POST /staff/shifts (roster, overlap check)
  S->>API: GET /staff/shifts (own - front desk sees all)
  S->>API: POST /staff/leave-requests
  O->>API: GET /staff/leave-requests (pending)
  O->>API: POST /staff/leave-requests/:id/decision {APPROVE or REJECT}
  O->>API: POST /staff/payroll {staff, month, method, mark_paid}
```
Leave states: `PENDING → APPROVED | REJECTED | CANCELLED`; an approved leave blocks shift assignment on those dates. A salary is pending until `paid_on` is set.

## 18. Finance & reporting flow
```mermaid
flowchart LR
  subgraph IN["Money in"]
    C["Court bookings"] --> P[("payments ledger")]
    M["Memberships"] --> P
    S["Shop orders"] --> P
    B["Cafe orders"] --> P
    I["Invoices (business, membership)"] --> P
  end
  P --> R["Revenue by category / method / day"]
  P --> T["Tax collected per category"]
  P --> RF["Refunds"]
  INV["Invoices outstanding and overdue"] --> F["Finance report"]
  PR["Payroll paid / pending"] --> F
  R --> F
  T --> F
  RF --> F
  F --> D["Owner dashboard + CSV export"]
```
Every figure comes from **ledgers** (`payments`, `invoices`, `payroll_payments`); revenue = `amount − refunded_amount` grouped by IST `paid_at` date, and the revenue category is derived by the view `payment_ledger`. Operations: `reports.dashboard/revenue/courts/memberships/shop/bar/finance/tax/export`, `payments.list`.
