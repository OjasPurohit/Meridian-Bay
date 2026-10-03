/**
 * CANONICAL ENUMS — single source of truth.
 * Rules:
 *  - Values are UPPER_SNAKE_CASE strings, identical in DB (CREATE TYPE), API JSON, and UI.
 *  - Enum names here map to Postgres enum types by lower-casing: USER_ROLE -> user_role.
 *  - Section "STORED" = exists as a Postgres enum. Section "API-ONLY" = never stored.
 *  - Never redefine these elsewhere. Changing this file requires team sign-off (see TEAM_GUIDELINES.md).
 *  - tools/check-consistency.mjs verifies this file against database/migrations/*.sql.
 *  - Some enums are only RETURNED by SQL views (derived values: membership_status, booking_status, payment_status,
 *    payment_txn_status, invoice_payment_state, revenue_category, invoice_type): no table column stores them (ADR-015, ADR-016).
 */

// ============================ STORED (Postgres enums) ============================

export const USER_ROLE = {
  MEMBER: 'MEMBER',
  FRONT_DESK: 'FRONT_DESK',
  KITCHEN_MANAGER: 'KITCHEN_MANAGER',
  BUSINESS_CLIENT: 'BUSINESS_CLIENT',
  OWNER_ADMIN: 'OWNER_ADMIN',
} as const;

/** Gold / Silver / Junior are membership PLANS (membership_plans.membership_type), never login roles. */
export const MEMBERSHIP_TYPE = {
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  JUNIOR: 'JUNIOR',
} as const;

/** DERIVED, never stored: computed from term dates + cancelled_at by the SQL view `membership_terms`. */
export const MEMBERSHIP_STATUS = {
  UPCOMING: 'UPCOMING', // renewal purchased early; starts the day after the current term ends
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED', // cancelled by the owner (cancelled_at set)
} as const;

export const SPORT_TYPE = {
  TENNIS: 'TENNIS',
  CRICKET: 'CRICKET',
  PADEL: 'PADEL',
  BADMINTON: 'BADMINTON',
} as const;

export const BOOKING_TYPE = {
  REGULAR: 'REGULAR', // a member or a walk-in guest plays
  MAINTENANCE: 'MAINTENANCE', // court blocked by owner
} as const;

/** DERIVED by the view `court_booking_totals`: CANCELLED when cancelled_at is set, COMPLETED once end_at has passed. */
export const BOOKING_STATUS = {
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export const PRODUCT_CATEGORY = {
  RACKET: 'RACKET',
  BALL: 'BALL',
  SHOES: 'SHOES',
  ACCESSORY: 'ACCESSORY',
  APPAREL: 'APPAREL',
} as const;

export const MENU_CATEGORY = {
  FOOD: 'FOOD',
  SNACK: 'SNACK',
  DRINK: 'DRINK',
} as const;

export const ORDER_FULFILLMENT = {
  PICKUP: 'PICKUP',
  DELIVERY: 'DELIVERY',
  IN_STORE: 'IN_STORE', // counter sale, taken away immediately (staff-made); PICKUP / DELIVERY are placed online by a member
} as const;

export const SHOP_ORDER_STATUS = {
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

/** Cafe / kitchen order lifecycle (bar_orders.status). */
export const ORDER_STATUS = {
  NEW: 'NEW',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
} as const;

export const PAYMENT_METHOD = {
  CASH: 'CASH',
  CARD: 'CARD',
  UPI: 'UPI',
  ONLINE: 'ONLINE',
} as const;

/** DERIVED by the *_totals views from the bill and its payments (function payment_state): never stored on the bill. */
export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  NOT_REQUIRED: 'NOT_REQUIRED', // free (e.g. Gold court access) or cancelled and never paid
} as const;

/** DERIVED by the view `payment_ledger` from payments.refunded_amount. */
export const PAYMENT_TXN_STATUS = {
  SUCCEEDED: 'SUCCEEDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;

/** What a payment pays for (payments.source_type + source_id, a deliberate polymorphic reference — ADR-009). */
export const PAYMENT_SOURCE_TYPE = {
  COURT_BOOKING: 'COURT_BOOKING',
  MEMBERSHIP: 'MEMBERSHIP',
  SHOP_ORDER: 'SHOP_ORDER',
  BAR_ORDER: 'BAR_ORDER',
  INVOICE: 'INVOICE',
} as const;

/** DERIVED by the view `payment_ledger` from the payment's source_type (invoices: BUSINESS or MEMBERSHIP by recipient). */
export const REVENUE_CATEGORY = {
  COURT: 'COURT',
  MEMBERSHIP: 'MEMBERSHIP',
  SHOP: 'SHOP',
  BAR: 'BAR',
  BUSINESS: 'BUSINESS',
} as const;

/** DERIVED by the view `invoice_totals`: BUSINESS when addressed to a business client, MEMBERSHIP when addressed to a member. */
export const INVOICE_TYPE = {
  BUSINESS: 'BUSINESS',
  MEMBERSHIP: 'MEMBERSHIP',
} as const;

/** Stored invoice lifecycle. Whether a SENT invoice is paid / overdue is DERIVED (INVOICE_PAYMENT_STATE). */
export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VOID: 'VOID',
} as const;

/** DERIVED by the view `invoice_totals` for SENT invoices (NULL for DRAFT / VOID). */
export const INVOICE_PAYMENT_STATE = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE', // due_date passed and not fully paid (R-INVC-03)
} as const;

export const ENQUIRY_TYPE = {
  GENERAL: 'GENERAL',
  TRIAL: 'TRIAL',
  MEMBERSHIP: 'MEMBERSHIP',
  BUSINESS: 'BUSINESS',
} as const;

export const SHIFT_AREA = {
  FRONT_DESK: 'FRONT_DESK',
  BAR: 'BAR',
  KITCHEN: 'KITCHEN',
  SHOP: 'SHOP',
  COURTS: 'COURTS',
} as const;

export const LEAVE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

// ============================ API-ONLY (never stored) ============================

export const SLOT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BOOKED: 'BOOKED',
  BLOCKED: 'BLOCKED', // maintenance
  PAST: 'PAST',
} as const;

export const STOCK_STATUS = {
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
} as const;

export const REPORT_PERIOD = {
  TODAY: 'TODAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
} as const;

export const LEAVE_DECISION = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
} as const;

export const HISTORY_EVENT_TYPE = {
  MEMBERSHIP: 'MEMBERSHIP',
  COURT_BOOKING: 'COURT_BOOKING',
  SHOP_ORDER: 'SHOP_ORDER',
  BAR_ORDER: 'BAR_ORDER',
  PAYMENT: 'PAYMENT',
} as const;

export const REPORT_GROUP_BY = {
  DAY: 'DAY',
  CATEGORY: 'CATEGORY',
  METHOD: 'METHOD',
} as const;

export const EXPORT_REPORT = {
  REVENUE: 'REVENUE',
  MEMBERS: 'MEMBERS',
  BOOKINGS: 'BOOKINGS',
  SHOP_SALES: 'SHOP_SALES',
  BAR_SALES: 'BAR_SALES',
  TAX: 'TAX',
} as const;

// ============================ Derived union types ============================

type ValueOf<T> = T[keyof T];
export type UserRole = ValueOf<typeof USER_ROLE>;
export type MembershipType = ValueOf<typeof MEMBERSHIP_TYPE>;
export type MembershipStatus = ValueOf<typeof MEMBERSHIP_STATUS>;
export type SportType = ValueOf<typeof SPORT_TYPE>;
export type BookingType = ValueOf<typeof BOOKING_TYPE>;
export type BookingStatus = ValueOf<typeof BOOKING_STATUS>;
export type ProductCategory = ValueOf<typeof PRODUCT_CATEGORY>;
export type MenuCategory = ValueOf<typeof MENU_CATEGORY>;
export type OrderFulfillment = ValueOf<typeof ORDER_FULFILLMENT>;
export type ShopOrderStatus = ValueOf<typeof SHOP_ORDER_STATUS>;
export type OrderStatus = ValueOf<typeof ORDER_STATUS>;
export type PaymentMethod = ValueOf<typeof PAYMENT_METHOD>;
export type PaymentStatus = ValueOf<typeof PAYMENT_STATUS>;
export type PaymentTxnStatus = ValueOf<typeof PAYMENT_TXN_STATUS>;
export type PaymentSourceType = ValueOf<typeof PAYMENT_SOURCE_TYPE>;
export type RevenueCategory = ValueOf<typeof REVENUE_CATEGORY>;
export type InvoiceType = ValueOf<typeof INVOICE_TYPE>;
export type InvoiceStatus = ValueOf<typeof INVOICE_STATUS>;
export type InvoicePaymentState = ValueOf<typeof INVOICE_PAYMENT_STATE>;
export type EnquiryType = ValueOf<typeof ENQUIRY_TYPE>;
export type ShiftArea = ValueOf<typeof SHIFT_AREA>;
export type LeaveStatus = ValueOf<typeof LEAVE_STATUS>;
export type SlotStatus = ValueOf<typeof SLOT_STATUS>;
export type StockStatus = ValueOf<typeof STOCK_STATUS>;
export type ReportPeriod = ValueOf<typeof REPORT_PERIOD>;
export type LeaveDecision = ValueOf<typeof LEAVE_DECISION>;
export type HistoryEventType = ValueOf<typeof HISTORY_EVENT_TYPE>;
export type ReportGroupBy = ValueOf<typeof REPORT_GROUP_BY>;
export type ExportReport = ValueOf<typeof EXPORT_REPORT>;
