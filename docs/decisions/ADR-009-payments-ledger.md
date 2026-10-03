# ADR-009 — Payments: one revenue ledger with a polymorphic source; no separate kitchen table

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** Dev 4 (payments), Dev 3 (kitchen)

## Context
Money arrives from courts, memberships, shop, cafe orders and invoices, and the owner's problem is that "none of it is in one place". Separately, a kitchen order is simply a bar order seen from the kitchen.

## Decision
- `payments` is the single ledger. Columns: `source_type` + `source_id` (a deliberate polymorphic reference, the only one), `method`, `amount` (tax-inclusive), `tax_amount`, refund columns, `received_by_user_id`, `paid_at`. The revenue category and the refund status are derived by the view `payment_ledger` (ADR-016).
- Each source owner registers a **payment-source adapter**, so `PaymentsService` never reads another module's tables (SYSTEM_ARCHITECTURE §5).
- Source rows keep NO payment status: it is derived from the payments by the `*_totals` views (ADR-016).
- Reports aggregate `payments` only.
- **Kitchen:** `bar_orders` *is* the kitchen queue. The kitchen reads a price-free projection (`KitchenOrder`); `bar_orders.status` is the only record of progress (no event log, ADR-016). No `kitchen_orders` or `revenue_transactions` tables exist.

## Consequences
- ✅ One source for finance; reconciliation is trivial (`check:db` ties every payment to an existing source and checks nothing is over-paid).
- ⚠️ No foreign-key integrity on `source_id`: enforced in `PaymentsService` and by `npm run check` on seed data.

## Alternatives considered
One payments table per source (reports need six UNIONs) · six nullable FK columns on `payments`.
