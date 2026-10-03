# ADR-011 — Online payments use a mock gateway in the hackathon build

**Status:** accepted (assumption A-14) · **Date:** 2026-10-03 · **Owners:** Dev 4

## Context
"Online" is a required payment method, but a real gateway needs accounts, webhooks and compliance work that does not differentiate the product in 12 hours.

## Decision
`PAYMENT_PROVIDER=mock`: a payment with `method = ONLINE` succeeds instantly and returns `gateway_reference = RZP-<number>`. An amount whose paise are `.13` (for example ₹100.13) simulates a declined payment and returns `PAYMENT_FAILED`, so the failure UI can be demonstrated. The seam for a real provider is `gateway.charge(...)` inside `PaymentsService`; the environment keys are already reserved in `.env.example`. Cash, card and UPI taken at the desk are *recorded*, not processed.

## Consequences
- ✅ Demo-safe, no secrets.
- ⚠️ Not a real payment (clearly labelled in the UI as "demo payment").

## Alternatives considered
Razorpay/Stripe test mode (a good NICE-to-have if time remains).
