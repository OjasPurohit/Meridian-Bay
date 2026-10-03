# Shared Types & Conventions

The **TypeScript files in `/shared` are the contract** between database, API, backend and frontend. This page explains them; it does not redefine them.

| File | What | Generated? |
|---|---|---|
| [`shared/constants/enums.ts`](../../shared/constants/enums.ts) | every enum (values = DB enum labels = API strings) | hand-written, **one place** |
| [`shared/constants/errors.ts`](../../shared/constants/errors.ts) | error codes + HTTP status + default message | hand-written |
| [`shared/constants/rules.ts`](../../shared/constants/rules.ts) | invariants (30-min slot, 1-h session, IST), role → home route, setting keys, **state machines** | hand-written |
| [`shared/types/rows.ts`](../../shared/types/rows.ts) | one interface per DB table, **column-for-column** | hand-written, verified against SQL by `npm run check` |
| [`shared/types/api.ts`](../../shared/types/api.ts) | envelopes + response/view types (joins, projections, reports) | hand-written |
| [`shared/types/requests.generated.ts`](../../shared/types/requests.generated.ts) | request body + query type for every endpoint | **generated** from `tools/api/endpoints.mjs` |
| [`shared/lib/money.ts`](../../shared/lib/money.ts), [`time.ts`](../../shared/lib/time.ts) | the one implementation of rounding, tax, IST day logic | hand-written |

Generated references: [ENUMS.md](ENUMS.md) (values + state-machine diagrams), [ERROR_CODES.md](ERROR_CODES.md).

## Domain model → type map

| Domain entity (brief) | Table | Row type | API view types |
|---|---|---|---|
| User | `users` | `User` | `UserPublic`, `AuthSession` |
| Member | `members` | `Member` | `MemberSummary`, `MemberDetail`, `MemberHistoryEvent` |
| Membership plan / Membership | `membership_plans` / `memberships` | `MembershipPlan` / `Membership` | `MembershipView`, `ActiveMembershipSummary`, `MembershipPurchaseResult` |
| Court / Court booking | `courts` / `court_bookings` | `Court` / `CourtBooking` | `CourtAvailability`, `CourtSlot`, `PriceBreakdown`, `BookingDetail`, `BookingCancelResult` |
| Social session / participant | `social_sessions` / `social_session_participants` | `SocialSession` / `SocialSessionParticipant` | `SocialSessionView`, `ParticipantView` |
| Product / Inventory item | `products` (+ `inventory_movements`) | `Product` / `InventoryMovement` | `ProductView`, `InventoryItem`, `InventoryMovementView` |
| Shop order | `shop_orders`, `shop_order_items` | `ShopOrder`, `ShopOrderItem` | `ShopOrderDetail` |
| Bar order / tab / table | `bar_orders`, `bar_order_items`, `bar_tabs`, `bar_tables`, `bar_menu_items` | `BarOrder`, `BarOrderItem`, `BarTab`, `BarTable`, `BarMenuItem` | `BarOrderDetail`, `BarTabDetail`, `BarTableView`, `BarDailySummary` |
| Kitchen order | *(projection of `bar_orders`; history in `order_status_events`)* | `OrderStatusEvent` | `KitchenOrder`, `KitchenOrderItem` |
| Payment | `payments` | `Payment` | `PaymentView` |
| Invoice / Business client | `invoices`, `invoice_items` / `business_clients` | `Invoice`, `InvoiceItem` / `BusinessClient` | `InvoiceView`, `InvoiceDetail`, `BusinessClientDetail` |
| Enquiry / Quote | `enquiries`, `enquiry_follow_ups` / `quotes` | `Enquiry`, `EnquiryFollowUp` / `Quote` | `EnquiryView`, `EnquiryDetail`, `EnquiryFunnel`, `EnquiryConvertResult` |
| Staff / Shift / Leave / Payroll | `staff`, `staff_shifts`, `leave_requests`, `payroll_payments` | `Staff`, `StaffShift`, `LeaveRequest`, `PayrollPayment` | `StaffView`, `ShiftView`, `LeaveView`, `PayrollView` |
| Notification | `notifications` | `Notification` | — |
| Settings | `club_settings` | `ClubSetting` | `SettingView`, `PublicClubInfo` |
| Reports | *(queries)* | — | `OwnerDashboard`, `RevenueReport`, `CourtUtilizationReport`, `MembershipReport`, `ShopReport`, `FinanceReport`, `TaxReport` |

## Conventions

The same conventions are summarised in the [API contract](../api/API_CONTRACT.md#1-global-conventions) and [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md#conventions-mandatory). This is the authoritative list for values on the wire.

| Topic | Rule | Example |
|---|---|---|
| **Field naming** | `snake_case` everywhere — DB column = JSON key = TS property. No camelCase, no `userId`. | `member_id`, `start_at` |
| **Enum values** | `UPPER_SNAKE_CASE` strings, imported from `enums.ts`. | `"CONFIRMED"` |
| **IDs** | UUID v4, lower-case, as strings. Display numbers are separate fields. | `"0a000000-0000-4000-8000-000000000001"` |
| **Money** | JSON **string**, always 2 decimals, INR, tax-inclusive unless stated (invoices exclusive). Math via `money.ts` in paise. Display via `formatInr`. | `"1250.00"` |
| **Percent** | JSON string, 2 decimals. | `"15.00"` |
| **Timestamp** | UTC ISO-8601 with milliseconds and `Z`. | `"2026-10-03T12:30:00.000Z"` |
| **Business date** | IST calendar date `YYYY-MM-DD`; derive with `istDate()`. | `"2026-10-03"` |
| **Time of day** | `HH:mm:ss` (IST) — shifts and opening hours only. | `"18:00:00"` |
| **Timezone** | Store UTC, think in IST (`Asia/Kolkata`, +05:30, no DST). Never use the server's local zone. | |
| **Nullability** | Row types mirror the DB (`T \| null`). Responses always include documented keys. | |
| **Booleans** | `is_*` / `must_*` | `is_active` |
| **Arrays** | `[]`, never `null`, for list-valued fields (`benefits`, `items`). | |
| **Pagination** | `page`, `page_size`, `meta.total`, `meta.total_pages`. | |
| **Errors** | `{ success:false, error:{ code, message, details? } }`; branch on `code`. | |
| **Soft state** | `is_active` / status values; no deletes of financial or operational rows. | |

## Rules for using the types

1. **Import, never copy.** `import type { CourtBooking } from '@shared/types/rows'`. If a type is missing, add it to `/shared` (PR + team notice), don't declare a local one.
2. **A DB column change = four edits in one PR:** migration → `rows.ts` → mock generator → docs rebuild. `npm run check` fails if any drifts.
3. **View types extend row types** (`BookingDetail extends CourtBooking`); never re-list the same fields by hand.
4. **Request types are generated** from the endpoint registry — do not hand-write them; change `tools/api/endpoints.mjs` and rebuild.
5. **Never put server-only fields in responses** (`password_hash`). Use `UserPublic`.
6. Kitchen screens use `KitchenOrder` only (no prices) — never reuse `BarOrderDetail` there.
