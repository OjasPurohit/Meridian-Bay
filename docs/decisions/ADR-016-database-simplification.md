# ADR-016 — Database simplification: 31 tables → 22, one table = one real-world thing

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team · **Implemented by:** `database/migrations/0004_database_simplification.sql`

## Context
After ADR-015 (derived data is not stored) the schema still held tables whose features the product no longer needs: a tab / table-management system for the cafe, a kitchen status log, a CRM pipeline (quotes, follow-ups), in-app notifications, a stock ledger and Friday social play. Keeping them meant more tables, more endpoints and more rules for no real requirement.

## Decision
1. **Removed tables (9):** `order_status_events`, `bar_tabs`, `bar_tables`, `quotes`, `enquiry_follow_ups`, `notifications`, `inventory_movements`, `social_sessions`, `social_session_participants`.
2. **What replaces them**
   - A cafe order is one kitchen ticket paid by itself; `bar_orders.table_label` says where it is served. `bar_orders.status` (NEW → PREPARING → READY → SERVED) is the only record of progress.
   - `enquiries` is a plain inbox: `handled_at IS NULL` means it still waits for the front desk. A trial is an ordinary guest booking with the price discounted to zero.
   - What used to be a notification is a live count or list (new enquiries, expiring memberships, low stock, pending leave, orders in READY).
   - `products.stock_quantity` is the stock; there is no ledger.
   - Social play is not part of the product. Existing history is kept: each session's court hold became an ordinary booking that carries the participants' payments.
3. **Derived values are views, not columns** (extends ADR-015): booking status, amounts due, totals and payment status of bookings / shop orders / cafe orders / invoices, the invoice paid / overdue state, a payment's revenue category and refund status. One function `payment_state()` answers "how much of this bill is paid" for all of them.
4. **Snapshots stay stored** (they record a moment): `list_price`, `discount_amount`, `unit_price`, `product_name`, `item_name`, `price_paid`, `delivery_fee`, `tax_rate`, `payments.amount` and `payments.tax_amount`.
5. **Audit-only columns are removed** (`created_by_user_id`, `placed_by_user_id`, …). Only `payments.received_by_user_id` remains: who took the money.
6. **Kept on purpose to protect history:** `payments` (every column except the two derived ones), `members.joined_on`, `memberships.cancelled_at` / `cancellation_reason`, `invoices.member_id` (membership invoices), and `business_clients` exactly as they were (a client may have no login).

## Consequences
- ✅ 22 tables, 22 enums, 6 sequences, 7 views; foreign keys into `users` fall from about 23 to 4.
- ✅ The migration is transactional, aborts on contradictory data, announces every discarded column and asserts that revenue and tax per category are unchanged.
- ⚠️ 27 API endpoints and 24 functional requirements were retired (social play, tabs / tables, CRM follow-ups and quotes, notifications, stock ledger, booking completion, expiry job). The contract, rules and docs were updated in the same change.
- ⚠️ Tab payments were split pro rata across the tab's orders and social-play payments were re-pointed to the converted court booking: payment rows are never deleted, only re-pointed or split.
- ⚠️ The backend reads derived values from the views; no table column carries them any more.

## Alternatives considered
Keeping the tables behind unused endpoints (more schema than product) · generated columns to preserve the old API shape (the concepts themselves were unnecessary) · merging `members` / `staff` into `users` (loses the foreign-key guarantee that a `member_id` is a member).
