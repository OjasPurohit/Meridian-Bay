# ADR-009 — Payments: one revenue ledger with a polymorphic source; no separate kitchen table

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** Dev 4 (payments), Dev 3 (kitchen)

## Context
Money arrives from courts, social play, memberships, shop, bar orders/tabs and invoices, and the owner's problem is that "none of it is in one place". Separately, a kitchen order is simply a bar order seen from the kitchen.

## Decision
- `payments` is the single ledger. Columns: `source_type` + `source_id` (a deliberate polymorphic reference — one of only two, with `notifications.entity_id`), `revenue_category`, `method`, `amount` (tax-inclusive), `tax_amount`, `status`, refund columns, `received_by_user_id`, `paid_at`.
- Each source owner registers a **payment-source adapter**, so `PaymentsService` never reads another module's tables (SYSTEM_ARCHITECTURE §5).
- Source rows keep a denormalised `payment_status` for fast screens.
- Reports aggregate `payments` only.
- **Kitchen:** `bar_orders` *is* the kitchen queue. The kitchen reads a price-free projection (`KitchenOrder`); history is in `order_status_events`. No `kitchen_orders` or `revenue_transactions` tables exist.

## Consequences
- ✅ One source for finance; reconciliation is trivial (`check:db` ties invoices to payments and stock to the ledger).
- ⚠️ No foreign-key integrity on `source_id`: enforced in `PaymentsService` and by `npm run check` on seed data.

## Alternatives considered
One payments table per source (reports need six UNIONs) · six nullable FK columns on `payments`.
