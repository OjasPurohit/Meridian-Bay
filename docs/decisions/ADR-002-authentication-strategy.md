# ADR-002 — Authentication: backend-issued JWT with email + password

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** Dev 1 (kernel/auth) + whole team

## Context
One login must route five roles to five dashboards, behave identically on local Postgres and Supabase, and keep Gold/Silver/Junior out of the auth model.

## Decision
`users` holds `email`, bcrypt `password_hash` and `role`. `POST /auth/login` verifies the password and returns an HS256 JWT (8 h) containing `sub` (user id), `role` and the profile id (`member_id` / `staff_id` / `business_client_id`). The response also carries `redirect_to = ROLE_HOME_ROUTE[role]`.

Middleware order: `requireAuth` → `requireRole(...)` (the roles listed for the endpoint in `tools/api/endpoints.mjs`) → service-level own-record scoping using the profile id. `users.is_active` is re-checked (short cache) so deactivated accounts are blocked immediately (`ACCOUNT_DISABLED`). No refresh tokens in v1 (re-login after 8 h). Passwords: min 8 characters, letter + digit. Accounts created by staff get `must_change_password = true`. Unauthenticated visitors simply have no token and stay on the public site.

## Consequences
- ✅ Identical behaviour everywhere; role is one column; easy to test.
- ⚠️ We own password reset / MFA (out of scope for v1: reset by front desk or owner).
- ⚠️ Revocation only by expiry or deactivation.

## Alternatives considered
Supabase Auth (couples logins to the cloud project, complicates local development and role/profile joins) · server-side sessions (more moving parts).
