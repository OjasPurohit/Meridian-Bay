# ADR-012 — API versioning: URL prefix /api/v1

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
Frontend and backend are built in parallel and must tolerate additive change safely.

## Decision
All routes live under `/api/v1` (constant `API_PREFIX`).

**Allowed within v1** (additive): new endpoints, new optional request fields, new response fields, new enum values (announced; clients must tolerate unknown values).

**Breaking** (needs `/api/v2` and a migration plan; both versions run side by side until the old one is unused): removing or renaming anything, changing a type, adding a required request field, tightening validation, changing semantics or status codes.

**During the 12 hours:** the contract is **frozen at hour 2** (see TEAM_GUIDELINES §12-hour plan). After that, every contract change is a PR that edits `tools/api/endpoints.mjs`, includes all regenerated files, and is approved by the module owner **and** one consuming developer.

## Consequences
- ✅ Predictable evolution; one place to see what changed (the diff of generated files).
- ⚠️ Slight process overhead (kept deliberately light).

## Alternatives considered
Header-based versioning · no versioning.
