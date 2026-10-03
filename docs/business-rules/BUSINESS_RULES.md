# Business Rules — the single place

Every rule that changes behaviour lives **here**, with an ID. Other documents, code comments and tests cite the ID (`// R-COURT-04`) instead of restating the rule. If a rule changes, change it here first, then the code. Values marked ⚙ are **settings** (`club_settings`, owner-editable); ◼ are **invariants** (`shared/constants/rules.ts`); ◆ are **plan data** (`membership_plans`).

Conventions used below: *IST date* = `shared/lib/time.ts#istDate`; amounts are rupees in paise-exact arithmetic via `shared/lib/money.ts`; "live booking" = status `PENDING`, `CONFIRMED` or `COMPLETED`.

---

## Money & tax

| ID | Rule |
|---|---|
| R-FIN-01 | **All money received is a row in `payments`** (the revenue ledger). Nothing is "revenue" unless it is there. Reports sum this table. |
| R-FIN-02 | **Court, social-play, membership, shop and bar prices are tax-INCLUSIVE.** Stored/quoted price = what the customer pays. `tax_amount = round(gross × rate ÷ (100 + rate))` (`taxInclusive`). Rates ⚙: `tax_rate_court` 18, `tax_rate_membership` 18, `tax_rate_shop` 18, `tax_rate_bar` 5 (%). |
| R-FIN-03 | **Business/membership invoices are tax-EXCLUSIVE:** `subtotal = Σ line_total`; `tax_amount = round(subtotal × tax_rate ÷ 100)` (`taxExclusive`); `total_amount = subtotal + tax_amount`. Default rate ⚙ `tax_rate_business` 18. |
| R-FIN-04 | **Partial payments are allowed only on invoices.** Bookings, social spots, memberships, shop orders, bar orders and tabs are paid in full in one payment (`PAYMENT_AMOUNT_MISMATCH` otherwise). |
| R-FIN-05 | Invoice types: `BUSINESS` (to a business client) and `MEMBERSHIP` (to a member, e.g. renewal). A payment against an invoice has `revenue_category` = `BUSINESS` or `MEMBERSHIP` respectively; its `tax_amount` is the invoice tax pro-rated: `round(amount × invoice.tax_amount ÷ invoice.total_amount)`. |
| R-FIN-06 | **Refunds** are recorded on the original payment (`refunded_amount`, `refund_reason`, `refunded_at`; status `PARTIALLY_REFUNDED`/`REFUNDED`). Never delete or negate a payment. Cancellation flows refund automatically; manual refunds are OWNER_ADMIN only. `refunded_amount ≤ amount`. |
| R-FIN-07 | **Revenue** of a period = `Σ (amount − refunded_amount)` over payments with status `SUCCEEDED`/`PARTIALLY_REFUNDED`, by IST date of `paid_at`. **Tax collected** = same sum over `tax_amount`, pro-rated for partial refunds: `tax_amount × (amount − refunded_amount) ÷ amount`. |
| R-FIN-08 | **Outstanding** = `Σ (total_amount − amount_paid)` over invoices in `SENT`, `PARTIALLY_PAID`, `OVERDUE`. **Overdue** = those with `due_date < today (IST)`. Unpaid bookings/orders with `payment_status = PENDING` are "pending at desk", reported separately, not as outstanding invoices. |
| R-FIN-09 | **Rounding:** half-up to the paisa, at each derived field (discount, tax, delivery), never on running totals. `discount_amount = percentOf(list, pct)`; `amount_due = list − discount`. Money strings always have 2 decimals. |
| R-FIN-10 | **Payroll:** one `payroll_payments` row per employee per month (`pay_period` = first of month, unique). Amount defaults to `monthly_salary`. Payroll is an *expense* shown in the finance report; it is not in `payments`. |
| R-FIN-11 | Payment method by role (enforced on `POST /payments`): MEMBER & BUSINESS_CLIENT → `ONLINE`; FRONT_DESK → `CASH`/`CARD`/`UPI`; OWNER_ADMIN → any. Online = mock gateway in v1 (ADR-011). |

## Membership

| ID | Rule |
|---|---|
| R-MEM-01 | Gold, Silver and Junior are **plans** (`membership_plans.membership_type`), not roles or tables. All three log in as `MEMBER`. |
| R-MEM-02 | Plan benefits are **data** ◆: `court_discount_percent` (100 = courts free), `shop_discount_percent`, `bar_discount_percent`, `max_plays_per_day`, `price`, `duration_months`, `min_age`/`max_age`, `benefits[]`. No code may branch on the type name to compute a price or limit. Seed: Gold 100/15/15, Silver 50/10/10, Junior 70/5/5; all `max_plays_per_day = 2`. |
| R-MEM-03 | A membership **term** is one `memberships` row: `end_date = start_date + duration_months − 1 day` (inclusive last valid day, `termEndDate`). Every purchase, renewal or plan change creates a new row; the table *is* the history. |
| R-MEM-04 | **Effective membership** of member M on IST date D = the row with `start_date ≤ D ≤ end_date` and status ∉ {`CANCELLED`,`CHANGED`}. It is computed from dates, so it is correct even before the daily job runs. |
| R-MEM-05 | **No effective membership (none, expired, cancelled) ⇒ walk-in treatment:** list price, no discount, `max_plays_per_day` default 2. The member record, history and login remain valid. |
| R-MEM-06 | At most one `ACTIVE` row per member (DB unique index). **Early renewal:** allowed when the current term ends within ⚙ `membership_expiry_warning_days` (30); the new row is `UPCOMING`, `start_date = current end_date + 1`. Otherwise `MEMBERSHIP_ALREADY_ACTIVE`. |
| R-MEM-07 | **Junior is for under-18s:** at purchase, `age(date_of_birth, start_date) ≤ plan.max_age` and `≥ min_age`; DOB is required to buy Junior (`JUNIOR_AGE_INVALID`). A Junior who turns 18 mid-term keeps the term; the next renewal must be a non-Junior plan. |
| R-MEM-08 | **Plan change** (front desk/owner): only an `ACTIVE` term; old row → `CHANGED` with `end_date = yesterday`; new row `ACTIVE` from today with `previous_membership_id`; full price of the new plan, **no pro-rata credit** (ASSUMPTIONS A-07). Benefits switch immediately for new transactions; past transactions keep their snapshot. |
| R-MEM-09 | **Cancel** (owner): status `CANCELLED` + reason; benefits stop immediately; no automatic refund. |
| R-MEM-10 | **Expiry handling:** the daily job promotes `UPCOMING → ACTIVE` on `start_date`, sets `ACTIVE → EXPIRED` after `end_date`, creates `MEMBERSHIP_EXPIRING` notifications at ⚙ 30 days (and again at 7 days) and `MEMBERSHIP_EXPIRED` the day after. Nothing else depends on the job (R-MEM-04). |
| R-MEM-11 | Editing a plan never alters history: bookings, orders and social fees copy `list_price`, `discount_amount`, `membership_id` at transaction time. |

## Courts & bookings

| ID | Rule |
|---|---|
| R-COURT-01 | ◼ A session lasts **1 hour**; a **new slot starts every 30 minutes**. Valid starts: from ⚙ `club_open_time` to `club_close_time − 1 h`, minute ∈ {00, 30}. DB `CHECK` enforces `end_at = start_at + 1 h` and :00/:30. |
| R-COURT-02 | A booking must be for an **active** court, **in the future**, and not in a maintenance block. Bookable window: today … today + 60 days. |
| R-COURT-03 | **A court can never be double-booked.** Two live bookings on one court may not overlap in time (DB exclusion constraint `court_bookings_no_overlap`; half-hour offsets overlap too). A `CANCELLED` booking frees the slot. Social-session holds, trial sessions and maintenance blocks are bookings too, so they block regular bookings. The API maps the violation to `BOOKING_CONFLICT`. |
| R-COURT-04 | **Max plays per member per IST day = effective plan's `max_plays_per_day` (default 2).** Count = the member's `REGULAR` bookings (status ≠ `CANCELLED`) **plus** `JOINED` social-session participations whose court time starts on that IST date. `TRIAL`, `MAINTENANCE` and guests do not count. The check and insert share a transaction holding a per-member advisory lock. Over the limit ⇒ `DAILY_BOOKING_LIMIT`. (Social play counts: ASSUMPTIONS A-12.) |
| R-COURT-05 | **Court price:** `list_price = courts.walk_in_rate_per_hour`. Member with effective plan: `discount = percentOf(list, plan.court_discount_percent)`; `amount_due = list − discount` (100 % ⇒ 0, "free"). Walk-ins, guests and members without an effective plan pay `list_price`. `TRIAL` and `MAINTENANCE` have 0 price. |
| R-COURT-06 | **Payment:** pay when booking (`payment_method` given) or later at the desk (`payment_status = PENDING`). `amount_due = 0` ⇒ `NOT_REQUIRED`. A booking may be used/attended while `PENDING`; unpaid bookings are visible to the desk. |
| R-COURT-07 | **Cancellation:** only live bookings whose `start_at` is in the future. Full refund when `start_at − now ≥` ⚙ `cancellation_cutoff_hours` (2 h); inside the window members get no refund; staff may override with `refund: true`. Cancelling sets `cancelled_at/by`, reason, status `CANCELLED`, refunds via `PaymentsService.refundSource`. |
| R-COURT-08 | **Who:** MEMBER books/cancels only for themselves; FRONT_DESK/OWNER for any member or a walk-in (`guest_name` + `guest_phone`); phone bookings are made by staff the same way. |
| R-COURT-09 | **Booking states** (`BOOKING_TRANSITIONS`): `PENDING → CONFIRMED | CANCELLED`, `CONFIRMED → COMPLETED | CANCELLED`. v1 creates `CONFIRMED` directly; the daily job (or desk) completes bookings after `end_at`. |
| R-COURT-10 | **Maintenance:** the owner blocks time as 1-hour `MAINTENANCE` bookings (no customer). Existing live bookings in the range make the block fail with `BOOKING_CONFLICT`; they must be cancelled first. |

## Social play (Friday)

| ID | Rule |
|---|---|
| R-SOC-01 | A social session may be created only on ⚙ `social_play_weekday` (ISO 5 = Friday, IST) between ⚙ `social_play_start_time`–`social_play_end_time` (18:00–22:00), else `SOCIAL_PLAY_NOT_ALLOWED`. It occupies the court for that hour via a `SOCIAL_SESSION` booking (R-COURT-03). |
| R-SOC-02 | `capacity ≥ 2`. A join is refused when `JOINED` participants = capacity (`SOCIAL_SESSION_FULL`) — checked under a row lock on the session. One `JOINED` row per member per session (`ALREADY_JOINED`). |
| R-SOC-03 | **Fee:** `fee_per_person` is the guest/walk-in fee (tax-inclusive). Members pay `fee − percentOf(fee, plan.court_discount_percent)` (Gold ⇒ free). |
| R-SOC-04 | Joining counts toward the member's daily plays (R-COURT-04). |
| R-SOC-05 | **Leaving:** same cut-off as R-COURT-07 (refund if before the cut-off; otherwise none; staff override). Cancelling a session cancels its hold and refunds all participants. |
| R-SOC-06 | Guests join through the front desk (`guest_name`, `guest_phone`); they have no daily limit. |

## Shop & inventory

| ID | Rule |
|---|---|
| R-SHOP-01 | **One shelf.** Counter (`PHYSICAL`) and website (`ONLINE`) orders decrement the same `products.stock_quantity` (ADR-007). |
| R-SHOP-02 | **Stock is validated and decremented atomically** per line: `UPDATE products SET stock_quantity = stock_quantity − :q WHERE id = :id AND stock_quantity ≥ :q AND is_active`. Zero rows ⇒ whole order rolls back with `OUT_OF_STOCK`. `CHECK (stock_quantity ≥ 0)` is the backstop. Every change writes an `inventory_movements` row (`quantity_after` = new stock); `Σ quantity_change = stock_quantity`. |
| R-SHOP-03 | **Low stock:** `stock_quantity ≤ low_stock_threshold` (default ⚙ `low_stock_default_threshold` 5). `stock_status`: 0 ⇒ `OUT_OF_STOCK`, ≤ threshold ⇒ `LOW_STOCK`, else `IN_STOCK`. Crossing the threshold creates `LOW_STOCK` notifications for OWNER_ADMIN. |
| R-SHOP-04 | **Member discount:** `discount = percentOf(subtotal, plan.shop_discount_percent)` of the effective plan (R-MEM-04); guests none. |
| R-SHOP-05 | **Delivery fee** (DELIVERY only) = ⚙ `delivery_fee` (₹50) unless `subtotal − discount ≥` ⚙ `free_delivery_above` (₹2000). `total = subtotal − discount + delivery_fee`. Delivery requires `delivery_address` (`DELIVERY_ADDRESS_REQUIRED`). |
| R-SHOP-06 | **Channels:** MEMBER orders are `ONLINE` with `PICKUP`/`DELIVERY` and are paid `ONLINE`. Staff orders are `PHYSICAL` + `IN_STORE`, created `COMPLETED`, paid CASH/CARD/UPI at once. Only members (or staff on their behalf) can order; visitors browse. |
| R-SHOP-07 | **Order states** (`SHOP_ORDER_TRANSITIONS`): `PLACED → CONFIRMED → READY_FOR_PICKUP (PICKUP only) | OUT_FOR_DELIVERY (DELIVERY only) → COMPLETED`; `CANCELLED` from any non-final state. |
| R-SHOP-08 | **Cancel:** member only while `PLACED`; staff until `COMPLETED`. Stock returns (`CANCELLATION` movements); payment refunded in full (`payment_status = REFUNDED`). |
| R-SHOP-09 | Products are never deleted (`is_active = false`). Order lines snapshot `product_name` and `unit_price`. Stock changes only through orders and `/inventory/adjustments` (never `PATCH /shop/products/:id`). |

## Bar, tabs & kitchen

| ID | Rule |
|---|---|
| R-BAR-01 | **Members get their bar discount automatically:** `percentOf(subtotal, plan.bar_discount_percent)` of the effective plan for the identified member (or the tab's member). Nobody has to ask. |
| R-BAR-02 | Guests pay list price. Items snapshot `item_name`/`unit_price`; unavailable items cannot be ordered (`MENU_ITEM_UNAVAILABLE`). |
| R-BAR-03 | **Tabs:** a tab belongs to a member or a named guest (and optionally a table). Orders can be added while `OPEN`. A tab's orders are `payment_status = PENDING` until settlement. |
| R-BAR-04 | **Settlement** is one payment for the whole tab (source `TAB`, category `BAR`), allowed only when every non-cancelled order is `SERVED` (`TAB_HAS_ACTIVE_ORDERS`). The server computes `subtotal/discount/tax/total` from the orders; the client sends only the method. Afterwards the tab is `SETTLED`, its orders `PAID`, and the table is freed if idle. A tab must be settled or voided (owner, no billable orders). |
| R-BAR-05 | Methods: CASH, CARD, UPI at the desk (guests too). Orders not on a tab may be paid at once (`payment_method`) or later (`PENDING`). |
| R-BAR-06 | **Tables:** `OCCUPIED` when a tab is open or an order is active on it; staff free it after use; cannot be set `AVAILABLE` while occupied. `OUT_OF_SERVICE` tables can't be assigned (`TABLE_OCCUPIED`). |
| R-BAR-07 | **Kitchen states** (`ORDER_TRANSITIONS`): `NEW → ACCEPTED → PREPARING → READY → SERVED`; `NEW`/`ACCEPTED → CANCELLED` (reason required). Every transition inserts `order_status_events`; `READY` sets `ready_at` and notifies the staff member who took the order; `SERVED` sets `served_at`. |
| R-BAR-08 | Staff may cancel a bar order only while `NEW`/`ACCEPTED`; a paid cancelled order is refunded. |
| R-BAR-09 | **Daily bar revenue** (closing report) = payments with `revenue_category = BAR` by IST `paid_at` date, net of refunds, split by method; plus *open tabs amount* (earned, not yet collected) and the staff on the BAR shift. |
| R-BAR-10 | Out of scope: alcohol licensing / age checks (the seed menu has no alcohol). |

## Enquiries & CRM

| ID | Rule |
|---|---|
| R-ENQ-01 | Every submission is stored (`NEW`) and notifies all active FRONT_DESK + OWNER_ADMIN users. Public submissions are forced to `source = WEBSITE`. |
| R-ENQ-02 | States follow `ENQUIRY_TRANSITIONS`. A follow-up on a `NEW` enquiry moves it to `CONTACTED`. `LOST` requires `lost_reason`; a lost enquiry can be reopened to `FOLLOW_UP`. `CONVERTED` is set only by the convert operation. |
| R-ENQ-03 | A quote has number `QT-n`, amount, `valid_until`; sending it moves the enquiry to `QUOTE_SENT`. Statuses follow `QUOTE_TRANSITIONS`; unsent quotes can't be accepted. |
| R-ENQ-04 | **Convert** = register member (unique email) + buy plan + payment + mark enquiry `CONVERTED` + `converted_member_id` + accepted quote, in one transaction. |
| R-ENQ-05 | **Trial session:** a `TRIAL` booking (free, `NOT_REQUIRED`, guest from the enquiry, linked via `enquiry_id`) blocks the court like any booking and does not count toward any member's daily limit. |
| R-ENQ-06 | "Follow-up due" = `next_follow_up_at ≤ now` and status ∉ {`CONVERTED`, `LOST`}. |

## Invoices & business clients

| ID | Rule |
|---|---|
| R-INVC-01 | Invoice states follow `INVOICE_TRANSITIONS`. Only `DRAFT` invoices are editable (`INVOICE_NOT_EDITABLE`). `send` makes it visible to the client and notifies them. |
| R-INVC-02 | A payment updates `amount_paid`; `amount_paid = total` ⇒ `PAID`, `0 < amount_paid < total` ⇒ `PARTIALLY_PAID`. Over-payment is rejected (`PAYMENT_AMOUNT_MISMATCH`). |
| R-INVC-03 | **Overdue** = (`SENT` or `PARTIALLY_PAID`) with `due_date < today (IST)`; the daily job persists `OVERDUE`; reads derive it as well. |
| R-INVC-04 | `void` only when `amount_paid = 0`. Invoice numbers are sequential and never reused. |
| R-INVC-05 | The exact nature of "business client" services is unspecified in the brief (ASSUMPTIONS A-05): invoices are free-form line items; no supplier/vendor workflow exists. |

## Staff & HR

| ID | Rule |
|---|---|
| R-HR-01 | Shifts are same-day (`end_time > start_time`); a staff member cannot have overlapping shifts on a date or a shift on a date covered by `APPROVED` leave (`SHIFT_OVERLAP`). |
| R-HR-02 | Leave: `end_date ≥ start_date`, no overlap with other `PENDING`/`APPROVED` leave of the same person (`LEAVE_OVERLAP`). States: `PENDING → APPROVED | REJECTED | CANCELLED`, `APPROVED → CANCELLED`. Only OWNER_ADMIN decides; rejection needs a note. |
| R-HR-03 | Deactivating a staff member sets `staff.is_active = false` and `users.is_active = false` (login blocked, history kept). |

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
SELECT
  (SELECT count(*) FROM court_bookings b
    WHERE b.member_id = :m AND b.booking_type = 'REGULAR' AND b.status <> 'CANCELLED'
      AND (b.start_at AT TIME ZONE 'Asia/Kolkata')::date = :d)
+ (SELECT count(*) FROM social_session_participants p
    JOIN social_sessions s ON s.id = p.social_session_id
    JOIN court_bookings sb ON sb.id = s.court_booking_id
    WHERE p.member_id = :m AND p.status = 'JOINED' AND s.status <> 'CANCELLED'
      AND (sb.start_at AT TIME ZONE 'Asia/Kolkata')::date = :d) AS plays_used;
```

**Effective membership of member `:m` on IST date `:d` (R-MEM-04):**
```sql
SELECT ms.*, p.* FROM memberships ms JOIN membership_plans p ON p.id = ms.membership_plan_id
WHERE ms.member_id = :m AND ms.status NOT IN ('CANCELLED','CHANGED')
  AND :d BETWEEN ms.start_date AND ms.end_date
ORDER BY ms.start_date DESC LIMIT 1;
```

**Availability of court `:c` on IST date `:d` (R-COURT-03):** generate slot starts with `slotStarts()` (shared/lib/time.ts) and mark a slot BOOKED when a live booking overlaps `[start, start+1h)`:
```sql
SELECT start_at, booking_type FROM court_bookings
WHERE court_id = :c AND status IN ('PENDING','CONFIRMED','COMPLETED')
  AND tstzrange(start_at, end_at, '[)') && tstzrange(:day_start, :day_end, '[)');
```
A slot starting at 18:30 is blocked by a booking 18:00–19:00 *and* by one 19:00–20:00 (it would overlap 19:00–19:30).

**Atomic stock decrement (R-SHOP-02):** see the SQL in the rule; always inside the order transaction.

**Revenue by category for a period (R-FIN-07):**
```sql
SELECT revenue_category, sum(amount - refunded_amount) AS revenue, sum(tax_amount * (amount - refunded_amount) / amount) AS tax
FROM payments
WHERE status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
  AND (paid_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN :from AND :to
GROUP BY revenue_category;
```
