# ADR-008 — Technology stack

**Status:** accepted (assumption A-28) · **Date:** 2026-10-03 · **Owners:** whole team

## Context
The brief names no technology; the team chose PostgreSQL + Supabase + pgAdmin and needs speed and familiarity within 12 hours.

## Decision
- **Frontend:** React 18, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS.
- **Backend:** Node.js 22, TypeScript, Express, `pg` with hand-written SQL, `zod`, `jsonwebtoken`, `bcryptjs` — a **modular monolith**: one deployable, one folder per module with an owner (see `backend/README.md`).
- **Shared:** TypeScript package `/shared` imported by both (types, enums, errors, rules, money/time helpers).
- **Contract tooling:** Node scripts in `/tools` (docs, mock data, checks); PGlite for database verification.

The team may swap a framework **inside a layer** (e.g. Next.js for the UI, Fastify for the API) provided the API contract, database schema and `/shared` types do not change.

## Consequences
- ✅ One language end to end; shared types; fast iteration.
- ⚠️ Hand-written SQL needs discipline (mitigated by per-module repos and database constraints).

## Alternatives considered
NestJS or an ORM (learning curve) · microservices (overkill) · Supabase edge functions for logic (splits the business rules across two runtimes).
