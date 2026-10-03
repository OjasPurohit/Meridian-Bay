# Environment Contract

One `.env.example` at the repo root defines every variable. Nobody invents new variable names without adding them to `.env.example` **and** this table in the same PR.

## Classification

| Variable | Used by | Class | Notes |
|---|---|---|---|
| `NODE_ENV` | backend | backend-only | `development` / `production` / `test` |
| `APP_TIMEZONE` | backend | backend-only | informational — IST logic lives in `shared/lib/time.ts` |
| `PORT` | backend | backend-only | default `4000` |
| `CORS_ORIGINS` | backend | backend-only | comma-separated browser origins (frontend dev server, deployed site) |
| `JWT_SECRET` | backend | **secret** | ≥ 32 random chars; different per environment |
| `JWT_EXPIRES_IN` | backend | backend-only | `8h` |
| `BCRYPT_ROUNDS` | backend | backend-only | `10` (use `4` in tests) |
| `DATABASE_URL` | backend, `database/*.mjs` | **secret** | local Postgres **or** Supabase connection string |
| `DATABASE_SSL` | backend, `database/*.mjs` | backend-only | `true` for Supabase |
| `ALLOW_DB_RESET` | `database/reset.mjs` | backend-only | `true` only on a developer machine; reset also refuses non-local hosts |
| `SUPABASE_URL` | backend (optional) | backend-only | unused in v1 |
| `SUPABASE_ANON_KEY` | frontend (optional) | frontend-safe | unused in v1; harmless because RLS denies all |
| `SUPABASE_SERVICE_ROLE_KEY` | backend (optional) | **secret** | bypasses RLS — never in frontend, never in git, never in chat |
| `PAYMENT_PROVIDER` | backend | backend-only | `mock` for the hackathon (ADR-011) |
| `PAYMENT_PROVIDER_KEY` / `_SECRET` / `PAYMENT_WEBHOOK_SECRET` | backend | **secret** | empty while `mock` |
| `VITE_API_BASE_URL` | frontend | frontend-safe | = `API_BASE_URL` in the API contract, includes `/api/v1` |
| `VITE_APP_NAME` | frontend | frontend-safe | |
| `VITE_PAYMENT_PUBLIC_KEY` | frontend | frontend-safe | publishable key only |

## Rules

1. **Only `VITE_*` variables reach the browser.** Anything else in the frontend bundle is a leak — never prefix a secret with `VITE_`.
2. `.env` is git-ignored. Share secrets through a password manager or the team chat's secure channel, never in commits, issues, screenshots or docs.
3. Docs and examples use placeholders (`YOUR_LOCAL_PASSWORD`, `<project-ref>`) — never real values.
4. Local `.env` points to **local Postgres**. The deployed backend's environment (hosting dashboard) points to **Supabase**. A developer's laptop never holds the Supabase service-role key unless they are the person deploying.
5. If a secret is ever committed: rotate it immediately (Supabase dashboard → regenerate keys / reset DB password), then remove it from history.
6. Backend reads configuration through one `config.ts` that validates required variables at startup and fails fast with a clear message.
