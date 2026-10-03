/**
 * CANONICAL ENUMS — single source of truth.
 * Rules:
 *  - Values are UPPER_SNAKE_CASE strings, identical in DB (CREATE TYPE), API JSON, and UI.
 *  - Enum names here map to Postgres enum types by lower-casing: USER_ROLE -> user_role.
 *  - Section "STORED" = exists as a Postgres enum. Section "API-ONLY" = never stored.
 *  - Never redefine these elsewhere. Changing this file requires team sign-off (see TEAM_GUIDELINES.md).
 *  - tools/check-consistency.mjs verifies this file against database/migrations/*.sql.
 */

// ============================ STORED (Postgres enums) ============================

export const USER_ROLE = {
  MEMBER: 'MEMBER',
  FRONT_DESK: 'FRONT_DESK',
  KITCHEN_MANAGER: 'KITCHEN_MANAGER',
  BUSINESS_CLIENT: 'BUSINESS_CLIENT',
  OWNER_ADMIN: 'OWNER_ADMIN',
} as const;

export const MEMBERSHIP_TYPE = {
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  JUNIOR: 'JUNIOR',
} as const;

export const MEMBERSHIP_STATUS = {
  UPCOMING: 'UPCOMING', // renewal purchased early; starts the day after the current term ends
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  CHANGED: 'CHANGED', // superseded by a plan change
} as const;

export const SPORT_TYPE = {
  TENNIS: 'TENNIS',
  CRICKET: 'CRICKET',
  PADEL: 'PADEL',
  BADMINTON: 'BADMINTON',
} as const;

export const BOOKING_TYPE = {
  REGULAR: 'REGULAR',
  SOCIAL_SESSION: 'SOCIAL_SESSION', // court held for Friday social play
  TRIAL: 'TRIAL', // trial session for an enquiry
  MAINTENANCE: 'MAINTENANCE', // court blocked by owner
} as const;

export const BOOKING_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export const CUSTOMER_TYPE = {
  MEMBER: 'MEMBER',
  WALK_IN: 'WALK_IN',
} as const;

export const SOCIAL_SESSION_STATUS = {
  OPEN: 'OPEN',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;

export const PARTICIPANT_STATUS = {
  JOINED: 'JOINED',
  CANCELLED: 'CANCELLED',
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

export const ORDER_CHANNEL = {
  PHYSICAL: 'PHYSICAL', // rung up at the counter by staff
  ONLINE: 'ONLINE', // placed by a member from the website
} as const;

export const ORDER_FULFILLMENT = {
  PICKUP: 'PICKUP',
  DELIVERY: 'DELIVERY',
  IN_STORE: 'IN_STORE', // counter sale, taken away immediately
} as const;

export const SHOP_ORDER_STATUS = {
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

/** Bar / kitchen order lifecycle (bar_orders.status). */
export const ORDER_STATUS = {
  NEW: 'NEW',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
} as const;

export const TABLE_STATUS = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
} as const;

export const TAB_STATUS = {
  OPEN: 'OPEN',
  SETTLED: 'SETTLED',
  VOID: 'VOID',
} as const;

export const PAYMENT_METHOD = {
  CASH: 'CASH',
  CARD: 'CARD',
  UPI: 'UPI',
  ONLINE: 'ONLINE',
} as const;

/** Payment state recorded on the thing being paid for (booking, order, tab, invoice...). */
export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
  NOT_REQUIRED: 'NOT_REQUIRED', // free (e.g. Gold court access) or trial
} as const;

/** State of one row in `payments` (a money-movement record). */
export const PAYMENT_TXN_STATUS = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;

export const PAYMENT_SOURCE_TYPE = {
  COURT_BOOKING: 'COURT_BOOKING',
  SOCIAL_PARTICIPANT: 'SOCIAL_PARTICIPANT',
  MEMBERSHIP: 'MEMBERSHIP',
  SHOP_ORDER: 'SHOP_ORDER',
  BAR_ORDER: 'BAR_ORDER',
  TAB: 'TAB',
  INVOICE: 'INVOICE',
} as const;

export const REVENUE_CATEGORY = {
  COURT: 'COURT',
  MEMBERSHIP: 'MEMBERSHIP',
  SHOP: 'SHOP',
  BAR: 'BAR',
  BUSINESS: 'BUSINESS',
} as const;

export const INVOICE_TYPE = {
  BUSINESS: 'BUSINESS',
  MEMBERSHIP: 'MEMBERSHIP',
} as const;

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;

export const ENQUIRY_TYPE = {
  GENERAL: 'GENERAL',
  TRIAL: 'TRIAL',
  MEMBERSHIP: 'MEMBERSHIP',
  BUSINESS: 'BUSINESS',
} as const;

export const ENQUIRY_SOURCE = {
  WEBSITE: 'WEBSITE',
  PHONE: 'PHONE',
  WALK_IN: 'WALK_IN',
} as const;

export const ENQUIRY_STATUS = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUOTE_SENT: 'QUOTE_SENT',
  FOLLOW_UP: 'FOLLOW_UP',
  CONVERTED: 'CONVERTED',
  LOST: 'LOST',
} as const;

export const FOLLOW_UP_METHOD = {
  CALL: 'CALL',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  IN_PERSON: 'IN_PERSON',
} as const;

export const QUOTE_STATUS = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export const SHIFT_AREA = {
  FRONT_DESK: 'FRONT_DESK',
  BAR: 'BAR',
  KITCHEN: 'KITCHEN',
  SHOP: 'SHOP',
  COURTS: 'COURTS',
} as const;

export const LEAVE_TYPE = {
  CASUAL: 'CASUAL',
  SICK: 'SICK',
  PAID: 'PAID',
  UNPAID: 'UNPAID',
} as const;

export const LEAVE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export const PAYROLL_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
} as const;

export const INVENTORY_REASON = {
  OPENING: 'OPENING',
  RESTOCK: 'RESTOCK',
  SALE: 'SALE',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  DAMAGE: 'DAMAGE',
  CANCELLATION: 'CANCELLATION', // stock returned because an order was cancelled
} as const;

export const NOTIFICATION_TYPE = {
  MEMBERSHIP_EXPIRING: 'MEMBERSHIP_EXPIRING',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  SOCIAL_SESSION_JOINED: 'SOCIAL_SESSION_JOINED',
  LOW_STOCK: 'LOW_STOCK',
  SHOP_ORDER_UPDATE: 'SHOP_ORDER_UPDATE',
  ORDER_READY: 'ORDER_READY',
  NEW_ENQUIRY: 'NEW_ENQUIRY',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  LEAVE_REQUESTED: 'LEAVE_REQUESTED',
  LEAVE_DECIDED: 'LEAVE_DECIDED',
  SHIFT_ASSIGNED: 'SHIFT_ASSIGNED',
  SYSTEM: 'SYSTEM',
} as const;

// ============================ API-ONLY (never stored) ============================

export const SLOT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BOOKED: 'BOOKED',
  SOCIAL: 'SOCIAL', // held for social play (joinable)
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
  SOCIAL_SESSION: 'SOCIAL_SESSION',
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
export type CustomerType = ValueOf<typeof CUSTOMER_TYPE>;
export type SocialSessionStatus = ValueOf<typeof SOCIAL_SESSION_STATUS>;
export type ParticipantStatus = ValueOf<typeof PARTICIPANT_STATUS>;
export type ProductCategory = ValueOf<typeof PRODUCT_CATEGORY>;
export type MenuCategory = ValueOf<typeof MENU_CATEGORY>;
export type OrderChannel = ValueOf<typeof ORDER_CHANNEL>;
export type OrderFulfillment = ValueOf<typeof ORDER_FULFILLMENT>;
export type ShopOrderStatus = ValueOf<typeof SHOP_ORDER_STATUS>;
export type OrderStatus = ValueOf<typeof ORDER_STATUS>;
export type TableStatus = ValueOf<typeof TABLE_STATUS>;
export type TabStatus = ValueOf<typeof TAB_STATUS>;
export type PaymentMethod = ValueOf<typeof PAYMENT_METHOD>;
export type PaymentStatus = ValueOf<typeof PAYMENT_STATUS>;
export type PaymentTxnStatus = ValueOf<typeof PAYMENT_TXN_STATUS>;
export type PaymentSourceType = ValueOf<typeof PAYMENT_SOURCE_TYPE>;
export type RevenueCategory = ValueOf<typeof REVENUE_CATEGORY>;
export type InvoiceType = ValueOf<typeof INVOICE_TYPE>;
export type InvoiceStatus = ValueOf<typeof INVOICE_STATUS>;
export type EnquiryType = ValueOf<typeof ENQUIRY_TYPE>;
export type EnquirySource = ValueOf<typeof ENQUIRY_SOURCE>;
export type EnquiryStatus = ValueOf<typeof ENQUIRY_STATUS>;
export type FollowUpMethod = ValueOf<typeof FOLLOW_UP_METHOD>;
export type QuoteStatus = ValueOf<typeof QUOTE_STATUS>;
export type ShiftArea = ValueOf<typeof SHIFT_AREA>;
export type LeaveType = ValueOf<typeof LEAVE_TYPE>;
export type LeaveStatus = ValueOf<typeof LEAVE_STATUS>;
export type PayrollStatus = ValueOf<typeof PAYROLL_STATUS>;
export type InventoryReason = ValueOf<typeof INVENTORY_REASON>;
export type NotificationType = ValueOf<typeof NOTIFICATION_TYPE>;
export type SlotStatus = ValueOf<typeof SLOT_STATUS>;
export type StockStatus = ValueOf<typeof STOCK_STATUS>;
export type ReportPeriod = ValueOf<typeof REPORT_PERIOD>;
export type LeaveDecision = ValueOf<typeof LEAVE_DECISION>;
export type HistoryEventType = ValueOf<typeof HISTORY_EVENT_TYPE>;
export type ReportGroupBy = ValueOf<typeof REPORT_GROUP_BY>;
export type ExportReport = ValueOf<typeof EXPORT_REPORT>;
