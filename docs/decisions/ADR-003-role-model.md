# ADR-003 — Role model: five roles; memberships are data

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** whole team

## Context
The brief has many actors; the hackathon needs a model that is simple to enforce and to demo.

## Decision
Exactly five roles in `user_role`: `MEMBER`, `FRONT_DESK`, `KITCHEN_MANAGER`, `BUSINESS_CLIENT`, `OWNER_ADMIN`.

- **Gold / Silver / Junior are `membership_plans` rows**, attached to a member through `memberships`. There are no GoldUser/SilverUser/JuniorUser tables and no role per tier.
- *Online visitor* and *walk-in guest* are actors but **not roles**: they have no login. Guests are stored as `guest_name` / `guest_phone` on the records staff create for them.
- There is **no Shop Staff role**: shop/inventory administration belongs to `OWNER_ADMIN`; counter sales are rung up by `FRONT_DESK`.
- There is **one** kitchen role.
- `FRONT_DESK` also operates the bar/cafeteria POS (ASSUMPTIONS A-17).

## Consequences
- ✅ A short permission matrix; tier benefits change by editing data, not code.
- ⚠️ Front desk has broad operational access — acceptable, it is the club's counter.

## Alternatives considered
A role per tier; separate bar-staff and shop-staff roles (rejected by the team).
