# Documentation index

Start with the root [README.md](../README.md). Then read in this order (≈ 45 minutes for the whole team):

| # | Read | Why |
|---|---|---|
| 1 | [ASSUMPTIONS.md](ASSUMPTIONS.md) | what the brief did *not* say and what we decided |
| 2 | [architecture/SYSTEM_ARCHITECTURE.md](architecture/SYSTEM_ARCHITECTURE.md) | layers, modules, **internal service contracts** (§5) |
| 3 | [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md) | what to build, with priorities and IDs |
| 4 | [business-rules/BUSINESS_RULES.md](business-rules/BUSINESS_RULES.md) | every rule, one place, with IDs |
| 5 | [workflows/USER_FLOWS.md](workflows/USER_FLOWS.md) | the 21 flows, mapped to API operations |
| 6 | [database/DATABASE_SCHEMA.md](database/DATABASE_SCHEMA.md) | tables, columns, constraints, conventions |
| 7 | [api/API_CONTRACT.md](api/API_CONTRACT.md) | the frontend/backend agreement |
| 8 | [contracts/SHARED_TYPES.md](contracts/SHARED_TYPES.md) | types, enums, errors, formats |
| 9 | [integration/TEAM_GUIDELINES.md](integration/TEAM_GUIDELINES.md) | ownership, git, contract changes, 12-hour plan |

## Everything

| Area | Files | Source of truth / generated? |
|---|---|---|
| Architecture | [SYSTEM_ARCHITECTURE.md](architecture/SYSTEM_ARCHITECTURE.md), [system-architecture.mmd](architecture/system-architecture.mmd) | hand-written (`.mmd` extracted) |
| Requirements | [REQUIREMENTS.md](requirements/REQUIREMENTS.md), [TRACEABILITY_MATRIX.md](requirements/TRACEABILITY_MATRIX.md) | generated from `tools/api/requirements.mjs` + `endpoints.mjs` |
| Workflows | [USER_FLOWS.md](workflows/USER_FLOWS.md), [workflows.mmd](workflows/workflows.mmd) | hand-written (`.mmd` extracted) |
| Database | [DATABASE_SCHEMA.md](database/DATABASE_SCHEMA.md), [schema.sql](database/schema.sql), [er-diagram.mmd](database/er-diagram.mmd) | generated from `database/migrations` |
| API | [API_CONTRACT.md](api/API_CONTRACT.md), [openapi.yaml](api/openapi.yaml) | generated from `tools/api/endpoints.mjs` |
| Contracts | [SHARED_TYPES.md](contracts/SHARED_TYPES.md), [ENUMS.md](contracts/ENUMS.md), [ERROR_CODES.md](contracts/ERROR_CODES.md) (TS in [/shared](../shared)) | hand-written / generated |
| Business rules | [BUSINESS_RULES.md](business-rules/BUSINESS_RULES.md) | hand-written (rule ids) |
| Security | [PERMISSIONS_MATRIX.md](security/PERMISSIONS_MATRIX.md), [permissions.generated.json](security/permissions.generated.json) | generated |
| Decisions | [ADR index](decisions/README.md) | hand-written |
| Integration | [TEAM_GUIDELINES](integration/TEAM_GUIDELINES.md), [INTEGRATION_CHECKLIST](integration/INTEGRATION_CHECKLIST.md), [DEFINITION_OF_DONE](integration/DEFINITION_OF_DONE.md), [ENVIRONMENT](integration/ENVIRONMENT.md), [OWNERSHIP_MAP](integration/OWNERSHIP_MAP.md) | hand-written / generated |
| Assumptions | [ASSUMPTIONS.md](ASSUMPTIONS.md) | hand-written |

Files with a `GENERATED` banner are **never edited by hand**: change the source and run `npm run docs:build` (see [ADR-014](decisions/ADR-014-contract-first-generation.md)).
