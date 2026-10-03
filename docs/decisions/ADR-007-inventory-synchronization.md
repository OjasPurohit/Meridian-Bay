# ADR-007 — Inventory synchronisation: one shelf, atomic decrement, ledger

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** Dev 3

## Context
Counter sales and online orders must draw from the same stock without overselling ("what a member buys at the counter and what they order from their sofa come from the same shelf").

## Decision
- Stock is `products.stock_quantity` with `CHECK (stock_quantity >= 0)`.
- Every sale runs, per line, inside the order transaction:
  `UPDATE products SET stock_quantity = stock_quantity - :q WHERE id = :id AND is_active AND stock_quantity >= :q`
  Zero rows updated ⇒ the whole order rolls back with `OUT_OF_STOCK`.
- Every stock change inserts `inventory_movements` (signed quantity, `quantity_after`, reason, optional order). Invariant: `SUM(quantity_change) = stock_quantity` per product (verified by `npm run check:db`).
- Cancelling an order restores stock through `CANCELLATION` movements.
- Low stock = `stock_quantity <= low_stock_threshold`; crossing it notifies the owner.
- No cart reservation: stock is taken when the order is placed.

## Consequences
- ✅ Overselling is impossible; every change is auditable.
- ⚠️ Abandoned carts hold nothing (acceptable).

## Alternatives considered
Separate online/offline stock pools · read-then-write in application code (race) · optimistic version column.
