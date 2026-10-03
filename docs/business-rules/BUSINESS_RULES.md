# Business Rules — the single place

Every rule that changes behaviour lives **here**, with an ID. Other documents, code comments and tests cite the ID (`// R-COURT-04`) instead of restating the rule. If a rule changes, change it here first, then the code. Values marked ⚙ are **settings** (`club_settings`, owner-editable); ◼ are **invariants** (`shared/constants/rules.ts`); ◆ are **plan data** (`membership_plans`).

Conventions used below: *IST date* = `shared/lib/time.ts#istDate`; amounts are rupees in paise-exact arithmetic via `shared/lib/money.ts`; a booking "stands" while `cancelled_at IS NULL`. **Derived values** (membership status, a booking's status, amounts due, totals, payment status, invoice paid / overdue, revenue category) are computed by SQL views and never stored (ADR-015, ADR-016). IDs of retired rules (the whole social-play series, the cafe table-management rule and four CRM rules) are never reused, so the numbering has gaps.

---

## Money & tax

| ID | Rule |
|---|---|
| R-FIN-01 | **All money received is a row in `payments`** (the revenue ledger). Nothing is "revenue" unless it is there. Reports sum this table. |
| R-FIN-02 | **Court, membership, shop and cafe prices are tax-INCLUSIVE.** Stored/quoted price = what the customer pays. `tax_amount = round(gross × rate ÷ (100 + rate))` (`taxInclusive`), computed when the payment is recorded and stored on the payment. Rates ⚙: `tax_rate_court` 18, `tax_rate_membership` 18, `tax_rate_shop` 18, `tax_rate_bar` 5 (%). |
| R-FIN-03 | **Business/membership invoices are tax-EXCLUSIVE:** `subtotal = Σ quantity × unit_price`; `tax_amount = round(subtotal × tax_rate ÷ 100)` (`taxExclusive`); `total_amount = subtotal + tax_amount`. Only the lines and `tax_rate` are stored; the totals come from the view `invoice_totals`. Default rate ⚙ `tax_rate_business` 18. |
| R-FIN-04 | **Partial payments are allowed only on invoices.** Bookings, memberships, shop orders and cafe orders are paid in full in one payment (`PAYMENT_AMOUNT_MISMATCH` otherwise). |
| R-FIN-05 | Invoices are addressed to a business client (`business_client_id`) or, for membership renewals, to a member (`member_id`); exactly one (DB CHECK). A payment against an invoice has `revenue_category` `BUSINESS` or `MEMBERSHIP` respectively (view `payment_ledger`); its `tax_amount` is the invoice tax pro-rated: `round(amount × invoice.tax_amount ÷ invoice.total_amount)`. |
| R-FIN-06 | **Refunds** are recorded on the original payment (`refunded_amount`, `refund_reason`, `refunded_at`). Never delete or negate a payment. Cancellation flows refund automatically; manual refunds are OWNER_ADMIN only. `refunded_amount ≤ amount`. A payment is SUCCEEDED, PARTIALLY_REFUNDED or REFUNDED by its `refunded_amount` (view `payment_ledger`). |
| R-FIN-07 | **Revenue** of a period = `Σ (amount − refunded_amount)` over payments, by IST date of `paid_at`, grouped by the derived `revenue_category`. **Tax collected** = same sum over `tax_amount`, pro-rated for partial refunds: `tax_amount × (amount − refunded_amount) ÷ amount`. |
| R-FIN-08 | **Outstanding** = `Σ (total_amount − amount_paid)` over SENT invoices that are not fully paid (view `invoice_totals`). **Overdue** = those with `due_date < today (IST)`. Unpaid bookings/orders (payment status `PENDING`) are "pending at desk", reported separately, not as outstanding invoices. |
| R-FIN-09 | **Rounding:** half-up to the paisa, at each derived field (discount, tax, delivery), never on running totals. `discount_amount = percentOf(list, pct)`; amount due = `list − discount`. Money strings always have 2 decimals. |
| R-FIN-10 | **Payroll:** one `payroll_payments` row per employee per month (`pay_period` = first of month, unique). Amount defaults to `monthly_salary`; `paid_on IS NULL` means pending. Payroll is an *expense* shown in the finance report; it is not in `payments`. |
| R-FIN-11 | Payment method by role (enforced on `POST /payments`): MEMBER & BUSINESS_CLIENT → `ONLINE`; FRONT_DESK → `CASH`/`CARD`/`UPI`; OWNER_ADMIN → any. Online = mock gateway in v1 (ADR-011). |

## Membership

| ID | Rule |
|---|---|
| R-MEM-01 | Gold, Silver and Junior are **plans** (`membership_plans.membership_type`), not roles or tables. All three log in as `MEMBER`. |
| R-MEM-02 | Plan benefits are **data** ◆: `court_discount_percent` (100 = courts free), `shop_discount_percent`, `bar_discount_percent`, `max_plays_per_day`, `price`, `duration_months`, `max_age`, `benefits[]`. No code may branch on the type name to compute a price or limit. Seed: Gold 100/15/15, Silver 50/10/10, Junior 70/5/5; all `max_plays_per_day = 2`. |
| R-MEM-03 | A membership **term** is one `memberships` row: member + plan + `start_date` + `end_date` + `price_paid`. `end_date = start_date + duration_months − 1 day` (inclusive last valid day, `termEndDate`). Every purchase, renewal or plan change creates a new row; the table *is* the history. |
| R-MEM-04 | **Membership status is DERIVED, never stored** (view `membership_terms`, IST date): `ACTIVE` = `start_date ≤ today ≤ end_date`; `EXPIRED` = `end_date < today`; `UPCOMING` = `start_date > today`; a term the owner cancelled has `cancelled_at` set and is `CANCELLED`. **Effective membership** of member M on IST date D = the term with `start_date ≤ D ≤ end_date` and `cancelled_at IS NULL`. A member is `ACTIVE` when they have an effective term today, `EXPIRED` when they had terms but none is effective, and has no status when they never had a plan (view `member_membership_status`). |
| R-MEM-05 | **No effective membership (none, expired, cancelled) ⇒ walk-in treatment:** list price, no discount, `max_plays_per_day` default 2. The member record, history and login remain valid. |
| R-MEM-06 | Two live terms of one member may never overlap (DB exclusion constraint `memberships_no_overlap`; cancelled terms are exempt). **Early renewal:** allowed when the current term ends within ⚙ `membership_expiry_warning_days` (30); the new row has `start_date = current end_date + 1` (derived status `UPCOMING`). Otherwise `MEMBERSHIP_ALREADY_ACTIVE`. |
| R-MEM-07 | **Junior is for under-18s:** at purchase, `age(date_of_birth, start_date) ≤ plan.max_age`; DOB is required to buy Junior (`JUNIOR_AGE_INVALID`). A Junior who turns 18 mid-term keeps the term; the next renewal must be a non-Junior plan. |
| R-MEM-08 | **Plan change** (front desk/owner): only an `ACTIVE` term; the old row ends (`end_date = yesterday`, so it reports `EXPIRED`); the new row starts today (derived `ACTIVE`); full price of the new plan, **no pro-rata credit** (ASSUMPTIONS A-07). Benefits switch immediately for new transactions; past transactions keep their snapshot. |
| R-MEM-09 | **Cancel** (owner): `cancelled_at` + `cancellation_reason` set (derived status `CANCELLED`); benefits stop immediately; no automatic refund. |
| R-MEM-10 | **Expiry** needs no job: status is derived from dates (R-MEM-04). The front desk list of memberships about to expire (`memberships.expiring`) is a query over `end_date` within ⚙ `membership_expiry_warning_days`. |
| R-MEM-11 | Editing a plan never alters history: bookings, orders and memberships copy their prices (`list_price`, `discount_amount`, `unit_price`, `price_paid`) at transaction time. |

## Courts & bookings

| ID | Rule |
|---|---|
| R-COURT-01 | ◼ A session lasts **1 hour**; a **new slot starts every 30 minutes**. Valid starts: from ⚙ `club_open_time` to `club_close_time − 1 h`, minute ∈ {00, 30}. DB `CHECK` enforces `end_at = start_at + 1 h` and :00/:30. |
| R-COURT-02 | A booking must be for an **active** court, **in the future**, and not in a maintenance block. Bookable window: today … today + 60 days. |
| R-COURT-03 | **A court can never be double-booked.** Two bookings that stand on one court may not overlap in time (DB exclusion constraint `court_bookings_no_overlap`, `WHERE cancelled_at IS NULL`; half-hour offsets overlap too). A cancelled booking frees the slot. Maintenance blocks are bookings too, so they block regular bookings. The API maps the violation to `BOOKING_CONFLICT`. |
| R-COURT-04 | **Max plays per member per IST day = effective plan's `max_plays_per_day` (default 2).** Count = the member's `REGULAR` bookings that stand and start on that IST date. Maintenance blocks and guests do not count. The check and insert share a transaction holding a per-member advisory lock. Over the limit ⇒ `DAILY_BOOKING_LIMIT`. |
| R-COURT-05 | **Court price:** `list_price = courts.walk_in_rate_per_hour`. Member with effective plan: `discount_amount = percentOf(list, plan.court_discount_percent)`; amount due = `list_price − discount_amount` (100 % ⇒ 0, "free"). Walk-ins, guests and members without an effective plan pay `list_price`. A free trial is a guest booking with `discount_amount = list_price`; maintenance has price 0. |
| R-COURT-06 | **Payment:** pay when booking (`payment_method` given) or later at the desk (payment status `PENDING`). Amount due 0 ⇒ `NOT_REQUIRED`. A booking may be used/attended while `PENDING`; unpaid bookings are visible to the desk. The payment status comes from the view `court_booking_totals`. |
| R-COURT-07 | **Cancellation:** only bookings that stand and whose `start_at` is in the future. Full refund when `start_at − now ≥` ⚙ `cancellation_cutoff_hours` (2 h); inside the window members get no refund; staff may override with `refund: true`. Cancelling sets `cancelled_at` and refunds via `PaymentsService.refundSource`. |
| R-COURT-08 | **Who:** MEMBER books/cancels only for themselves; FRONT_DESK/OWNER for any member or a walk-in (`guest_name` + `guest_phone`); phone bookings are made by staff the same way. |
| R-COURT-09 | **A booking has no stored status.** It stands until `cancelled_at` is set; the view `court_booking_totals` reports `CANCELLED` (cancelled_at set), `COMPLETED` (`end_at` has passed) or `CONFIRMED`. Nothing has to be marked completed. |
| R-COURT-10 | **Maintenance:** the owner blocks time as 1-hour `MAINTENANCE` bookings (no customer). Existing bookings that stand in the range make the block fail with `BOOKING_CONFLICT`; they must be cancelled first. |

## Shop & inventory

| ID | Rule |
|---|---|
| R-SHOP-01 | **One shelf.** Counter (`IN_STORE`) and website (`PICKUP` / `DELIVERY`) orders decrement the same `products.stock_quantity` (ADR-007). |
| R-SHOP-02 | **Stock is validated and decremented atomically** per line: `UPDATE products SET stock_quantity = stock_quantity − :q WHERE id = :id AND stock_quantity ≥ :q AND is_active`. Zero rows ⇒ whole order rolls back with `OUT_OF_STOCK`. `CHECK (stock_quantity ≥ 0)` is the backstop. The owner restocks or corrects stock with `inventory.adjust`; there is no stock ledger (ADR-016). |
| R-SHOP-03 | **Low stock:** `stock_quantity ≤ low_stock_threshold` (default ⚙ `low_stock_default_threshold` 5). `stock_status`: 0 ⇒ `OUT_OF_STOCK`, ≤ threshold ⇒ `LOW_STOCK`, else `IN_STOCK`. The low-stock list (`inventory.lowStock`) is the alert: nothing is sent. |
| R-SHOP-04 | **Member discount:** `discount_amount = percentOf(subtotal, plan.shop_discount_percent)` of the effective plan (R-MEM-04); guests none. |
| R-SHOP-05 | **Delivery fee** (DELIVERY only) = ⚙ `delivery_fee` (₹50) unless `subtotal − discount ≥` ⚙ `free_delivery_above` (₹2000). Total = `subtotal − discount + delivery_fee` (view `shop_order_totals`). Delivery requires `delivery_address` (`DELIVERY_ADDRESS_REQUIRED`). |
| R-SHOP-06 | **Fulfilment:** MEMBER orders are `PICKUP` or `DELIVERY` and are paid `ONLINE`. Staff orders are `IN_STORE`, created `COMPLETED`, paid CASH/CARD/UPI at once. Only members (or staff on their behalf) can order; visitors browse. There is no separate "channel": it follows from the fulfilment. |
| R-SHOP-07 | **Order states** (`SHOP_ORDER_TRANSITIONS`): `PLACED → CONFIRMED → READY_FOR_PICKUP (PICKUP only) | OUT_FOR_DELIVERY (DELIVERY only) → COMPLETED`; `CANCELLED` from any non-final state. |
| R-SHOP-08 | **Cancel:** member only while `PLACED`; staff until `COMPLETED`. Stock is added back; payment refunded in full (the order then reports payment status `REFUNDED`). |
| R-SHOP-09 | Products are never deleted (`is_active = false`). Order lines snapshot `product_name` and `unit_price`. Stock changes only through orders and `/inventory/adjustments` (never `PATCH /shop/products/:id`). |

## Cafe, kitchen

| ID | Rule |
|---|---|
| R-BAR-01 | **Members get their cafe discount automatically:** `discount_amount = percentOf(subtotal, plan.bar_discount_percent)` of the effective plan for the identified member. Nobody has to ask. |
| R-BAR-02 | Guests pay list price. Items snapshot `item_name`/`unit_price`; unavailable items cannot be ordered (`MENU_ITEM_UNAVAILABLE`). |
| R-BAR-03 | **A cafe order is one kitchen ticket.** It belongs to a member or a named guest and/or carries a free-text `table_label` (at least one of the three, DB CHECK). There are no table or tab records (ADR-016). |
| R-BAR-04 | **Every order is paid by itself:** at once (`payment_method` on creation) or later at the desk with `POST /payments` (`BAR_ORDER`). Total = `subtotal − discount_amount` and the payment status come from the view `bar_order_totals`. |
| R-BAR-05 | Methods: CASH, CARD, UPI at the desk (guests too). |
| R-BAR-07 | **Kitchen states** (`ORDER_TRANSITIONS`): `NEW → PREPARING → READY → SERVED`; `NEW → CANCELLED`. `bar_orders.status` is the only record of progress. |
| R-BAR-08 | Staff may cancel a cafe order only while `NEW`; a paid cancelled order is refunded. |
| R-BAR-09 | **Daily cafe revenue** (closing report) = payments for `BAR_ORDER` sources by IST `paid_at` date, net of refunds, split by method, plus the staff on the BAR shift. |
| R-BAR-10 | Out of scope: alcohol licensing / age checks (the seed menu has no alcohol). |

## Enquiries

| ID | Rule |
|---|---|
| R-ENQ-01 | Every submission is stored and never vanishes. Public submissions come from the website; staff log phone and walk-in enquiries with the same endpoint. |
| R-ENQ-02 | An enquiry is **new** while `handled_at IS NULL`; the front desk marks it handled (sets `handled_at`) or reopens it. The inbox lists unhandled enquiries first. Nothing else is tracked: no quotes, follow-up log or funnel (ADR-016). |

## Invoices & business clients

| ID | Rule |
|---|---|
| R-INVC-01 | Stored invoice states follow `INVOICE_TRANSITIONS`: `DRAFT → SENT | VOID`, `SENT → VOID`. Only `DRAFT` invoices are editable (`INVOICE_NOT_EDITABLE`). |
| R-INVC-02 | **Paid state is derived** from the payments (view `invoice_totals`): fully paid ⇒ `PAID`, partly paid ⇒ `PARTIALLY_PAID`. Over-payment is rejected (`PAYMENT_AMOUNT_MISMATCH`). |
| R-INVC-03 | **Overdue is derived:** a `SENT` invoice with `due_date < today (IST)` that is not fully paid is `OVERDUE`. No job persists it. |
| R-INVC-04 | `void` only when nothing has been paid. Invoice numbers are sequential and never reused. |
| R-INVC-05 | The exact nature of "business client" services is unspecified in the brief (ASSUMPTIONS A-05): invoices are free-form line items; no supplier/vendor workflow exists. |

## Staff & HR

| ID | Rule |
|---|---|
| R-HR-01 | Shifts are same-day (`end_time > start_time`); a staff member cannot have overlapping shifts on a date or a shift on a date covered by `APPROVED` leave (`SHIFT_OVERLAP`). |
| R-HR-02 | Leave: `end_date ≥ start_date`, no overlap with other `PENDING`/`APPROVED` leave of the same person (`LEAVE_OVERLAP`). States: `PENDING → APPROVED | REJECTED | CANCELLED`, `APPROVED → CANCELLED`. Only OWNER_ADMIN decides; rejection needs a note. |
| R-HR-03 | Deactivating a staff member sets `users.is_active = false` (login blocked, history kept). The employee record has no separate active flag. |

## Security & data

| ID | Rule |
|---|---|
| R-SEC-01 | Roles and own-record scoping per [PERMISSIONS_MATRIX.md](../security/PERMISSIONS_MATRIX.md); enforced server-side. |
| R-SEC-02 | Passwords: min 8 chars with a letter and a digit, bcrypt-hashed; `password_hash` never leaves the server. Staff/desk-created accounts start with `must_change_password = true`. |
| R-DATA-01 | Money = 2-decimal strings; timestamps = UTC ISO with ms; business dates = IST; ids = UUID. See [SHARED_TYPES.md](../contracts/SHARED_TYPES.md#conventions). |
| R-DATA-02 | Financial and operational records are never hard-deleted; use cancel / void / refund / `is_active`. |

---

## Reference queries (copy, don't re-invent)

**Plays used by member `:m` on IST date `:d` (R-COURT-04):**
```sql
SELECT count(*) AS plays_used FROM court_bookings b
 WHERE b.member_id = :m AND b.booking_type = 'REGULAR' AND b.cancelled_at IS NULL
   AND (b.start_at AT TIME ZONE 'Asia/Kolkata')::date = :d;
```

**Effective membership of member `:m` on IST date `:d` (R-MEM-04):**
```sql
SELECT ms.*, p.* FROM memberships ms JOIN membership_plans p ON p.id = ms.membership_plan_id
WHERE ms.member_id = :m AND ms.cancelled_at IS NULL
  AND :d BETWEEN ms.start_date AND ms.end_date
ORDER BY ms.start_date DESC LIMIT 1;
```

**Derived membership status (R-MEM-04):** `SELECT * FROM membership_terms WHERE member_id = :m` (one row per term, with `status`), or `SELECT * FROM member_membership_status WHERE member_id = :m` (ACTIVE / EXPIRED, plan type, days remaining).

**Availability of court `:c` on IST date `:d` (R-COURT-03):** generate slot starts with `slotStarts()` (shared/lib/time.ts) and mark a slot BOOKED when a booking that stands overlaps `[start, start+1h)`:
```sql
SELECT start_at, booking_type FROM court_bookings
WHERE court_id = :c AND cancelled_at IS NULL
  AND tstzrange(start_at, end_at, '[)') && tstzrange(:day_start, :day_end, '[)');
```
A slot starting at 18:30 is blocked by a booking 18:00–19:00 *and* by one 19:00–20:00 (it would overlap 19:00–19:30).

**Atomic stock decrement (R-SHOP-02):** see the SQL in the rule; always inside the order transaction.

**Amount due, paid and payment status of a bill (R-COURT-06, R-SHOP-05, R-BAR-04, R-FIN-08):** read the view for its kind — `court_booking_totals`, `shop_order_totals`, `bar_order_totals`, `invoice_totals`. All use `payment_state(amount_due, gross_paid, net_paid)`.

**Revenue by category for a period (R-FIN-07):**
```sql
SELECT l.revenue_category, sum(p.amount - p.refunded_amount) AS revenue,
       sum(p.tax_amount * (p.amount - p.refunded_amount) / p.amount) AS tax
FROM payments p JOIN payment_ledger l ON l.payment_id = p.id
WHERE (p.paid_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :from AND :to
GROUP BY l.revenue_category;
```
