# Definition of Done

A module/feature is **not done** until every box below is ticked. "Done" is verified by a *different* developer (§ cross-test in [TEAM_GUIDELINES](TEAM_GUIDELINES.md)).

## 1. Every module

- [ ] **UI implemented** for every role that uses it (see the feature's rows in [PERMISSIONS_MATRIX.md](../security/PERMISSIONS_MATRIX.md)).
- [ ] **API integrated** — UI talks to the real endpoint (no leftover mock imports), via `api/<module>.ts` and the shared `client.ts`.
- [ ] **Database mapping verified** — queries use only columns from `DATABASE_SCHEMA.md`; multi-table writes in one transaction; module touches only its own tables (other modules via services).
- [ ] **Shared types used** — all request/response types imported from `/shared`; no local re-declaration; field names snake_case.
- [ ] **No duplicated constants** — enums, statuses, error codes, tax rates, hours, fees come from `/shared` or `club_settings`; no magic strings (`'CONFIRMED'`) typed by hand.
- [ ] **No hardcoded incompatible field names** — `npm run check` passes; grep for `Id\b|At\b` camelCase fields returns nothing in your module.
- [ ] **Validation implemented** — request validated against the contract (required, types, ranges, enums); invalid input → `400 VALIDATION_ERROR` with `details.fields`.
- [ ] **Business rules implemented** — each cited `R-…` id in the module's code comments and covered by at least one test.
- [ ] **Error states handled** — every documented error code for the endpoint is surfaced with a useful message; network failure and 401/403 handled globally.
- [ ] **Loading, empty and error states** exist on every screen and list.
- [ ] **Mock data tested** — works on a fresh `npm run db:reset` seed, and the demo-path rows for your module behave as in [mock-data/README.md](../../mock-data/README.md).
- [ ] **Role permissions tested** — each role is allowed what the matrix says and receives `403 FORBIDDEN` otherwise; own-record scoping verified (member A cannot read member B's data).
- [ ] **Response/format conventions** — envelope, pagination meta, money strings, UTC timestamps, IST business dates.
- [ ] **Docs impact** — if you changed a contract, the regenerated files are in the PR; new assumptions added to ASSUMPTIONS.md.
- [ ] **Responsive** — usable at 375 px (member/public screens) and tablet (desk/kitchen).
- [ ] **Integration tested** — works against `develop` with the other modules; `npm run check` and `npm run check:db` green.
- [ ] **Peer review + cross-test** done by another developer; bugs found are fixed or ticketed.

## 2. Extra checks per module

### Developer 1 — Platform, Identity & Public
- [ ] Signup → login → correct `redirect_to` for **all five roles** (seed accounts in mock-data README).
- [ ] Unauthenticated access to every private route/API gives `AUTH_UNAUTHORIZED` and the UI redirects to login; public pages work without a token.
- [ ] Disabled user cannot log in; staff-created accounts are forced to change password.
- [ ] Public home shows club info, plans, courts + availability, shop, cafe menu, enquiry/trial form — all from the API, none hardcoded.
- [ ] Enquiry from the website appears in the front desk inbox (`handled_at` empty); marking it handled sets `handled_at`, reopening clears it.
- [ ] Kernel: every response through `ok()/page()`, every failure through `AppError`; DB errors mapped (23P01, 23514, 23505).

### Developer 2 — Membership, Courts & Front Desk
- [ ] Availability grid shows 30-minute starts, hides/marks past, booked and blocked slots; correct for half-hour overlaps.
- [ ] **Double booking impossible**: two simultaneous `POST /bookings` for the same slot → exactly one 201, one `BOOKING_CONFLICT`.
- [ ] Third play in an IST day → `DAILY_BOOKING_LIMIT` (REGULAR bookings that stand count); cancelled bookings don't count.
- [ ] Prices: Gold ₹0, Silver 50 %, Junior 70 %, walk-in / expired / no-plan full rate; `PriceBreakdown` equals what `create` stores.
- [ ] Cancellation: inside/outside cut-off, member vs staff override, refund recorded, slot reusable immediately.
- [ ] Plan change: the old term ends yesterday (derived `EXPIRED`), the new term starts today (derived `ACTIVE`), benefits switch for new transactions only.
- [ ] Expiry: `expiring` list correct; status is derived from dates (no job); early renewal → derived `UPCOMING`.
- [ ] Junior under-18 enforced.
- [ ] Front desk can register, search (name/phone/code), and see history in one screen.
- [ ] Payment adapters implemented for `COURT_BOOKING`, `MEMBERSHIP`.

### Developer 3 — Commerce, Cafe & Kitchen
- [ ] Concurrent orders for the last unit: exactly one succeeds; stock never negative.
- [ ] Counter and online orders both reduce the same stock; cancel restores it; the low-stock list is correct.
- [ ] Member discount automatic for shop and bar (Gold 15 %, Silver 10 %, Junior 5 %); guests list price; delivery fee/free threshold.
- [ ] Pickup and delivery status paths enforced (no `OUT_FOR_DELIVERY` for pickup).
- [ ] Cafe order → appears on kitchen board within 5 s; kitchen sees **no prices**; illegal status jumps rejected.
- [ ] Cafe order paid on its own: payment equals the order total, `payment_status` derived from `bar_order_totals`.
- [ ] `bar.dailySummary` equals the sum of BAR payments for the day (net of refunds).
- [ ] Payment adapters implemented for `SHOP_ORDER`, `BAR_ORDER`.

### Developer 4 — Owner, Finance & Reporting
- [ ] `PaymentsService`: source loaded via adapter, amount validated (full for non-invoice), tax derived, refund works, role/method rules enforced; the payment status of the source is derived by the views, never written.
- [ ] Invoice flow: draft → send → partial pay → full pay; overdue derived; void only unpaid; totals = subtotal + tax (R-FIN-03).
- [ ] Reports reconcile: dashboard revenue = sum of `payments` net of refunds for the range; by-category and by-method totals equal the grand total; tax report uses R-FIN-07.
- [ ] Leave: request → approve/reject; shifts reject overlaps and approved-leave days; payroll unique per month.
- [ ] Settings changes take effect (cache TTL) without redeploy; invalid values rejected.
- [ ] Every report endpoint is OWNER_ADMIN only; CSV export opens in Excel with correct columns.
- [ ] Owner dashboard works for TODAY / WEEK / MONTH.
