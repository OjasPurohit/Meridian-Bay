# The Champions Club — Sports Club Management System

> **Phase: BLUEPRINT / CONTRACT / ARCHITECTURE.** No application code is written yet — by design. This repository is the single source of truth that lets four developers build four modules in parallel and integrate them without renaming variables, redesigning APIs, changing the schema or discovering missing requirements at the last minute.
>
> Verified state: `npm run check` → all consistency checks pass · `npm run check:db` → schema, seed and invariants verified on a real Postgres engine · `npm run test:db-scripts` → migrate/seed/reset scripts work.

## 1. Project overview

One unified platform for **The Champions Club** (tennis/cricket/padel/badminton courts, gear shop, bar & cafeteria, Gold/Silver/Junior memberships) that replaces WhatsApp bookings, Excel member lists, paper bar receipts, phone availability checks and "no visibility" with: a **public website**, **role-based dashboards**, one **REST API** and one **PostgreSQL** database (local for development, Supabase in the cloud). Built in a 12-hour hackathon by a team of 4.

## 2. Problem statement

Source: *Sports Club Management System* (provided PDF; the primary source of truth). Eight "scenes" — a new member walks in; booking a court on a busy evening; gearing up before a match; after the match at the bar; a stranger finds the club online; the owner at the end of the month — are translated into **117 functional requirements** with IDs (`FR-COURT-008` …), each traced to a user, module, API and database entity: [REQUIREMENTS.md](docs/requirements/REQUIREMENTS.md) · [TRACEABILITY_MATRIX.md](docs/requirements/TRACEABILITY_MATRIX.md) (includes a line-by-line **coverage check** of the brief). Where the brief is silent we record a decision instead of silently inventing: [ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## 3. Architecture

Actors → public website + role dashboards → authentication/authorisation → application modules → business logic/validation → REST API (`/api/v1`) → PostgreSQL (local ⇄ Supabase), with external integrations (payment gateway, messaging) shown separately.
- [SYSTEM_ARCHITECTURE.md](docs/architecture/SYSTEM_ARCHITECTURE.md) (diagrams, layers, internal service contracts, deployment) · [system-architecture.mmd](docs/architecture/system-architecture.mmd)
- [ADRs](docs/decisions/README.md): database, auth, roles, response format, naming, **booking-conflict prevention**, **inventory sync**, stack, payments ledger, polling, mock gateway, versioning, money/time, contract-first.

## 4. Users and roles

Seven actors, **five logins**: `MEMBER` (Gold / Silver / Junior are *plans*, not roles), `FRONT_DESK`, `KITCHEN_MANAGER`, `STORE_MANAGER`, `OWNER_ADMIN`; plus the online **visitor** and the walk-in **guest** (no login; served by staff). After login the user lands on their dashboard (`/member`, `/front-desk`, `/kitchen`, `/store-manager`, `/owner`). Permissions: [PERMISSIONS_MATRIX.md](docs/security/PERMISSIONS_MATRIX.md) (generated from the API definition).

## 5. Modules

Membership · Court booking · Shop · Inventory · Cafe · Kitchen · Enquiries · Finance/Payments · Invoicing/Business clients · Staff/HR · Reporting · Settings · Events — 112 endpoints across 18 API modules. Flows (18, with Mermaid): [USER_FLOWS.md](docs/workflows/USER_FLOWS.md) · [workflows.mmd](docs/workflows/workflows.mmd).

## 6. Database

One canonical schema = `database/migrations/*.sql` (25 tables, 24 enums). Docs: [DATABASE_SCHEMA.md](docs/database/DATABASE_SCHEMA.md) · [er-diagram.mmd](docs/database/er-diagram.mmd) · [schema.sql](docs/database/schema.sql) (generated snapshot) · how migrations/seeds work: [database/README.md](database/README.md). Highlights: exclusion constraint = **no double booking**; `CHECK (stock_quantity >= 0)` + atomic decrement = **no overselling**; `payments` = **one revenue ledger**; `memberships` rows = **membership history**.

## 7. API

[API_CONTRACT.md](docs/api/API_CONTRACT.md) (every endpoint: method, URL, roles, params, body, response, errors, rules, requirement ids, examples) · [openapi.yaml](docs/api/openapi.yaml) · [requests.generated.ts](shared/types/requests.generated.ts). Base `/api/v1`, uniform envelopes, fixed error codes ([ERROR_CODES.md](docs/contracts/ERROR_CODES.md)).

## 8. Shared contracts (`/shared`)

[enums.ts](shared/constants/enums.ts) · [errors.ts](shared/constants/errors.ts) · [rules.ts](shared/constants/rules.ts) (invariants + state machines) · [rows.ts](shared/types/rows.ts) · [api.ts](shared/types/api.ts) · [money.ts](shared/lib/money.ts) · [time.ts](shared/lib/time.ts). Explained in [SHARED_TYPES.md](docs/contracts/SHARED_TYPES.md); reference tables in [ENUMS.md](docs/contracts/ENUMS.md).

## 9. Business rules

All critical rules, with IDs, in **one** file: [BUSINESS_RULES.md](docs/business-rules/BUSINESS_RULES.md) (1-hour sessions on a 30-min grid, ≤ 2 plays/day, member vs walk-in pricing, stock, tax, refunds, …).

## 10. Mock data

Realistic seed for every table, generated and validated against the schema: [mock-data/README.md](mock-data/README.md) (demo logins, scenario map). `database/seed/seed.sql` is generated from the same source.

## 11. Local setup

```bash
git clone <repo> && cd <repo>
npm install                       # tooling only (pg, dotenv, bcryptjs, yaml, pglite)
cp .env.example .env              # set DATABASE_URL to your local Postgres, ALLOW_DB_RESET=true
#   create database `champions_club` in pgAdmin (or: createdb champions_club)
npm run db:reset                  # drop → migrate → seed demo data
npm run check && npm run check:db # contract + database verification
```
Details, pgAdmin steps and troubleshooting: [database/README.md](database/README.md) · env contract: [ENVIRONMENT.md](docs/integration/ENVIRONMENT.md). Backend/frontend scaffolds follow the layouts in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## 12. Supabase setup

Create a project → copy the **session pooler** connection string (port 5432) → run the **same** migrations: `DATABASE_URL=… DATABASE_SSL=true npm run db:migrate` (then optionally `db:seed` for demo data). RLS is deny-all (migration 0002); only the backend connects. Step-by-step, schema-change procedure and drift control: [database/README.md](database/README.md#supabase-cloud-setup).

## 13. Team responsibilities

| | Owner of |
|---|---|
| **Dev 1** | Platform kernel, auth, public website, member dashboard shell, enquiries |
| **Dev 2** | Members, memberships, courts, bookings, front-desk dashboard |
| **Dev 3** | Shop, inventory, cafe, kitchen |
| **Dev 4** | Payments, invoices/business clients, staff/HR, reports, settings, owner dashboard |

Full map with tables, endpoints and what not to touch: [OWNERSHIP_MAP.md](docs/integration/OWNERSHIP_MAP.md) · [TEAM_GUIDELINES.md](docs/integration/TEAM_GUIDELINES.md) (incl. the **12-hour plan**).

## 14. Git workflow

`main` (deployable) ← `develop` (integration) ← `feature/<module>-<what>`; Conventional Commits with requirement ids; PRs need green `npm run check` + `check:db`, 1 approval (2 for contract changes); squash-merge; contract-change procedure and conflict resolution in [TEAM_GUIDELINES.md](docs/integration/TEAM_GUIDELINES.md#3-branches). [CODEOWNERS](.github/CODEOWNERS) · [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## 15. Integration process

Stubs at hour 1 → **contract freeze at hour 2** → integration #1 (hour 4) → #2 (hour 8) → cross-module bug bash (10–11) → freeze (11) → deploy + rehearsal. Checklist: [INTEGRATION_CHECKLIST.md](docs/integration/INTEGRATION_CHECKLIST.md) · per-module [DEFINITION_OF_DONE.md](docs/integration/DEFINITION_OF_DONE.md).

## 16. Testing

| Command | Proves |
|---|---|
| `npm run check` | enums ↔ SQL, row types ↔ columns (names, nullability, types), mock data ↔ schema + FKs, endpoints ↔ types/errors/tables/requirements, requirement coverage, naming rules, markdown links |
| `npm run check:db` | migrations + seed load on a real Postgres engine (PGlite); double-booking, off-grid slots, negative stock and a second active membership are **rejected**; payments/invoices/stock/totals reconcile |
| `npm run test:db-scripts` | `migrate`, `seed`, `reset` scripts incl. safety guards (no reset on non-local hosts) |
| `npm run docs:build` / `mock:build` | regenerate derived docs / mock data + seed |
| `npm run verify` | all of the above in order |

Application tests (to write during the hackathon) are specified in the DoD and the integration checklist.

## 17. Deployment

Frontend → static host (Vercel/Netlify) with `VITE_API_BASE_URL`; backend → Node host (Render/Railway/Fly) with `DATABASE_URL` (Supabase), `JWT_SECRET`, `CORS_ORIGINS`; database → Supabase via `npm run db:migrate` run by the deployer **before** deploying new backend code. Environment classification: [ENVIRONMENT.md](docs/integration/ENVIRONMENT.md). Never commit `.env`; the service-role key stays out of the frontend.

## 18. Known assumptions

40 recorded decisions where the brief is silent (sports offered, prices, tax regime, business-client meaning, cancellation policy, who runs the cafe POS …): [ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

## 19. Known limitations (by design for v1)

Mock online-payment gateway · no notification system (no in-app messages, email, SMS or WhatsApp) · polling instead of websockets · no pro-rata on plan change · no supplier/purchase-order or courier modules · no alcohol/age gating · flat court pricing (no peak rates) · single club/currency/timezone · no password-reset email (staff reset). Each is isolated behind a seam so it can be added without redesign.

---

## Repository map

```
README.md                      ← you are here
.env.example  .gitignore  package.json  .github/{CODEOWNERS,PULL_REQUEST_TEMPLATE.md}
docs/
  README.md                    documentation index
  ASSUMPTIONS.md
  architecture/                SYSTEM_ARCHITECTURE.md, system-architecture.mmd
  requirements/                REQUIREMENTS.md, TRACEABILITY_MATRIX.md          (generated)
  workflows/                   USER_FLOWS.md, workflows.mmd
  database/                    DATABASE_SCHEMA.md, schema.sql, er-diagram.mmd   (generated)
  api/                         API_CONTRACT.md, openapi.yaml                    (generated)
  contracts/                   SHARED_TYPES.md, ENUMS.md, ERROR_CODES.md        (the .ts contracts live in /shared)
  business-rules/              BUSINESS_RULES.md
  security/                    PERMISSIONS_MATRIX.md, permissions.generated.json
  decisions/                   ADR-001 … ADR-016
  integration/                 TEAM_GUIDELINES, INTEGRATION_CHECKLIST, DEFINITION_OF_DONE, ENVIRONMENT, OWNERSHIP_MAP
shared/                        constants/{enums,errors,rules}.ts · types/{rows,api,requests.generated}.ts · lib/{money,time}.ts
database/                      migrations/ · seed/ · migrate/seed/reset/guards .mjs · README.md
mock-data/                     one JSON per table + README
tools/                         gen-docs · gen-mock · check-consistency · verify-db · test-db-scripts · api/ (endpoints, requirements, examples, ownership) · lib/
backend/  frontend/            layout contracts only (no code yet)
```

*Deviation from the suggested tree (justified):* the TypeScript contracts live once in `/shared` (importable by both apps) instead of being copied into `docs/contracts`; `docs/database/schema.sql` is a **generated snapshot** because the canonical schema is the migration set; ADRs are named `ADR-0nn-title.md`; additional generated references (`ENUMS.md`, `permissions.generated.json`, `OWNERSHIP_MAP.md`) and tooling were added to make "single source of truth" enforceable rather than aspirational.
