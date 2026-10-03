# ADR-010 — Real-time updates: polling, not websockets

**Status:** accepted · **Date:** 2026-10-03 · **Owners:** Dev 1, Dev 3

## Context
The kitchen board and the notification badge should feel live, but infrastructure time is scarce.

## Decision
Polling only: kitchen board every **5 s**, notification count every **30 s**, everything else on focus/refresh. No websockets, SSE or Supabase Realtime in v1. The kitchen query is indexed (`bar_orders(status, created_at)`).

## Consequences
- ✅ No extra infrastructure; behaves identically locally and on Supabase.
- ⚠️ Up to 5 s latency and more requests (fine at club scale).

## Alternatives considered
WebSockets/SSE (state management and hosting constraints) · Supabase Realtime (couples the browser to Supabase, conflicts with ADR-001). Both remain possible later behind the same endpoints.
