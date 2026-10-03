# ADR-014 — Contract-first with generated artefacts and automated consistency checks

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
Four developers, 12 hours and ~130 endpoints: hand-maintained documents would contradict each other within the first hours.

## Decision
**Single sources of truth**

| What | Source |
|---|---|
| Schema | `database/migrations/*.sql` |
| Enums, errors, invariants, state machines | `shared/constants/*.ts` |
| Row + view types | `shared/types/{rows,api}.ts` |
| API (paths, roles, fields, errors, requirement links) | `tools/api/endpoints.mjs` |
| Requirements | `tools/api/requirements.mjs` |
| Mock data + seed | `tools/gen-mock.mjs` |

**Generated** (never edited by hand): `API_CONTRACT.md`, `openapi.yaml`, `requests.generated.ts`, `PERMISSIONS_MATRIX.md`, `REQUIREMENTS.md`, `TRACEABILITY_MATRIX.md`, `DATABASE_SCHEMA.md`, ER diagram, `ENUMS.md`, `ERROR_CODES.md`, `OWNERSHIP_MAP.md`, `mock-data/*.json`, `seed.sql`.

**Verified** by `npm run check` (enums ↔ SQL, row types ↔ columns, mock data ↔ schema and foreign keys, endpoints ↔ types/errors/tables/requirements, naming rules, markdown links) and `npm run check:db` (constraints and reconciliations on a real Postgres engine). Run both before every PR; the integrator runs them on `develop`.

## Consequences
- ✅ Contracts cannot drift silently; reviewers diff generated files.
- ⚠️ Contributors must run the generators when they change a contract.

## Alternatives considered
Hand-written OpenAPI and Markdown · code-first generation (there is no code yet).
