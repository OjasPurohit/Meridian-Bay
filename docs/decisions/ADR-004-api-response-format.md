# ADR-004 — API response format: one success envelope, one error envelope

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
Four developers will otherwise invent four response shapes.

## Decision
- Success: `{ "success": true, "data": …, "message"?: string, "meta"?: PageMeta }`.
- Error: `{ "success": false, "error": { "code": "<ERROR_CODE>", "message": string, "details"?: object } }`.
- `code` ∈ `shared/constants/errors.ts`, each with a fixed HTTP status.
- List endpoints return either a bounded array or `Page<T>` with `meta`.
- Backend builds responses only through `kernel/http.ts` and fails only by throwing `AppError(code, details)`; the frontend unwraps in one `api/client.ts` and branches on `code`, never on `message`.
- JSON keys are snake_case; money is a string; timestamps are UTC ISO.

## Consequences
- ✅ One client, one error UI, contract-testable.
- ⚠️ Slightly verbose for trivial calls.

## Alternatives considered
Bare resources + RFC 7807 problem+json · GraphQL (overkill).
