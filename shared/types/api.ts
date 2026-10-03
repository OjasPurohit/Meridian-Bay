/**
 * API ENVELOPES + RESPONSE (view) TYPES — composites built from the row types in ./rows.ts.
 * Every endpoint in tools/api/endpoints.mjs names its response type from this file or rows.ts.
 * Request-body / query types are GENERATED into ./requests.generated.ts (do not hand-write them).
 * Naming rule: field names are the DB column names; joined/derived fields use the same snake_case style.
 */
import type * as E from '../constants/enums';
import type { ErrorCode } from '../constants/errors';
import type {
  Uuid, Money, Percent, IsoDate, IsoDateTime, TimeOfDay, User, Member, Staff, BusinessClient, MembershipPlan, Membership,
  Enquiry, EnquiryFollowUp, Quote, Court, CourtBooking, SocialSession, SocialSessionParticipant, Product, ShopOrder,
  ShopOrderItem, InventoryMovement, BarMenuItem, BarTable, BarTab, BarOrder, BarOrderItem, Payment, Invoice, InvoiceItem,
  StaffShift, LeaveRequest, PayrollPayment,
} from './rows';

// ------------------------------------------------------------------ envelopes
export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PageMeta; // present ONLY on paginated list endpoints
}
export interface ApiError {
  success: false;
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> }; // details.fields for VALIDATION_ERROR
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ------------------------------------------------------------------ auth
export type UserPublic = Omit<User, 'password_hash'>;

export interface AuthSession {
  token: string; // JWT, send as `Authorization: Bearer <token>`
  expires_at: IsoDateTime;
  user: UserPublic;
  redirect_to: string; // ROLE_HOME_ROUTE[user.role]
  member: MemberSummary | null; // when role = MEMBER
  staff: StaffView | null; // when role = FRONT_DESK | KITCHEN_MANAGER | OWNER_ADMIN (owner has a staff row too)
  business_client: BusinessClient | null; // when role = BUSINESS_CLIENT
}

// ------------------------------------------------------------------ members / memberships
export interface ActiveMembershipSummary {
  membership_id: Uuid;
  membership_plan_id: Uuid;
  membership_type: E.MembershipType;
  plan_name: string;
  status: E.MembershipStatus;
  start_date: IsoDate;
  end_date: IsoDate;
  days_remaining: number; // end_date - today(IST); negative never returned (then status = EXPIRED)
}

export interface MemberSummary {
  id: Uuid;
  user_id: Uuid;
  member_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  date_of_birth: IsoDate | null;
  photo_url: string | null;
  joined_on: IsoDate;
  is_active: boolean;
  active_membership: ActiveMembershipSummary | null; // null => no current plan => walk-in rates apply
}

export interface MemberDetail extends MemberSummary {
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  plan: MembershipPlan | null; // plan of the active membership (benefits, discounts)
  plays_used_today: number;
  plays_allowed_per_day: number;
}

export interface MembershipView extends Membership {
  plan: MembershipPlan;
  member_name: string;
  member_code: string;
}

export interface MemberHistoryEvent {
  event_type: E.HistoryEventType;
  occurred_at: IsoDateTime;
  title: string; // e.g. "Court 1 booking", "Gold membership purchased"
  status: string | null;
  amount: Money | null;
  entity_type: string; // table name, e.g. 'court_bookings'
  entity_id: Uuid;
}

// ------------------------------------------------------------------ courts / bookings
export interface CourtSlot {
  start_at: IsoDateTime;
  end_at: IsoDateTime; // start_at + 1h
  status: E.SlotStatus;
  booking_id: Uuid | null; // only for staff roles, null for PUBLIC/MEMBER
  social_session_id: Uuid | null; // set when status = SOCIAL
  spots_left: number | null; // set when status = SOCIAL
  walk_in_price: Money;
}

export interface CourtAvailability {
  court_id: Uuid;
  court_name: string;
  sport_type: E.SportType;
  date: IsoDate;
  slots: CourtSlot[]; // every 30 min from open to (close - 1h)
}

export interface PriceBreakdown {
  court_id: Uuid;
  start_at: IsoDateTime;
  end_at: IsoDateTime;
  customer_type: E.CustomerType;
  membership_type: E.MembershipType | null;
  list_price: Money;
  discount_percent: Percent;
  discount_amount: Money;
  amount_due: Money;
  tax_rate: Percent;
  tax_amount: Money;
  is_free: boolean;
  plays_used_today: number | null; // null for walk-ins
  plays_allowed_per_day: number | null;
}

export interface BookingDetail extends CourtBooking {
  court_name: string;
  sport_type: E.SportType;
  member_name: string | null;
  member_code: string | null;
  social_session_id: Uuid | null;
}

export interface BookingCancelResult {
  booking: BookingDetail;
  refund_amount: Money; // 0.00 when cancelled inside the cut-off window or when nothing was paid
  refund_payment_id: Uuid | null;
}

// ------------------------------------------------------------------ social play
export interface ParticipantView extends SocialSessionParticipant {
  display_name: string;
  member_code: string | null;
}

export interface SocialSessionView extends SocialSession {
  court_id: Uuid;
  court_name: string;
  sport_type: E.SportType;
  start_at: IsoDateTime;
  end_at: IsoDateTime;
  participant_count: number; // JOINED only
  spots_left: number;
  participants?: ParticipantView[]; // only on GET /social-play/sessions/:id for authenticated roles
}

// ------------------------------------------------------------------ shop / inventory
export type StockStatus = E.StockStatus;

export interface ProductView {
  id: Uuid;
  sku: string;
  name: string;
  category: E.ProductCategory;
  brand: string | null;
  description: string | null;
  price: Money;
  image_url: string | null;
  stock_status: E.StockStatus;
  member_price?: Money | null; // present when caller is a MEMBER with an active plan
  // staff-only (FRONT_DESK, OWNER_ADMIN); omitted for PUBLIC/MEMBER:
  stock_quantity?: number;
  low_stock_threshold?: number;
  is_active?: boolean;
}

export interface InventoryItem {
  product_id: Uuid;
  sku: string;
  name: string;
  category: E.ProductCategory;
  stock_quantity: number;
  low_stock_threshold: number;
  stock_status: E.StockStatus;
  is_active: boolean;
  last_movement_at: IsoDateTime | null;
}

export interface InventoryMovementView extends InventoryMovement {
  sku: string;
  product_name: string;
}

export interface StockAdjustmentResult {
  item: InventoryItem;
  movement: InventoryMovement;
}

export interface ShopOrderDetail extends ShopOrder {
  items: ShopOrderItem[];
  member_name: string | null;
  member_code: string | null;
}

// ------------------------------------------------------------------ bar / kitchen
export interface BarTableView extends BarTable {
  current_tab_id: Uuid | null;
  active_order_count: number;
}

export interface BarOrderDetail extends BarOrder {
  items: BarOrderItem[];
  table_label: string | null;
  tab_number: string | null;
  member_name: string | null;
  member_code: string | null;
}

export interface BarTabDetail extends BarTab {
  table_label: string | null;
  member_name: string | null;
  member_code: string | null;
  orders: BarOrderDetail[];
  running_total: Money; // sum of non-cancelled order totals (live); equals total_amount once SETTLED
}

export interface BarSettleResult {
  tab: BarTabDetail;
  payment: Payment;
}

export interface KitchenOrderItem {
  item_name: string;
  quantity: number;
  notes: string | null;
}

/** Kitchen projection of a bar_order: no prices, no payment data. */
export interface KitchenOrder {
  id: Uuid;
  order_number: string;
  status: E.OrderStatus;
  table_label: string | null;
  tab_number: string | null;
  customer_label: string; // member name / guest name / "Table T3"
  notes: string | null;
  created_at: IsoDateTime;
  ready_at: IsoDateTime | null;
  minutes_waiting: number;
  items: KitchenOrderItem[];
}

export interface BarDailySummary {
  date: IsoDate;
  order_count: number;
  served_count: number;
  cancelled_count: number;
  gross_revenue: Money; // sum of payments with revenue_category = BAR (tax inclusive), net of refunds
  discount_total: Money;
  tax_total: Money;
  by_method: { method: E.PaymentMethod; amount: Money; count: number }[];
  open_tabs_count: number;
  open_tabs_amount: Money; // running totals of tabs still OPEN (earned but not yet collected)
  shifts: { staff_id: Uuid; full_name: string; start_time: TimeOfDay; end_time: TimeOfDay }[];
}

// ------------------------------------------------------------------ enquiries
export interface EnquiryView extends Enquiry {
  plan_name: string | null;
  assigned_to_name: string | null;
}

export interface EnquiryDetail extends EnquiryView {
  follow_ups: EnquiryFollowUp[];
  quotes: Quote[];
}

export interface EnquiryFunnel {
  counts: Record<E.EnquiryStatus, number>;
  total: number;
  conversion_rate_percent: Percent;
  follow_ups_due: number; // next_follow_up_at <= now and status not CONVERTED/LOST
}

export interface EnquiryConvertResult {
  enquiry: EnquiryView;
  member: MemberSummary;
  membership: Membership | null;
  payment: Payment | null;
}

// ------------------------------------------------------------------ finance
export interface PaymentView extends Payment {
  payer_label: string;
  source_label: string; // human text, e.g. "Court 1 · 3 Oct 18:00"
  received_by_name: string | null;
}

export interface InvoiceView extends Invoice {
  client_name: string | null; // business client company or member name
  amount_outstanding: Money;
}

export interface InvoiceDetail extends InvoiceView {
  items: InvoiceItem[];
  payments: Payment[];
  client: BusinessClient | null;
}

export interface BusinessClientDetail extends BusinessClient {
  invoice_count: number;
  total_invoiced: Money;
  total_paid: Money;
  total_outstanding: Money;
}

export interface MembershipPurchaseResult {
  membership: MembershipView;
  payment: Payment | null; // null when price is zero (never for standard plans)
}

// ------------------------------------------------------------------ staff
export interface StaffView extends Staff {
  full_name: string;
  email: string;
  phone: string | null;
  role: E.UserRole;
}
export interface ShiftView extends StaffShift {
  staff_name: string;
  employee_code: string;
}
export interface LeaveView extends LeaveRequest {
  staff_name: string;
  employee_code: string;
}
export interface PayrollView extends PayrollPayment {
  staff_name: string;
  employee_code: string;
}

// ------------------------------------------------------------------ public site
export interface PublicClubInfo {
  name: string;
  tagline: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  open_time: TimeOfDay;
  close_time: TimeOfDay;
  social_play: { weekday: number; start_time: TimeOfDay; end_time: TimeOfDay }; // weekday: ISO 1=Mon..7=Sun
  sports: E.SportType[];
  court_count: number;
}

export interface SettingView {
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
  updated_at: IsoDateTime;
}

// ------------------------------------------------------------------ reports (OWNER_ADMIN)
export interface DateRange {
  from: IsoDate;
  to: IsoDate; // inclusive
}
export interface AmountByKey {
  key: string; // enum value, date, or id
  label: string;
  amount: Money;
  count: number;
}

export interface OwnerDashboard {
  period: E.ReportPeriod;
  range: DateRange;
  revenue: { total: Money; refunds: Money; by_category: AmountByKey[]; by_method: AmountByKey[] };
  memberships: { active_total: number; by_type: AmountByKey[]; new_in_period: number; expiring_soon: number };
  courts: { bookings_count: number; utilization_percent: Percent; cancellations_count: number; revenue: Money };
  shop: { orders_count: number; sales_amount: Money; low_stock_count: number };
  bar: { orders_count: number; sales_amount: Money; open_tabs_count: number };
  enquiries: { new_count: number; follow_ups_due: number; converted_in_period: number };
  finance: { outstanding_invoices_amount: Money; payroll_pending_amount: Money; tax_collected: Money };
  staff: { pending_leave_requests: number };
}

export interface RevenueReport {
  range: DateRange;
  group_by: E.ReportGroupBy;
  rows: (AmountByKey & { tax_amount: Money })[];
  total: Money;
  total_tax: Money;
}

export interface CourtUtilizationReport {
  range: DateRange;
  rows: {
    court_id: Uuid; court_name: string; booked_hours: number; available_hours: number;
    utilization_percent: Percent; revenue: Money; cancellations_count: number;
  }[];
}

export interface MembershipReport {
  range: DateRange;
  active_by_type: AmountByKey[]; // amount unused (0.00); count = members
  new_members: number;
  renewals: number;
  membership_revenue: Money;
  expiring: MemberSummary[];
}

export interface ShopReport {
  range: DateRange;
  sales_amount: Money;
  orders_count: number;
  by_channel: AmountByKey[];
  top_products: { product_id: Uuid; name: string; quantity: number; amount: Money }[];
  low_stock: InventoryItem[];
}

export interface FinanceReport {
  range: DateRange;
  revenue_total: Money;
  refunds_total: Money;
  by_category: AmountByKey[];
  by_method: AmountByKey[];
  invoices: { outstanding_amount: Money; outstanding_count: number; overdue_amount: Money; overdue_count: number };
  payroll: { paid_amount: Money; pending_amount: Money };
  tax_collected: Money;
}

export interface TaxReport {
  range: DateRange;
  rows: { revenue_category: E.RevenueCategory; gross_amount: Money; taxable_amount: Money; tax_rate: Percent; tax_amount: Money }[];
  total_tax: Money;
}

// ------------------------------------------------------------------ small utility results
export interface CountResult {
  count: number;
}

export interface ExpiryRunResult {
  promoted_count: number; // UPCOMING -> ACTIVE
  expired_count: number; // ACTIVE -> EXPIRED
  notified_count: number; // expiry-warning / expired notifications created
}
