# Meridian Bay — The Champions Club

A web application for a neighbourhood sports club: tennis, padel, cricket and badminton courts, a gear shop, a bar & café, memberships, and companies the owner invoices. It replaces WhatsApp bookings, Excel member lists and paper receipts with one system.

> Brand and database names differ on purpose: the website says **Meridian Bay**, the PostgreSQL database is `champions_club`, and demo emails use `@championsclub.example`. They are the same club.

## What it does

| Area | Highlights |
|---|---|
| Public website | Home, membership plans, gear shop, bar & café menu, and a **Book a trial** form (a request the owner approves). Sign-up with online payment, or apply as an employee. |
| Court booking | 30-minute slot grid, 1-hour sessions, up to 60 days ahead, double booking impossible (database exclusion constraint), member pricing and daily play limits. Day / Week / Month calendar for the owner. |
| Memberships | Gold, Silver and Junior plans with court, shop and café discounts; renewals, plan changes, cancellations. |
| Shop and café | One shelf of products with atomic stock, orders with delivery, café POS and live kitchen board, low-stock alerts. |
| Money | Payments ledger with refunds on the original payment, tax-inclusive prices, invoices for business clients, payroll. Owner **Taxes to report** is an internal monthly overview (not a government filing). |
| Staff | Employee applications approved by the owner, shifts, leave requests with owner approval, salary and payroll history. |
| Reports | Revenue, courts, memberships, shop, café, finance and tax, with CSV export. |

### Who logs in

| Role | Home | Can do |
|---|---|---|
| `OWNER_ADMIN` | `/owner` | Everything: reports, settings, staff and applications, trial requests, taxes. |
| `FRONT_DESK` | `/front-desk` | Court calendar, bookings, members, payments, own leave and pay. |
| `KITCHEN_MANAGER` | `/kitchen` | Café POS, order board, stock, own leave and pay. |
| `STORE_MANAGER` | `/store-manager` | Products, stock and shop orders, own leave and pay. |
| `MEMBER` | `/member` | Book courts, shop, order from the café, events. |

Gold / Silver / Junior are membership **plans**, not roles. Business clients have no login.

## Stack

```
React 18 + Vite + TypeScript + Tailwind  (:5173)
        │  fetch /api/v1  (Bearer JWT)
Express + TypeScript (tsx)  routes → service → repo (hand-written SQL, no ORM)  (:4000)
        │
PostgreSQL 15+  (database champions_club, extension btree_gist)
```

Contract-first: [`tools/api/endpoints.mjs`](tools/api/endpoints.mjs) and `database/migrations/*.sql` are the sources of truth. API docs, OpenAPI, request types and schema docs are **generated** from them; do not edit generated files by hand.

## Quick start

Prerequisites: Node 22.18+, PostgreSQL running locally.

```bash
git clone <repo> && cd Meridian-Bay
npm install                        # tooling (pg, dotenv, pglite, …)
cp .env.example .env               # set DATABASE_URL, JWT_SECRET, PORT=4000, CORS_ORIGINS; never commit .env
createdb champions_club            # or create it in pgAdmin
npm run db:migrate                 # apply the migrations
npm run db:seed                    # demo data (empty database only)

cd backend  && npm install && npm start     # API on http://localhost:4000
cd frontend && npm install && npm run dev   # site on http://localhost:5173
```

`npm run dev` always runs in **live mode** (talks to the API). `npm run dev:preview` runs the dashboards on sample data with no backend. `npm run db:reset` rebuilds a throw-away local database and refuses to run against anything that is not local.

### Demo logins

Password for every seeded account: `Password@123` (fictional demo data). Or use the **Demo access** buttons on the login menu.

| Role | Email |
|---|---|
| Owner | `owner@championsclub.example` |
| Front desk | `neha.sharma@championsclub.example` |
| Kitchen manager | `kitchen@championsclub.example` |
| Store manager | `sanjay.gupta@championsclub.example` |
| Member (Gold) | `aarav.kapoor@example.com` |

## Testing

```bash
cd backend && npm test && npx tsc -p tsconfig.json    # API flows against in-memory Postgres (PGlite)
cd frontend && npm run typecheck && npm run build
npm run check && npm run check:db                      # contract, schema and seed verification
#   (`npm run verify` also regenerates mock data relative to today; add --base-date=2026-10-03 to keep the sample dates)
```

Browser end-to-end scripts live in [`tools/e2e/`](tools/e2e/README.md). They run against a **scratch clone** of the database (`node tools/e2e/scratch-env.mjs up`), never the real data.

## Repository layout

```
backend/    Express API (src/kernel, src/modules/<one folder per module>, tests)
frontend/   React app: public site + five role dashboards
shared/     constants, row and API types, money/time helpers used by all three
database/   migrations (never edit an applied one), seed, migrate / reset scripts
mock-data/  generated seed rows (npm run mock:build)
tools/      generators, consistency checks, e2e scripts
docs/       contract, schema, business rules, ADRs, requirements (many files generated)
main_context.md   the full briefing for a new developer or AI agent
```

## Documentation

- **[main_context.md](main_context.md)** — architecture, database, modules, frontend structure, gotchas. Start here.
- [API_CONTRACT.md](docs/api/API_CONTRACT.md) and [openapi.yaml](docs/api/openapi.yaml) — 117 endpoints across 18 API modules, generated.
- [DATABASE_SCHEMA.md](docs/database/DATABASE_SCHEMA.md), [er-diagram.mmd](docs/database/er-diagram.mmd) — one canonical schema (27 tables, 24 enums), generated from the migrations.
- [BUSINESS_RULES.md](docs/business-rules/BUSINESS_RULES.md) — every rule with an ID (booking grid, pricing, stock, tax, refunds, leave).
- [Requirements](docs/requirements/REQUIREMENTS.md) — **117 functional requirements** traced to roles, modules, endpoints and tables.
- [ADRs](docs/decisions/README.md) and [ASSUMPTIONS.md](docs/ASSUMPTIONS.md) — 40 recorded decisions and their reasons.
- [PERMISSIONS_MATRIX.md](docs/security/PERMISSIONS_MATRIX.md) — who may call what, enforced server-side.
- [database/README.md](database/README.md) and [ENVIRONMENT.md](docs/integration/ENVIRONMENT.md) — database scripts and environment variables.

## Working rules

- Never edit an applied migration; add the next numbered one. Migrations apply in a transaction and are checksum-verified.
- Derived values (totals, statuses, payment state) are SQL views, not stored columns.
- Money is `numeric(12,2)` shown as 2-decimal strings; business dates are IST (`Asia/Kolkata`), timestamps UTC.
- Change the contract inputs in `tools/`, then run `npm run docs:build` and `npm run mock:build -- --base-date=2026-10-03`.
- Secrets live only in the git-ignored `.env`. The payment gateway is a mock (ADR-011).
