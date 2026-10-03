# ADR-013 — Money, tax and time conventions

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
Rounding and timezone bugs silently corrupt revenue and the daily play limit.

## Decision
**Money**
- DB: `numeric(12,2)`; JSON: 2-decimal **strings** (`"1250.00"`); arithmetic in integer **paise**; half-up rounding applied per derived field (discount, tax, delivery), never to running totals.
- One implementation: `shared/lib/money.ts` (`toPaise`, `fromPaise`, `percentOf`, `taxInclusive`, `taxExclusive`, `applyDiscount`, `formatInr`).
- Prices are **tax-inclusive** (GST portion stored in `tax_amount`); **invoices are tax-exclusive**.

**Time**
- `timestamptz` stored in UTC; API timestamps are ISO-8601 with milliseconds and `Z`.
- "Business dates" are **IST** (`Asia/Kolkata`, +05:30, no DST), computed only with `shared/lib/time.ts`, never with the server's local zone.
- The daily play limit, reports, social-play weekday, expiry and "today" all use the IST date.

## Consequences
- ✅ Totals reconcile to the paisa; behaviour is testable and identical on every machine.
- ⚠️ The UI must format strings (helpers provided).

## Alternatives considered
Floating-point rupees · integer paise in the database (less readable, no real gain).
