# ADR-006 — Booking conflict prevention: database exclusion constraint

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** Dev 2

## Context
"Two people must never end up on the same court at the same time" — under phone-call-speed concurrency, with 1-hour sessions starting every 30 minutes (so sessions overlap at half-hour offsets) and a Friday social-play hold.

## Decision
All court occupancy lives in `court_bookings` (regular, trial, maintenance and the social-session hold). The table has:

```sql
EXCLUDE USING gist (court_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
  WHERE (status IN ('PENDING','CONFIRMED','COMPLETED'))
```

Overlap is therefore impossible regardless of application bugs or races. The API catches SQLSTATE `23P01` and returns `BOOKING_CONFLICT`. Cancelling sets `status = 'CANCELLED'`, which leaves the constraint's set, instantly freeing the slot. The daily-play limit is checked in the same transaction under `pg_advisory_xact_lock(hashtext(member_id::text))`.

**Verified:** `npm run check:db` loads the seed into a real Postgres engine and confirms that an identical slot *and* a half-hour-offset slot are rejected by `court_bookings_no_overlap`, and that a non-:00/:30 start is rejected by the `CHECK`.

## Consequences
- ✅ Correct under concurrency; very little code.
- ⚠️ Needs the `btree_gist` extension (available on Postgres and Supabase).

## Alternatives considered
Pre-check query only (race condition) · a slot table with `UNIQUE(court, slot)` (does not model overlapping 1-hour sessions on a 30-minute grid) · application-level locks.
