# Backend (to be built — structure and rules are fixed now)

> No application code exists yet. This file is the **layout contract** so four developers can add modules in parallel without touching each other's files.

**Stack (ADR-008):** Node.js 22 · TypeScript · Express · `pg` (plain SQL, no ORM) · `zod` for request validation · `jsonwebtoken` + `bcryptjs`. Contracts come from `/shared`; HTTP shapes from `docs/api/API_CONTRACT.md`.

```
backend/
  package.json  tsconfig.json  (paths: "@shared/*" -> ../shared/*)
  src/
    server.ts            boot: load config, create app, listen                     (Dev 1)
    app.ts               middleware chain + AUTO-REGISTERS every modules/*/index.ts  (Dev 1)
    config.ts            validated env (docs/integration/ENVIRONMENT.md)            (Dev 1)
    kernel/              SHARED KERNEL — read-only for everyone except Dev 1
      db.ts              pg Pool, query(), withTransaction(fn), error mapping 23P01/23514/23505
      http.ts            ok(), created(), page(), asyncHandler()   <- the ONLY way to build responses
      errors.ts          AppError(code, details)  (codes from @shared/constants/errors)
      auth.ts            requireAuth, requireRole(...roles), callerScope(req) { member_id | staff_id | business_client_id }
      validate.ts        zod helpers; one schema per generated *Request / *Query type
      settings.ts        SettingsService.get(key) (cached, read-only; writes via the settings module)
    modules/             ONE FOLDER PER API MODULE — owned by exactly one developer
      <module>/
        index.ts         export default { basePath: '/bookings', router }   (auto-discovered)
        routes.ts        route -> validate -> service
        service.ts       business rules + transactions   (other modules call THIS, never your tables)
        repo.ts          SQL for the module's own tables
        schema.ts        zod schemas (mirror @shared/types/requests.generated)
        __tests__/
    jobs/                daily job: membership expiry, booking completion, invoice overdue (Dev 2 + Dev 4 add files)
  scripts/               one-off dev scripts
```

## Module → owner → folder
See [OWNERSHIP_MAP.md](../docs/integration/OWNERSHIP_MAP.md). Folder names = the `module` column of the API contract (`auth`, `public`, `members`, `memberships`, `courts`, `bookings`, `shop`, `inventory`, `bar`, `kitchen`, `enquiries`, `clients`, `invoices`, `payments`, `staff`, `reports`, `settings`).

## Rules
1. **Respond only through `kernel/http.ts`** (`{ success, data, meta?, message? }`) and **fail only by throwing `AppError(code, details)`** with a code from `shared/constants/errors.ts`. No `res.status(400).json({...})` by hand.
2. **Validate at the edge, authorise in the route, enforce in the DB.** `requireRole(...)` copies the `roles` of the endpoint in `endpoints.mjs`; own-record scoping is applied in the service with `callerScope`.
3. **Every multi-table write is one `withTransaction`.** Row-level atomicity beats app-level checks (e.g. `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1`).
4. **Money & dates:** use `shared/lib/money.ts` and `shared/lib/time.ts`. Configure `pg` type parsers once in `kernel/db.ts`: `numeric` → string (default), `date` → raw string (OID 1082), `int8` → number, `timestamptz` → ISO string via `toISOString()`.
5. **No cross-module SQL.** Need a member's discount? call `MembershipService.getEffectiveMembership` — don't join `memberships` yourself (see [SYSTEM_ARCHITECTURE §5](../docs/architecture/SYSTEM_ARCHITECTURE.md#5-internal-service-contracts)).
6. **Don't edit `kernel/` or another module's folder.** Need a change? Ask the owner; for tiny fixes open a PR and tag them.
7. Tests: at minimum the critical rules in [INTEGRATION_CHECKLIST.md](../docs/integration/INTEGRATION_CHECKLIST.md) (double booking, daily limit, oversell, payment totals) against a real Postgres (use `npm run db:reset` first).
