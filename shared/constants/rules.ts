/**
 * CANONICAL BUSINESS-RULE CONSTANTS (structural invariants) + state machines + conventions.
 *
 * Division of responsibility (avoids two sources of truth):
 *  - THIS FILE  = invariants that are NOT owner-editable (slot size, session length, timezone, state machines).
 *  - club_settings table = owner-editable policy values (hours, cancel cut-off, tax rates, delivery fee...).
 *  - membership_plans table = per-plan benefits (discount %, max plays/day, price, duration).
 * Prose version of every rule: docs/business-rules/BUSINESS_RULES.md
 */

import type {
  UserRole, OrderStatus, ShopOrderStatus, InvoiceStatus, LeaveStatus,
} from './enums';

// ---------- conventions ----------
export const API_PREFIX = '/api/v1' as const;
export const TIMEZONE = 'Asia/Kolkata' as const; // all "business dates" are evaluated in this zone
export const CURRENCY = 'INR' as const;
export const CURRENCY_SYMBOL = '₹' as const;
export const PAGINATION = { DEFAULT_PAGE_SIZE: 20, MAX_PAGE_SIZE: 100 } as const;

// ---------- court rules (invariants) ----------
export const SLOT_INTERVAL_MINUTES = 30 as const; // a new slot starts every 30 min
export const SESSION_DURATION_MINUTES = 60 as const; // every session lasts 1 hour
export const SLOT_START_MINUTES_ALLOWED = [0, 30] as const;

/** Roles an owner may give an approved job applicant (the owner account itself is never created this way). */
export const EMPLOYEE_ROLES = ['FRONT_DESK', 'KITCHEN_MANAGER', 'STORE_MANAGER'] as const;

// ---------- role -> landing route after login ----------
export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  MEMBER: '/member',
  FRONT_DESK: '/front-desk',
  KITCHEN_MANAGER: '/kitchen',
  STORE_MANAGER: '/store-manager',
  OWNER_ADMIN: '/owner',
};

// ---------- club_settings keys (values live in the DB; see seed) ----------
export const SETTING_KEYS = [
  'club_name', 'club_tagline', 'club_description', 'club_address', 'club_phone', 'club_email',
  'club_open_time', 'club_close_time',
  'cancellation_cutoff_hours', 'low_stock_default_threshold', 'membership_expiry_warning_days',
  'delivery_fee', 'free_delivery_above',
  'tax_rate_court', 'tax_rate_membership', 'tax_rate_shop', 'tax_rate_bar', 'tax_rate_business',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

// ---------- state machines (server MUST reject anything else with INVALID_STATUS_TRANSITION) ----------
// A court booking has no stored status: it stands until cancelled_at is set (ADR-006, view court_booking_totals derives
// CONFIRMED / CANCELLED / COMPLETED). An enquiry has none either: handled_at IS NULL means new.

/** Cafe / kitchen order flow. The kitchen may reject (cancel) an order only while it is NEW. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['PREPARING', 'SERVED'], // READY -> PREPARING: the kitchen may take a ticket back when the hand-off went wrong
  SERVED: [],
  CANCELLED: [],
};

/** Shop order flow. PICKUP: ...READY_FOR_PICKUP->COMPLETED. DELIVERY: ...OUT_FOR_DELIVERY->COMPLETED. IN_STORE: created COMPLETED. */
export const SHOP_ORDER_TRANSITIONS: Record<ShopOrderStatus, readonly ShopOrderStatus[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Stored invoice lifecycle. Paid / partially paid / overdue are DERIVED (view invoice_totals); an invoice can be voided only while unpaid. */
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT: ['VOID'],
  VOID: [],
};

export const LEAVE_TRANSITIONS: Record<LeaveStatus, readonly LeaveStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};
