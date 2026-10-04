import type { BookingStatus, MembershipType, MenuCategory, OrderFulfillment, OrderStatus, PaymentMethod, ProductCategory, ShopOrderStatus, SportType } from '@shared/constants/enums';

/**
 * Dashboard demo model. There is no backend yet, so the dashboards run on a small client-side store seeded from
 * mock-data/*.json (same records as the API contract). Amounts here are rupees as numbers for fast UI maths;
 * rounding goes through shared/lib/money.ts. Everything is fictional.
 */

/** The seed is generated relative to this instant (see mock-data/README.md): Sat 3 Oct 2026, 17:15 IST. */
export const DEMO_NOW = '2026-10-03T11:45:00.000Z';
export const DEMO_TODAY = '2026-10-03';

export interface DCourt {
  id: string;
  name: string;
  sport: SportType;
  rate: number;
  surface: string | null;
  description: string | null;
}

export interface DMember {
  id: string;
  user_id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  joined_on: string;
  type: MembershipType | null;
  plan_name: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'NONE';
  start_date: string | null;
  end_date: string | null;
  days_left: number | null;
  price_paid: number;
  court_pct: number;
  shop_pct: number;
  bar_pct: number;
  max_plays: number;
  /** users.is_active: a deactivated member cannot log in (history stays). */
  active: boolean;
  address: string | null;
  /** members.date_of_birth (YYYY-MM-DD), when the club has it. */
  dob?: string | null;
  synthetic: boolean;
}

export type BookingKind = 'REGULAR' | 'SOCIAL' | 'TRIAL' | 'MAINTENANCE';
export type PayState = 'PAID' | 'PENDING' | 'FREE' | 'REFUNDED';

export interface DBooking {
  id: string;
  number: string;
  court_id: string;
  start_at: string;
  end_at: string;
  kind: BookingKind;
  status: BookingStatus;
  member_id: string | null;
  name: string;
  phone: string | null;
  list_price: number;
  discount: number;
  amount_due: number;
  pay: PayState;
  method: PaymentMethod | null;
  title?: string;
  created_at: string;
}

export interface DProduct {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  brand: string | null;
  description: string | null;
  price: number;
  stock: number;
  threshold: number;
  active: boolean;
}

export interface OrderLine {
  id: string;
  name: string;
  qty: number;
  unit: number;
  notes?: string | null;
}

export interface DShopOrder {
  id: string;
  number: string;
  member_id: string | null;
  customer: string;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  fulfillment: OrderFulfillment;
  address: string | null;
  status: ShopOrderStatus;
  created_at: string;
  method: PaymentMethod | null;
}

export interface DMenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  description: string | null;
  price: number;
  available: boolean;
  stock: number;
  threshold: number;
}

export interface DKOrder {
  id: string;
  number: string;
  member_id: string | null;
  customer: string;
  source: 'MEMBER' | 'POS' | 'BAR';
  table: string | null;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  timeline: { status: OrderStatus; at: string }[];
  pay: 'PAID' | 'PENDING';
  method: PaymentMethod | null;
  notes?: string | null;
}

export type EventKind = 'TOURNAMENT' | 'SOCIAL' | 'CLINIC' | 'MIXER' | 'CAMP';

export interface DEvent {
  id: string;
  title: string;
  kind: EventKind;
  description: string;
  start_at: string;
  end_at: string;
  location: string;
  capacity: number;
  registered: string[];
  base_registered: number;
  fee: number;
  perks: string[];
}

export interface DPayment {
  id: string;
  number: string;
  category: 'COURT' | 'MEMBERSHIP' | 'SHOP' | 'BAR' | 'BUSINESS';
  amount: number;
  method: PaymentMethod;
  at: string;
  payer: string;
  status: 'SUCCEEDED' | 'REFUNDED' | 'PENDING';
  ref: string;
}

export interface DInvoice {
  id: string;
  number: string;
  type: 'BUSINESS' | 'MEMBERSHIP';
  client_id: string | null;
  client: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  items: { description: string; qty: number; unit: number; total: number }[];
  notes: string | null;
}

export interface DemoState {
  v: number;
  bookings: DBooking[];
  products: DProduct[];
  shopOrders: DShopOrder[];
  menu: DMenuItem[];
  kOrders: DKOrder[];
  events: DEvent[];
  payments: DPayment[];
  invoices: DInvoice[];
}

/** A job application as the owner sees it (the password hash never leaves the database). */
export interface DApplication {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  role: string | null;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  note: string | null;
}

/** An employee row: id is staff.id; `active` is users.is_active. */
export interface DStaff {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  designation: string;
  role: string;
  area: string;
  salary: number;
  phone: string;
  shift: string;
  payroll: 'PAID' | 'PENDING';
  on_duty: boolean;
  active: boolean;
}
