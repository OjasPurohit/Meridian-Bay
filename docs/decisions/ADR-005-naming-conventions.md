# ADR-005 — Naming conventions: snake_case end to end

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
Field-name mismatches (`userId` vs `user_id`) are the most common integration bug.

## Decision
- Tables: `snake_case`, plural. Columns: `snake_case`. Primary key: `id uuid`. Foreign key: `<entity>_id`.
- Enum types: `snake_case` singular; enum labels: `UPPER_SNAKE_CASE`.
- **JSON keys and TypeScript properties use exactly the same snake_case names as the columns.** There is no mapping layer.
- `npm run check` lints schema names, row types and endpoint field names.

## Consequences
- ✅ No conversion code; grep-able across every layer.
- ⚠️ snake_case properties are unidiomatic in TypeScript (accepted).

## Alternatives considered
camelCase in the API with a mapper (extra code, extra bugs).
