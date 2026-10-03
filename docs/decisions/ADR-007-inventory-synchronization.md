# ADR-007 — Inventory synchronisation: one shelf, atomic decrement

**Status:** accepted, ledger removed by [ADR-016](ADR-016-database-simplification.md) · **Date:** 2026-10-03 · **Owners:** Dev 3

## Context
Counter sales and online orders must draw from the same stock without overselling ("what a member buys at the counter and what they order from their sofa come from the same shelf").

## Decision
- Stock is `products.stock_quantity` with `CHECK (stock_quantity >= 0)`.
- Every sale runs, per line, inside the order transaction:
  `UPDATE products SET stock_quantity = stock_quantity - :q WHERE id = :id AND is_active AND stock_quantity >= :q`
  Zero rows updated ⇒ the whole order rolls back with `OUT_OF_STOCK`.
- `products.stock_quantity` IS the stock: sales decrement it, cancellations add the quantities back, the owner restocks or corrects it with `inventory.adjust`. There is no stock ledger (ADR-016): it was history nobody read.
- Low stock = `stock_quantity <= low_stock_threshold`; the low-stock list is the alert.
- No cart reservation: stock is taken when the order is placed.

## Consequences
- ✅ Overselling is impossible; one number per product is easy to understand.
- ⚠️ No history of who changed the stock when.
- ⚠️ Abandoned carts hold nothing (acceptable).

## Alternatives considered
Separate online/offline stock pools · read-then-write in application code (race) · optimistic version column.
