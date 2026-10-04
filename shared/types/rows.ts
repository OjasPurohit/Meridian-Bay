/**
 * DB ROW TYPES — one interface per table, columns identical (name, nullability) to database/migrations/*.sql.
 * `tools/check-consistency.mjs` fails the build if an interface drifts from its table.
 * Interface name  = PascalCase singular of the table (see TABLE_TO_INTERFACE in the checker).
 *
 * JSON serialisation rules (apply to every API response, see docs/contracts/CONVENTIONS in SHARED_TYPES.md):
 *   Uuid        string (lowercase uuid v4)
 *   Money       string, always 2 decimals, e.g. "1250.00"   (NUMERIC(12,2); NEVER a JS number)
 *   Percent     string, 2 decimals, e.g. "18.00"
 *   IsoDateTime string, UTC, toISOString() form: "2026-10-03T12:30:00.000Z"
 *   IsoDate     string "YYYY-MM-DD"  (an IST business date)
 *   TimeOfDay   string "HH:mm:ss"
 */
import type * as E from '../constants/enums';

export type Uuid = string;
export type Money = string;
export type Percent = string;
export type IsoDateTime = string;
export type IsoDate = string;
export type TimeOfDay = string;

// ------------------------------------------------------------------ identity
export interface User {
  id: Uuid;
  email: string;
  password_hash: string; // NEVER returned by the API; use UserPublic
  role: E.UserRole;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Member {
  id: Uuid;
  user_id: Uuid;
  member_code: string;
  date_of_birth: IsoDate | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_url: string | null;
  joined_on: IsoDate;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Staff {
  id: Uuid;
  user_id: Uuid;
  designation: string;
  monthly_salary: Money;
  joined_on: IsoDate;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface BusinessClient {
  id: Uuid;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  gstin: string | null;
  billing_address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ membership
export interface MembershipPlan {
  id: Uuid;
  membership_type: E.MembershipType;
  name: string;
  description: string | null;
  duration_months: number;
  price: Money;
  court_discount_percent: Percent;
  shop_discount_percent: Percent;
  bar_discount_percent: Percent;
  max_plays_per_day: number;
  max_age: number | null;
  benefits: string[];
  sort_order: number;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** One membership TERM (member + plan + start/end date). There is NO stored status: UPCOMING / ACTIVE / EXPIRED / CANCELLED is derived from the
 *  dates and `cancelled_at` by the SQL view `membership_terms` (API responses add it as `MembershipView.status`). */
export interface Membership {
  id: Uuid;
  member_id: Uuid;
  membership_plan_id: Uuid;
  start_date: IsoDate;
  end_date: IsoDate;
  price_paid: Money;
  cancelled_at: IsoDateTime | null;
  cancellation_reason: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ events
export interface Event {
  id: Uuid;
  title: string;
  kind: E.EventKind;
  description: string | null;
  location: string;
  start_at: IsoDateTime;
  end_at: IsoDateTime;
  capacity: number;
  fee: Money;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface EventRegistration {
  id: Uuid;
  event_id: Uuid;
  member_id: Uuid;
  registered_at: IsoDateTime;
}

// ------------------------------------------------------------------ job applications
/** A job application is NOT an employee. `password_hash` exists only while PENDING (so the applicant can log in to the
 *  "under review" page) and is cleared on a decision. Approval creates the users + staff rows. */
export interface EmployeeApplication {
  id: Uuid;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string | null; // NEVER returned by the API
  status: E.ApplicationStatus;
  approved_role: E.UserRole | null;
  applied_at: IsoDateTime;
  reviewed_at: IsoDateTime | null;
  reviewed_by_user_id: Uuid | null;
  decision_note: string | null;
}

// ------------------------------------------------------------------ enquiries
/** A contact / trial request from the website or the desk. `handled_at IS NULL` means it is still new. */
export interface Enquiry {
  id: Uuid;
  enquiry_type: E.EnquiryType;
  name: string;
  email: string | null;
  phone: string;
  message: string | null;
  membership_plan_id: Uuid | null;
  sport_type: E.SportType | null;
  preferred_start_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  handled_at: IsoDateTime | null;
}

// ------------------------------------------------------------------ courts / bookings
export interface Court {
  id: Uuid;
  name: string;
  sport_type: E.SportType;
  description: string | null;
  surface: string | null;
  walk_in_rate_per_hour: Money;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** One court-hour. No stored status or amounts: the view `court_booking_totals` derives status (CANCELLED when `cancelled_at` is set, COMPLETED once
 *  `end_at` has passed), `amount_due = list_price - discount_amount`, `amount_paid` and `payment_status`. */
export interface CourtBooking {
  id: Uuid;
  booking_number: string;
  court_id: Uuid;
  booking_type: E.BookingType;
  member_id: Uuid | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  start_at: IsoDateTime;
  end_at: IsoDateTime;
  list_price: Money;
  discount_amount: Money;
  cancelled_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ shop
export interface Product {
  id: Uuid;
  sku: string;
  name: string;
  category: E.ProductCategory;
  brand: string | null;
  description: string | null;
  price: Money;
  image_url: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** Totals and payment status are derived by the view `shop_order_totals` (subtotal from the lines, total = subtotal - discount + delivery fee). */
export interface ShopOrder {
  id: Uuid;
  order_number: string;
  fulfillment: E.OrderFulfillment;
  status: E.ShopOrderStatus;
  member_id: Uuid | null;
  guest_name: string | null;
  guest_phone: string | null;
  delivery_address: string | null;
  discount_amount: Money;
  delivery_fee: Money;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface ShopOrderItem {
  id: Uuid;
  shop_order_id: Uuid;
  product_id: Uuid;
  product_name: string;
  unit_price: Money;
  quantity: number;
  created_at: IsoDateTime;
}

// ------------------------------------------------------------------ cafe / kitchen
export interface BarMenuItem {
  id: Uuid;
  name: string;
  category: E.MenuCategory;
  description: string | null;
  price: Money;
  is_available: boolean;
  sort_order: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** A cafe order = one kitchen ticket; `table_label` says where it is served. Totals / payment status: view `bar_order_totals`. */
export interface BarOrder {
  id: Uuid;
  order_number: string;
  member_id: Uuid | null;
  guest_name: string | null;
  status: E.OrderStatus;
  discount_amount: Money;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  table_label: string | null;
}

export interface BarOrderItem {
  id: Uuid;
  bar_order_id: Uuid;
  bar_menu_item_id: Uuid;
  item_name: string;
  unit_price: Money;
  quantity: number;
  notes: string | null;
  created_at: IsoDateTime;
}

// ------------------------------------------------------------------ finance
/** The revenue ledger. Revenue category and refund status are derived by the view `payment_ledger`. */
export interface Payment {
  id: Uuid;
  payment_number: string;
  source_type: E.PaymentSourceType;
  source_id: Uuid;
  member_id: Uuid | null;
  business_client_id: Uuid | null;
  payer_name: string | null;
  amount: Money;
  tax_amount: Money;
  method: E.PaymentMethod;
  gateway_reference: string | null;
  received_by_user_id: Uuid | null;
  paid_at: IsoDateTime;
  refunded_amount: Money;
  refund_reason: string | null;
  refunded_at: IsoDateTime | null;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** Stored lifecycle only (DRAFT / SENT / VOID). Totals, tax, amount paid and the paid / overdue state: view `invoice_totals`. */
export interface Invoice {
  id: Uuid;
  invoice_number: string;
  business_client_id: Uuid | null;
  member_id: Uuid | null;
  status: E.InvoiceStatus;
  issue_date: IsoDate;
  due_date: IsoDate;
  tax_rate: Percent;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface InvoiceItem {
  id: Uuid;
  invoice_id: Uuid;
  description: string;
  quantity: number;
  unit_price: Money;
  created_at: IsoDateTime;
}

// ------------------------------------------------------------------ staff / HR
export interface StaffShift {
  id: Uuid;
  staff_id: Uuid;
  shift_date: IsoDate;
  start_time: TimeOfDay;
  end_time: TimeOfDay;
  area: E.ShiftArea;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface LeaveRequest {
  id: Uuid;
  staff_id: Uuid;
  start_date: IsoDate;
  end_date: IsoDate;
  reason: string | null;
  status: E.LeaveStatus;
  decision_note: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface PayrollPayment {
  id: Uuid;
  staff_id: Uuid;
  pay_period: IsoDate;
  amount: Money;
  method: E.PaymentMethod;
  paid_on: IsoDate | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ platform
export interface ClubSetting {
  id: Uuid;
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}
