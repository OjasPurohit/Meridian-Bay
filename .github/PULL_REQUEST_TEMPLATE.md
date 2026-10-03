## What and why
<!-- one paragraph; link requirement ids, e.g. FR-COURT-008, R-COURT-04 -->

**Module(s):**  **Endpoints / screens:**

## Type of change
- [ ] feature  - [ ] fix  - [ ] refactor  - [ ] **contract** (schema / API / shared types / enums / errors — needs 2 approvals)

## Gates (paste the last lines of each)
- [ ] `npm run check` ✅
- [ ] `npm run check:db` ✅
- [ ] Generated files regenerated and included (`npm run mock:build` / `npm run docs:build`) — or no source changed

## Definition of Done (docs/integration/DEFINITION_OF_DONE.md)
- [ ] UI + API integrated, no mock leftovers
- [ ] Shared types / enums / errors imported (nothing re-declared); snake_case fields
- [ ] Validation + error + loading + empty states
- [ ] Role permissions + own-record scoping tested
- [ ] Business rules cited (`R-…`) and tested
- [ ] Works on a fresh `npm run db:reset` seed

## Screenshots / evidence
<!-- UI screenshots, request/response samples, or SQL proving an invariant -->

## Touches other owners?
- [ ] I did not edit another developer's module/folder (or I tagged them as reviewer)
