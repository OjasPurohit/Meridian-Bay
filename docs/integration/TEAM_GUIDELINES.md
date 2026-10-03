# Team Guidelines — 4 developers, 12 hours

The goal of everything below: **four people build in parallel, then integrate without renaming variables, redesigning APIs, changing the schema or discovering missing requirements at the last minute.**

Quick links: [Ownership map](OWNERSHIP_MAP.md) · [Definition of Done](DEFINITION_OF_DONE.md) · [Integration checklist](INTEGRATION_CHECKLIST.md) · [Environment](ENVIRONMENT.md) · [API contract](../api/API_CONTRACT.md) · [Business rules](../business-rules/BUSINESS_RULES.md)

## 1. Golden rules

1. **One source of truth per thing.** You may *read* any of them anywhere; you may *change* them only through the process in §5.

   | Thing | Single source | Everything else is… |
   |---|---|---|
   | Schema | `database/migrations/*.sql` | generated docs, `rows.ts` (verified) |
   | Enums | `shared/constants/enums.ts` | imported — never re-declared |
   | Error codes | `shared/constants/errors.ts` | imported |
   | Business invariants & state machines | `shared/constants/rules.ts` | imported |
   | Types | `shared/types/*.ts` | imported |
   | Money / IST maths | `shared/lib/money.ts`, `time.ts` | imported |
   | API | `tools/api/endpoints.mjs` | generated contract, OpenAPI, request types, permissions |
   | Requirements | `tools/api/requirements.mjs` | generated requirements + traceability |
   | Business rules (prose) | `docs/business-rules/BUSINESS_RULES.md` | cited by ID |
   | Mock/seed data | `tools/gen-mock.mjs` | generated JSON + `seed.sql` |
2. **Field names are snake_case and identical in DB, JSON and TypeScript.** `member_id`, never `memberId`.
3. **Never hardcode what is data:** membership behaviour (plans), tax rates, hours, fees (settings).
4. **Never touch another module's tables or folders.** Call their service (SYSTEM_ARCHITECTURE §5) or ask them.
5. **The database is the last line of defence.** If a rule matters (overlap, stock ≥ 0, one active membership), it is a constraint, not just an `if`.
6. **Run `npm run check && npm run check:db` before every PR.** Red = not mergeable.
7. **Nothing is merged to `main` that doesn't run the demo path** (§8).

## 2. Who owns what

Four vertical slices (API module + tables + UI). Full table with endpoints: [OWNERSHIP_MAP.md](OWNERSHIP_MAP.md).

| | Developer 1 — Platform, Identity & Public Experience | Developer 2 — Membership, Courts & Front Desk | Developer 3 — Commerce, Bar & Kitchen | Developer 4 — Owner, Finance & Reporting |
|---|---|---|---|---|
| **API modules** | `auth`, `public`, `notifications`, `enquiries` | `members`, `memberships`, `courts`, `bookings`, `social` | `shop`, `inventory`, `bar`, `kitchen` | `payments`, `invoices`, `clients`, `staff`, `reports`, `settings` |
| **Tables** | `users`, `notifications`, `enquiries`, `enquiry_follow_ups`, `quotes` | `members`, `membership_plans`, `memberships`, `courts`, `court_bookings`, `social_*` | `products`, `shop_*`, `inventory_movements`, `bar_*`, `order_status_events` | `payments`, `invoices`, `invoice_items`, `business_clients`, `staff*`, `staff_shifts`, `leave_requests`, `payroll_payments`, `club_settings` |
| **Backend kernel** | **owns** `kernel/*`, `app.ts`, `config.ts` | uses | uses | uses |
| **Shared service they publish** | `withTransaction`, `AppError`, `ok/page`, `requireRole`, `NotificationsService`, `SettingsService.get` | `MembershipService`, `MembersService.register`, `BookingService.createTrial/playsUsedOn` | (none; implements payment adapters for shop/bar) | `PaymentsService.record/refundSource`, adapter registry |
| **UI** | Public website, login/signup, Member dashboard shell + profile, notification bell, Enquiry/CRM screens | Front Desk dashboard (members, bookings, social), member booking & social screens, plan/court admin | Shop (public/member/counter), Bar POS (tables/tabs/orders), Kitchen board, product/inventory/menu admin | Owner dashboard, Reports, Finance, Invoices + Business portal, Staff/HR, Settings, member payments/receipts |
| **Seeds/mocks** | shared by all — changes to `tools/gen-mock.mjs` are additive and announced | | | |

### Do NOT modify without coordination
| You must not edit… | …without |
|---|---|
| `database/migrations/*` (existing files: never; new files: owner of the table agrees) | the table owner + 1 reviewer |
| `shared/constants/*`, `shared/types/*`, `shared/lib/*` | a team notice and 2 approvals (§5) |
| `tools/api/endpoints.mjs` | the module owner + 1 consumer (§5) |
| `backend/src/kernel/*`, `app.ts`, `frontend/src/api/client.ts`, `auth/`, `layouts/`, `components/ui/` | Developer 1 |
| Another developer's `modules/<x>/` or `features/<x>/` | that developer (small fixes: PR + tag them) |
| `main` and `develop` directly | nobody — PRs only |
| `.env.example` | add a row in ENVIRONMENT.md in the same PR |

`.github/CODEOWNERS` encodes this (replace the placeholder handles).

## 3. Branches

```
main      always deployable; demo branch; protected (PR + green checks); tagged at hour 8 and hour 11
develop   integration branch; every feature PR targets develop; must always pass `npm run check`
feature/<module>-<short-description>      e.g. feature/court-booking, feature/shop-inventory, feature/admin-dashboard, feature/member-dashboard
fix/<module>-<short-description>          bug fixes after integration #1
```
Branch from `develop`; keep branches **short-lived (≤ 2–3 h)** and rebase on `develop` at least hourly (`git pull --rebase origin develop`). One branch = one slice of one module; never mix modules in a PR unless the PR is a contract change.

## 4. Commits and pull requests

**Commit message** (Conventional Commits, scope = module, cite requirements):
```
feat(bookings): enforce max plays per day (FR-COURT-008, R-COURT-04)
fix(shop): restore stock on order cancel (FR-SHOP-010)
chore(contract): add bookings.complete + regenerate docs
```
Types: `feat` `fix` `refactor` `test` `docs` `chore` `contract` (contract = anything under `shared/`, `tools/api/`, `database/migrations/`).

**PR rules**
- Title like the commit; description lists requirement IDs, endpoints touched, screenshots for UI.
- Target `develop`. **1 approval** (another developer; owner of the touched module if you edited someone else's). Contract PRs need **2**.
- CI/local gate in the description: `npm run check` ✅ `npm run check:db` ✅ (paste the last lines).
- Include regenerated files in the *same* PR whenever a source changed.
- Small: aim for < 400 changed lines excluding generated files. Review within 15 minutes — reviewing blocks the author, so it outranks your own coding.
- Squash-merge. Delete the branch.
- PR checklist: [PULL_REQUEST_TEMPLATE](../../.github/PULL_REQUEST_TEMPLATE.md).

## 5. Changing a contract (schema, API, types, enums, errors, rules)

```
1. ANNOUNCE   one line in the team chat:  "contract: add NO_SHOW to booking_status (bookings, Dev2) — objections?"   (wait ≤ 5 min; silence = ok)
2. BRANCH     feature/contract-<what>   — change the SOURCE files only:
                 schema      → new database/migrations/000N_*.sql  (never edit an applied one)
                 enums/types → shared/constants/enums.ts, shared/types/rows.ts|api.ts
                 API         → tools/api/endpoints.mjs
3. REGENERATE npm run mock:build && npm run docs:build && npm run check && npm run check:db
4. PR         title "contract: …", includes all regenerated files, 2 approvals (owner + a consumer)
5. MERGE FAST then everyone: git pull --rebase origin develop
6. NOTIFY     post the merge in chat. If the migration is already applied somewhere: re-run `npm run db:migrate` (or `db:reset`).
```
**Freeze:** at **hour 2** the API contract is frozen (ADR-012). Gaps found later follow the same procedure but must be additive wherever possible. Breaking changes after hour 2 need all four developers' agreement.

## 6. Integration procedure

| When | What | Who |
|---|---|---|
| continuous | PRs merge to `develop` as soon as green + approved | authors/reviewers |
| hour 1 | **Stubs published**: kernel, `PaymentsService`+adapter registry, `MembershipService.getEffectiveMembership/discountPercent` return real or fixed data with the final signatures | D1, D4, D2 |
| hour 4 | **Integration #1** — `develop` must pass flows 2, 6, 9, 13, 14 (login, booking, counter sale, bar order, kitchen) end-to-end with seed data | everyone, D1 drives |
| hour 8 | **Integration #2** — all MUST requirements work; tag `v0.8`; merge `develop` → `main` | everyone, D4 drives |
| hour 10–11 | Cross-module bug bash using [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md); each developer tests **another** developer's module | everyone |
| hour 11 | **Feature freeze**: only fixes; reset demo data (`npm run mock:build`; `db:reset` local / `db:migrate` + `db:seed` on a fresh Supabase) | D1 |
| hour 11.5 | Tag `v1.0`, deploy backend + frontend, rehearse the demo path (§8) | everyone |

The **integrator** (rotating: D1 at 4, D4 at 8, D2 at 11) merges `develop`→`main`, runs the full checklist, and is the only one who touches `main` in the last hour.

## 7. Conflict resolution

1. **Prevent:** disjoint folders (§2), auto-registered routes/modules (no shared router file), generated files are never hand-merged.
2. **Code conflict in your own files:** rebase and resolve.
3. **Conflict in a generated file** (docs, `requests.generated.ts`, `seed.sql`, mock JSON, `openapi.yaml`): **do not merge by hand** — resolve the *source* files, then re-run `npm run mock:build && npm run docs:build` and commit the output.
4. **Two migrations with the same number:** the later PR renumbers to the next free number before merging.
5. **Disagreement about a contract** (name, shape, rule): the **module owner decides within 10 minutes**; if the owner is a party, the integrator decides. Record non-obvious choices in ASSUMPTIONS.md.
6. **Blocked by someone's missing service:** code against the signature in SYSTEM_ARCHITECTURE §5 with a local fake; never reimplement their logic.

## 8. The demo path (everything must work end to end)

1. Visitor: home → plans → availability → submit **trial enquiry** → front desk sees it.
2. Front desk registers a member (Silver) and sells a plan; member logs in → dashboard shows plan + expiry.
3. Member books a court (price 50 %), tries a 3rd play → blocked; cancels one → refund.
4. Friday social play: join, session fills, further join rejected.
5. Member orders shoes online for delivery; counter sells the last unit of something → stock hits 0 → online order refused.
6. Bar: open tab, order with automatic member discount → kitchen board moves it to READY → served → settle tab by UPI.
7. Owner dashboard: today's revenue by stream, low stock, expiring memberships, bar daily summary, tax report, CSV export; invoice a business client, client pays online.
8. Staff: leave request → owner approves; payroll marked paid.

## 12-hour plan

Priorities: **M**UST first, then **S**HOULD; NICE only after hour 10. (Per-requirement priority: [REQUIREMENTS.md](../requirements/REQUIREMENTS.md).)

| Hours | Developer 1 | Developer 2 | Developer 3 | Developer 4 |
|---|---|---|---|---|
| **0–1 setup** | scaffold backend + kernel (`db`, `http`, `errors`, `auth`, `validate`, `notify`, `settings`), frontend shell, `api/client.ts`, layouts | clone, DB up (`db:reset`), scaffold `modules/{members,memberships,courts,bookings,social}` + `MembershipService` stub | scaffold `modules/{shop,inventory,bar,kitchen}` + UI routes | `PaymentsService` + adapter registry stub, scaffold `modules/{payments,invoices,clients,staff,reports,settings}` |
| **1** | **publish kernel** (PR merged by minute 60) | publish `MembershipService.getEffectiveMembership/discountPercent` | — | publish `PaymentsService.record/refundSource` + adapter interface |
| **2 — contract freeze** | all: 20-min review of API_CONTRACT for your module; fix gaps via §5; **freeze** | | | |
| **2–4** | M: `auth.*`, `public.club`, Home/Plans/Courts/Shop public pages, Login/Signup, role redirect, notifications list | M: `courts.list/availability`, `bookings.price/create/list`, `members.list/create/get`, `memberships.plans/purchase`; Front-desk booking + member search UI | M: `shop.products`, `shop.orderCreate` (stock tx), `inventory.list/adjust`, `bar.menu/tables/orderCreate`, `kitchen.list/status`; counter + Kitchen UI | M: `payments.create/list/get` + adapters (invoice), `settings.*`, `clients.*`, `invoices.create/list/get/send`; Owner shell UI |
| **4 — integration #1** | drive: flows 2, 6, 9, 13, 14 on `develop` | | | |
| **4–8** | M: `enquiries.*` (create, list, follow-up, quote, convert, trial), Member dashboard (profile, plan, history), notifications triggers | M: `bookings.cancel` (+refund), `social.*`, `memberships.changePlan/expiring/runExpiry`, `members.history`; S: maintenance blocks, price preview polish | M: tabs (`bar.tabOpen/tabList/tabGet/tabSettle`), `shop.orderStatus` / `shop.orderCancel` (pickup/delivery), low stock, `bar.dailySummary`; S: product/menu admin UI | M: `reports.dashboard/revenue/bar/finance/tax`, `staff.*` (shifts, leave, payroll), Business portal UI; S: `reports.courts/memberships/shop/export` |
| **8 — integration #2** | tag `v0.8`; run full demo path | | | |
| **8–10** | S: CRM polish, notification coverage, Member orders/bookings pages | S: UX polish, empty/error states, validation messages; auto-complete job | S: member bar activity, receipts, edge cases (out of stock races) | S: invoices overdue job, void, refunds, exports |
| **10–11** | cross-test D2's module with the checklist | cross-test D3's | cross-test D4's | cross-test D1's |
| **11–12** | seed reset, deploy, rehearsal | fix bugs | fix bugs | fix bugs, final `main` tag |

**What can be simplified without breaking the architecture:** PENDING booking holds (create `CONFIRMED`), report caching (none), notification coverage (6 events first), CSV only, HTML receipts instead of PDF, mock payments, polling. Everything is documented in SYSTEM_ARCHITECTURE §11.

### If time runs short — the cut ladder

101 of the 137 functional requirements are MUST because the brief touches every area; that is more than 12 hours × 4 people comfortably delivers *at polished quality*. Decide at **hour 4** (integration #1) and **hour 8** (integration #2) using this ladder. Cut from the top; **never cut a database constraint, a business rule, or a contract** — cut screens and breadth instead. Every endpoint stays documented, and unimplemented ones return `501` behind the same contract.

| Cut order | What to simplify or defer | Keep (the demo path §8 depends on it) |
|---|---|---|
| 1 | `reports.courts/memberships/shop/export`, owner charts → plain tables | `reports.dashboard`, `revenue`, `bar`, `tax`, `finance` |
| 2 | Staff UI polish: payroll/leave screens as simple lists; shifts as a table | leave request → approval, payroll paid |
| 3 | Notifications beyond the 6 core events; notification polling UI | booking, order ready, low stock, new enquiry, expiry, leave |
| 4 | Business-client portal → owner records payments for the client; invoice PDF/print | `invoices.create/send`, `payments.create(INVOICE)` |
| 5 | Maintenance blocks, social-session cancel-all, `bookings.complete`, tab void, product delete | everything else in courts/social/bar |
| 6 | Member history timeline → bookings + payments only | `members.history` endpoint shape unchanged |
| 7 | Enquiry funnel summary, quote status editing, trial-booking button (create the TRIAL booking via a normal booking with a note) | enquiry → follow-up → quote → convert |
| 8 | Seed-driven public pages (shop/menu without search/filters) | availability, plans, enquiry form |

Rule of thumb: **the demo path in §8 beats breadth.** A working booking → payment → report chain with real constraints is worth more than 20 half-finished screens.

## 9. Working agreements

- **Chat protocol:** one channel; prefix messages `contract:`, `blocked:`, `merged:`, `bug:`. Stand-ups of 3 minutes at hours 3, 6, 9: done / next / blocked.
- **Code style:** TypeScript `strict`, no `any` without a comment, ESLint + Prettier on commit; comments cite `FR-…` / `R-…` ids at the line that implements a rule; no commented-out code.
- **Tests:** at minimum the critical rules in the integration checklist (double booking, daily limit, oversell, tab settlement, payment totals).
- **Never:** commit `.env`, put a secret in a `VITE_*` variable, edit the Supabase schema in the dashboard, hand-edit generated files, merge a red PR, force-push `develop`/`main`.
- **Definition of done** for every module: [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md).
