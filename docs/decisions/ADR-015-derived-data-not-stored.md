# ADR-015 — One fact, one place: derived data is generated or computed, not stored

**Status:** accepted, extended by [ADR-016](ADR-016-database-simplification.md) · **Date:** 2026-10-03 · **Owners:** whole team · **Implemented by:** `database/migrations/0003_database_cleanup.sql`

## Context
A schema audit found values stored twice: a column and the columns it follows from. Two copies can disagree (a membership marked `ACTIVE` past its `end_date`, a notification with `is_read = false` and a `read_at`). The audit also questioned `bar_tables`, `bar_tabs`, `order_status_events` and `quotes`.

## Decision
1. **Membership status is never stored.** A term is `member + plan + start_date + end_date`. `ACTIVE` / `EXPIRED` (and `UPCOMING` / `CANCELLED` / `CHANGED`) are computed from the dates and `cancelled_at` by the view `membership_terms`; `member_membership_status` gives one ACTIVE / EXPIRED row per member (`NULL` = never had a plan). `memberships_no_overlap` (exclusion constraint) replaces "one ACTIVE row per member".
2. **A value that is a pure function of other columns of the same row becomes a `GENERATED ALWAYS … STORED` column**: `shop_orders.channel`, `court_bookings.customer_type`, `payroll_payments.status`, `notifications.is_read`. The column stays in the row type and the API (no contract change) but cannot be written, so it cannot drift.
3. **State that is not derivable stays stored and is guarded**: `payments.status` (FAILED is a real-gateway outcome, ADR-011) now has a CHECK tying it to `refunded_amount`; price / discount snapshots (`membership_id` on bookings and orders, `price_paid`) keep history stable (R-MEM-11); `staff.is_active` is set together with `users.is_active` (R-HR-03, probed by `npm run check:db`).
4. **No table was removed by 0003.** Removing the tables that the product no longer needs was a requirement change, decided separately in ADR-016 (migration 0004).

## Consequences
- ✅ The daily expiry job no longer flips statuses (it only sends notifications); status is correct at any instant.
- ✅ Four duplicated columns can no longer disagree with their source.
- ⚠️ The API still returns `status` on memberships: the backend must read it from `membership_terms` (a `MembershipView.status` field, not a table column).
- ⚠️ Generated columns are physically stored, so they appear last in the table; INSERT / UPDATE must not name them (the seed generator and tests were adapted).
- ⚠️ `cancelled_at` now also marks "ended early by a plan change" (R-MEM-08); a cancelled term that has a linked later term reports `CHANGED`.

## Alternatives considered
Dropping the four columns and computing them in every query (changes `shared/types` and the contract for no gain) · keeping `memberships.status` and the daily job (two copies of one fact) · deleting the bar tables (contradicts MUST requirements) · virtual generated columns (PostgreSQL 18 only; Supabase runs older versions — ADR-001).

## Update (ADR-016, migration 0004)
The four generated columns of decision 2 were later dropped altogether (`channel`, `customer_type`, payroll `status`, and `is_read` with its table): the concepts were unnecessary. `payments.status` and the `membership_id` snapshots of decision 3 were also removed, because the status is derived from `refunded_amount` and the discount is already recorded. The `CHANGED` membership status no longer exists: a replaced term simply ends the day before the next one starts.
