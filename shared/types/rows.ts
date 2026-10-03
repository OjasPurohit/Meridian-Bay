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
  last_login_at: IsoDateTime | null;
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
  notes: string | null;
  joined_on: IsoDate;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Staff {
  id: Uuid;
  user_id: Uuid;
  employee_code: string;
  designation: string;
  default_area: E.ShiftArea | null;
  monthly_salary: Money;
  joined_on: IsoDate;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface BusinessClient {
  id: Uuid;
  user_id: Uuid | null;
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
  min_age: number | null;
  max_age: number | null;
  benefits: string[];
  sort_order: number;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Membership {
  id: Uuid;
  member_id: Uuid;
  membership_plan_id: Uuid;
  status: E.MembershipStatus;
  start_date: IsoDate;
  end_date: IsoDate;
  price_paid: Money;
  previous_membership_id: Uuid | null;
  cancelled_at: IsoDateTime | null;
  cancellation_reason: string | null;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ enquiries / CRM
export interface Enquiry {
  id: Uuid;
  enquiry_type: E.EnquiryType;
  source: E.EnquirySource;
  status: E.EnquiryStatus;
  name: string;
  email: string | null;
  phone: string;
  message: string | null;
  membership_plan_id: Uuid | null;
  sport_type: E.SportType | null;
  preferred_start_at: IsoDateTime | null;
  assigned_to_user_id: Uuid | null;
  next_follow_up_at: IsoDateTime | null;
  converted_member_id: Uuid | null;
  lost_reason: string | null;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface EnquiryFollowUp {
  id: Uuid;
  enquiry_id: Uuid;
  done_by_user_id: Uuid;
  method: E.FollowUpMethod;
  note: string;
  followed_up_at: IsoDateTime;
  next_follow_up_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface Quote {
  id: Uuid;
  quote_number: string;
  enquiry_id: Uuid;
  membership_plan_id: Uuid | null;
  description: string;
  amount: Money;
  valid_until: IsoDate;
  status: E.QuoteStatus;
  sent_at: IsoDateTime | null;
  created_by_user_id: Uuid;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ courts
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

export interface CourtBooking {
  id: Uuid;
  booking_number: string;
  court_id: Uuid;
  booking_type: E.BookingType;
  status: E.BookingStatus;
  customer_type: E.CustomerType | null;
  member_id: Uuid | null;
  membership_id: Uuid | null;
  guest_name: string | null;
  guest_phone: string | null;
  enquiry_id: Uuid | null;
  start_at: IsoDateTime;
  end_at: IsoDateTime;
  list_price: Money;
  discount_amount: Money;
  amount_due: Money;
  tax_amount: Money;
  payment_status: E.PaymentStatus;
  notes: string | null;
  cancelled_at: IsoDateTime | null;
  cancelled_by_user_id: Uuid | null;
  cancellation_reason: string | null;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface SocialSession {
  id: Uuid;
  court_booking_id: Uuid;
  title: string;
  description: string | null;
  capacity: number;
  fee_per_person: Money;
  status: E.SocialSessionStatus;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface SocialSessionParticipant {
  id: Uuid;
  social_session_id: Uuid;
  member_id: Uuid | null;
  guest_name: string | null;
  guest_phone: string | null;
  status: E.ParticipantStatus;
  fee_amount: Money;
  tax_amount: Money;
  payment_status: E.PaymentStatus;
  joined_at: IsoDateTime;
  cancelled_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ shop + inventory
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

export interface ShopOrder {
  id: Uuid;
  order_number: string;
  channel: E.OrderChannel;
  fulfillment: E.OrderFulfillment;
  status: E.ShopOrderStatus;
  member_id: Uuid | null;
  membership_id: Uuid | null;
  guest_name: string | null;
  guest_phone: string | null;
  delivery_address: string | null;
  subtotal: Money;
  discount_amount: Money;
  delivery_fee: Money;
  tax_amount: Money;
  total_amount: Money;
  payment_status: E.PaymentStatus;
  notes: string | null;
  placed_by_user_id: Uuid | null;
  completed_at: IsoDateTime | null;
  cancelled_at: IsoDateTime | null;
  cancellation_reason: string | null;
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
  line_total: Money;
  created_at: IsoDateTime;
}

export interface InventoryMovement {
  id: Uuid;
  product_id: Uuid;
  quantity_change: number;
  quantity_after: number;
  reason: E.InventoryReason;
  shop_order_id: Uuid | null;
  notes: string | null;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
}

// ------------------------------------------------------------------ bar / kitchen
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

export interface BarTable {
  id: Uuid;
  label: string;
  capacity: number;
  status: E.TableStatus;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface BarTab {
  id: Uuid;
  tab_number: string;
  bar_table_id: Uuid | null;
  member_id: Uuid | null;
  guest_name: string | null;
  status: E.TabStatus;
  opened_at: IsoDateTime;
  settled_at: IsoDateTime | null;
  opened_by_user_id: Uuid | null;
  settled_by_user_id: Uuid | null;
  subtotal: Money;
  discount_amount: Money;
  tax_amount: Money;
  total_amount: Money;
  payment_status: E.PaymentStatus;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface BarOrder {
  id: Uuid;
  order_number: string;
  bar_table_id: Uuid | null;
  bar_tab_id: Uuid | null;
  member_id: Uuid | null;
  membership_id: Uuid | null;
  guest_name: string | null;
  status: E.OrderStatus;
  subtotal: Money;
  discount_amount: Money;
  tax_amount: Money;
  total_amount: Money;
  payment_status: E.PaymentStatus;
  notes: string | null;
  taken_by_user_id: Uuid | null;
  ready_at: IsoDateTime | null;
  served_at: IsoDateTime | null;
  cancelled_at: IsoDateTime | null;
  cancellation_reason: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface BarOrderItem {
  id: Uuid;
  bar_order_id: Uuid;
  bar_menu_item_id: Uuid;
  item_name: string;
  unit_price: Money;
  quantity: number;
  line_total: Money;
  notes: string | null;
  created_at: IsoDateTime;
}

export interface OrderStatusEvent {
  id: Uuid;
  bar_order_id: Uuid;
  from_status: E.OrderStatus | null;
  to_status: E.OrderStatus;
  changed_by_user_id: Uuid | null;
  note: string | null;
  created_at: IsoDateTime;
}

// ------------------------------------------------------------------ finance
export interface Payment {
  id: Uuid;
  payment_number: string;
  source_type: E.PaymentSourceType;
  source_id: Uuid;
  revenue_category: E.RevenueCategory;
  member_id: Uuid | null;
  business_client_id: Uuid | null;
  payer_name: string | null;
  amount: Money;
  tax_amount: Money;
  method: E.PaymentMethod;
  status: E.PaymentTxnStatus;
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

export interface Invoice {
  id: Uuid;
  invoice_number: string;
  invoice_type: E.InvoiceType;
  business_client_id: Uuid | null;
  member_id: Uuid | null;
  status: E.InvoiceStatus;
  issue_date: IsoDate;
  due_date: IsoDate;
  subtotal: Money;
  tax_rate: Percent;
  tax_amount: Money;
  total_amount: Money;
  amount_paid: Money;
  notes: string | null;
  sent_at: IsoDateTime | null;
  voided_at: IsoDateTime | null;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface InvoiceItem {
  id: Uuid;
  invoice_id: Uuid;
  description: string;
  quantity: number;
  unit_price: Money;
  line_total: Money;
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
  notes: string | null;
  created_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface LeaveRequest {
  id: Uuid;
  staff_id: Uuid;
  leave_type: E.LeaveType;
  start_date: IsoDate;
  end_date: IsoDate;
  reason: string | null;
  status: E.LeaveStatus;
  decided_by_user_id: Uuid | null;
  decided_at: IsoDateTime | null;
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
  status: E.PayrollStatus;
  paid_on: IsoDate | null;
  paid_by_user_id: Uuid | null;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ platform
export interface Notification {
  id: Uuid;
  user_id: Uuid;
  type: E.NotificationType;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: Uuid | null;
  is_read: boolean;
  read_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface ClubSetting {
  id: Uuid;
  key: string;
  value: unknown; // jsonb: string | number | boolean
  description: string | null;
  is_public: boolean;
  updated_by_user_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}
