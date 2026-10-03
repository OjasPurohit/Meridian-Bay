# Architecture Decision Records

Short, binding decisions. To change one, write a **new** ADR that supersedes it (do not rewrite history) and get team sign-off.

| ADR | Decision |
|---|---|
| [ADR-001](ADR-001-database-architecture.md) | One canonical PostgreSQL schema for local and Supabase; RLS deny-all, backend-only access |
| [ADR-002](ADR-002-authentication-strategy.md) | Backend-issued JWT, email + password, role-based landing |
| [ADR-003](ADR-003-role-model.md) | Five roles; Gold/Silver/Junior are data, not roles |
| [ADR-004](ADR-004-api-response-format.md) | One success envelope, one error envelope, fixed error codes |
| [ADR-005](ADR-005-naming-conventions.md) | snake_case end to end (DB = JSON = TypeScript) |
| [ADR-006](ADR-006-booking-conflict-prevention.md) | Booking overlap prevented by a DB exclusion constraint |
| [ADR-007](ADR-007-inventory-synchronization.md) | One shelf: atomic conditional decrement + stock ledger |
| [ADR-008](ADR-008-tech-stack.md) | React/Vite + Node/Express modular monolith + `pg` |
| [ADR-009](ADR-009-payments-ledger.md) | One payments ledger with polymorphic source; kitchen = bar orders |
| [ADR-010](ADR-010-real-time-strategy.md) | Polling instead of websockets |
| [ADR-011](ADR-011-payment-gateway-mocked.md) | Mock online-payment gateway for the hackathon |
| [ADR-012](ADR-012-api-versioning.md) | `/api/v1`, additive-only within v1, contract freeze at hour 2 |
| [ADR-013](ADR-013-money-time-conventions.md) | Money strings + paise maths + IST business dates |
| [ADR-014](ADR-014-contract-first-generation.md) | Single sources, generated docs, automated consistency checks |
| [ADR-015](ADR-015-derived-data-not-stored.md) | One fact, one place: derived values are generated or computed (membership status from dates); no table removed |
| [ADR-016](ADR-016-database-simplification.md) | Database simplification: 31 tables to 22 (no tabs, CRM pipeline, notifications, stock ledger, social play) |

Template: *Context → Decision → Consequences → Alternatives considered.*
