/**
 * Dashboard data. There is no backend yet, so every function reads mock-data/*.json (fictional seed records with
 * the API's shapes) and is shown in the UI as preview data. Each function returns only what its role may see;
 * the real API must enforce the same rules server-side (docs/security/PERMISSIONS_MATRIX.md).
 */
import type { BookingType, OrderStatus, ShopOrderStatus } from '@shared/constants/enums';
import type {
  BarOrder,
  BarOrderItem,
  BarTab,
  BarTable,
  BusinessClient,
  Court,
  CourtBooking,
  Invoice,
  InvoiceItem,
  Member,
  Membership,
  MembershipPlan,
  OrderStatusEvent,
  Payment,
  Product,
  ShopOrder,
  ShopOrderItem,
  SocialSession,
  SocialSessionParticipant,
  User,
} from '@shared/types/rows';

import barOrdersJson from '@mock/bar-orders.json';
import barOrderItemsJson from '@mock/bar-order-items.json';
import barTablesJson from '@mock/bar-tables.json';
import barTabsJson from '@mock/bar-tabs.json';
import businessClientsJson from '@mock/business-clients.json';
import courtsJson from '@mock/courts.json';
import bookingsJson from '@mock/court-bookings.json';
import invoicesJson from '@mock/invoices.json';
import invoiceItemsJson from '@mock/invoice-items.json';
import membersJson from '@mock/members.json';
import membershipsJson from '@mock/memberships.json';
import plansJson from '@mock/membership-plans.json';
import statusEventsJson from '@mock/order-status-events.json';
import paymentsJson from '@mock/payments.json';
import productsJson from '@mock/products.json';
import shopOrdersJson from '@mock/shop-orders.json';
import shopOrderItemsJson from '@mock/shop-order-items.json';
import sessionsJson from '@mock/social-sessions.json';
import participantsJson from '@mock/social-session-participants.json';
import usersJson from '@mock/users.json';

const as = <T,>(v: unknown) => v as T;
const barOrders = as<BarOrder[]>(barOrdersJson);
const barOrderItems = as<BarOrderItem[]>(barOrderItemsJson);
const barTables = as<BarTable[]>(barTablesJson);
const barTabs = as<BarTab[]>(barTabsJson);
const businessClients = as<BusinessClient[]>(businessClientsJson);
const courts = as<Court[]>(courtsJson);
const bookings = as<CourtBooking[]>(bookingsJson);
const invoices = as<Invoice[]>(invoicesJson);
const invoiceItems = as<InvoiceItem[]>(invoiceItemsJson);
const members = as<Member[]>(membersJson);
const memberships = as<Membership[]>(membershipsJson);
const plans = as<MembershipPlan[]>(plansJson);
const statusEvents = as<OrderStatusEvent[]>(statusEventsJson);
const payments = as<Payment[]>(paymentsJson);
const products = as<Product[]>(productsJson);
const shopOrders = as<ShopOrder[]>(shopOrdersJson);
const shopOrderItems = as<ShopOrderItem[]>(shopOrderItemsJson);
const sessions = as<SocialSession[]>(sessionsJson);
const participants = as<SocialSessionParticipant[]>(participantsJson);
const users = as<User[]>(usersJson);

const resolve = <T,>(v: T) => new Promise<T>((ok) => setTimeout(() => ok(v), 250));
const byNewest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at);

/** The seed data is generated relative to this instant; preview dashboards use it as "now". */
export const PREVIEW_NOW = new Date('2026-10-03T06:30:00.000Z');
/** Fictional seed identities used for the member and business-client previews. */
export const PREVIEW_MEMBER_ID = '02000000-0000-4000-8000-000000000001';
export const PREVIEW_BUSINESS_CLIENT_ID = businessClients.find((b) => b.user_id)?.id ?? businessClients[0].id;

const courtName = (id: string) => courts.find((c) => c.id === id)?.name ?? 'Court';
const tableLabel = (id: string | null) => (id ? (barTables.find((t) => t.id === id)?.label ?? null) : null);

// ---------------------------------------------------------------- member

export interface MemberBooking {
  id: string;
  booking_number: string;
  kind: 'COURT' | 'SOCIAL';
  title: string;
  court_name: string;
  start_at: string;
  end_at: string;
  status: CourtBooking['status'];
  amount_due: string | null;
}

export interface MemberKitchenOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  created_at: string;
  total_amount: string;
  discount_amount: string;
  items: { name: string; quantity: number }[];
  timeline: { status: OrderStatus; at: string }[];
}

export interface MemberShopOrderSummary {
  id: string;
  order_number: string;
  status: ShopOrderStatus;
  fulfillment: ShopOrder['fulfillment'];
  created_at: string;
  total_amount: string;
  item_count: number;
}

export interface MemberDashboard {
  first_name: string;
  member_code: string;
  membership: { plan: MembershipPlan; status: Membership['status']; start_date: string; end_date: string; days_left: number } | null;
  bookings: MemberBooking[];
  shop_orders: MemberShopOrderSummary[];
  kitchen_orders: MemberKitchenOrder[];
  events: { id: string; title: string; description: string | null; start_at: string; end_at: string; court_name: string; spots_left: number; capacity: number; joined: boolean }[];
}

export function getMemberDashboard(memberId: string): Promise<MemberDashboard | null> {
  const member = members.find((m) => m.id === memberId);
  if (!member) return resolve(null);
  const user = users.find((u) => u.id === member.user_id)!;

  const ms = memberships.filter((m) => m.member_id === memberId && m.status === 'ACTIVE')[0];
  const plan = ms ? plans.find((p) => p.id === ms.membership_plan_id)! : null;
  const daysLeft = ms ? Math.max(0, Math.ceil((new Date(`${ms.end_date}T23:59:59+05:30`).getTime() - PREVIEW_NOW.getTime()) / 86_400_000)) : 0;

  const own: MemberBooking[] = bookings
    .filter((b) => b.member_id === memberId)
    .map((b) => ({ id: b.id, booking_number: b.booking_number, kind: 'COURT', title: `${courtName(b.court_id)} booking`, court_name: courtName(b.court_id), start_at: b.start_at, end_at: b.end_at, status: b.status, amount_due: b.amount_due }));

  const social: MemberBooking[] = participants
    .filter((p) => p.member_id === memberId)
    .flatMap((p) => {
      const s = sessions.find((x) => x.id === p.social_session_id);
      const b = s && bookings.find((x) => x.id === s.court_booking_id);
      if (!s || !b) return [];
      const status: CourtBooking['status'] = p.status === 'CANCELLED' || s.status === 'CANCELLED' ? 'CANCELLED' : s.status === 'COMPLETED' ? 'COMPLETED' : 'CONFIRMED';
      return [{ id: p.id, booking_number: '', kind: 'SOCIAL' as const, title: s.title, court_name: courtName(b.court_id), start_at: b.start_at, end_at: b.end_at, status, amount_due: p.fee_amount }];
    });

  const shop = shopOrders
    .filter((o) => o.member_id === memberId)
    .sort(byNewest)
    .map((o) => ({ id: o.id, order_number: o.order_number, status: o.status, fulfillment: o.fulfillment, created_at: o.created_at, total_amount: o.total_amount, item_count: shopOrderItems.filter((i) => i.shop_order_id === o.id).reduce((n, i) => n + i.quantity, 0) }));

  const kitchen = barOrders
    .filter((o) => o.member_id === memberId)
    .sort(byNewest)
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      created_at: o.created_at,
      total_amount: o.total_amount,
      discount_amount: o.discount_amount,
      items: barOrderItems.filter((i) => i.bar_order_id === o.id).map((i) => ({ name: i.item_name, quantity: i.quantity })),
      timeline: statusEvents
        .filter((e) => e.bar_order_id === o.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((e) => ({ status: e.to_status, at: e.created_at })),
    }));

  const events = sessions
    .filter((s) => s.status === 'OPEN')
    .flatMap((s) => {
      const b = bookings.find((x) => x.id === s.court_booking_id);
      if (!b) return [];
      const joined = participants.filter((p) => p.social_session_id === s.id && p.status === 'JOINED');
      return [{ id: s.id, title: s.title, description: s.description, start_at: b.start_at, end_at: b.end_at, court_name: courtName(b.court_id), capacity: s.capacity, spots_left: Math.max(0, s.capacity - joined.length), joined: joined.some((p) => p.member_id === memberId) }];
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return resolve({
    first_name: user.full_name.split(' ')[0],
    member_code: member.member_code,
    membership: ms && plan ? { plan, status: ms.status, start_date: ms.start_date, end_date: ms.end_date, days_left: daysLeft } : null,
    bookings: [...own, ...social].sort((a, b) => a.start_at.localeCompare(b.start_at)),
    shop_orders: shop,
    kitchen_orders: kitchen,
    events,
  });
}

export interface MemberShopOrderDetail extends Omit<ShopOrder, 'member_id' | 'membership_id' | 'placed_by_user_id' | 'guest_name' | 'guest_phone'> {
  items: Pick<ShopOrderItem, 'id' | 'product_name' | 'unit_price' | 'quantity' | 'line_total'>[];
}

/** Ownership check: returns null unless the order belongs to this member. */
export function getMemberShopOrder(memberId: string, orderId: string): Promise<MemberShopOrderDetail | null> {
  const o = shopOrders.find((x) => x.id === orderId && x.member_id === memberId);
  if (!o) return resolve(null);
  const { member_id: _m, membership_id: _ms, placed_by_user_id: _p, guest_name: _g, guest_phone: _gp, ...rest } = o;
  return resolve({
    ...rest,
    items: shopOrderItems.filter((i) => i.shop_order_id === o.id).map(({ id, product_name, unit_price, quantity, line_total }) => ({ id, product_name, unit_price, quantity, line_total })),
  });
}

// ---------------------------------------------------------------- front desk

export type SlotKind = 'BOOKED' | 'SOCIAL' | 'TRIAL' | 'MAINTENANCE';

export interface CourtDay {
  date: string;
  courts: Pick<Court, 'id' | 'name' | 'sport_type' | 'walk_in_rate_per_hour'>[];
  /** Occupied intervals only — no member ids, guest names or prices. */
  occupied: { court_id: string; start_at: string; end_at: string; kind: SlotKind }[];
  open_tabs: { id: string; tab_number: string; table: string | null; opened_at: string; total_amount: string; payment_status: BarTab['payment_status'] }[];
}

const KIND: Record<BookingType, SlotKind> = { REGULAR: 'BOOKED', SOCIAL_SESSION: 'SOCIAL', TRIAL: 'TRIAL', MAINTENANCE: 'MAINTENANCE' };
const istDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function listBookingDates(): string[] {
  return [...new Set(bookings.map((b) => istDate(b.start_at)))].sort();
}

export function getCourtDay(date: string): Promise<CourtDay> {
  return resolve({
    date,
    courts: courts.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order).map(({ id, name, sport_type, walk_in_rate_per_hour }) => ({ id, name, sport_type, walk_in_rate_per_hour })),
    occupied: bookings.filter((b) => b.status !== 'CANCELLED' && istDate(b.start_at) === date).map((b) => ({ court_id: b.court_id, start_at: b.start_at, end_at: b.end_at, kind: KIND[b.booking_type] })),
    open_tabs: barTabs.filter((t) => t.status === 'OPEN').map((t) => ({ id: t.id, tab_number: t.tab_number, table: tableLabel(t.bar_table_id), opened_at: t.opened_at, total_amount: t.total_amount, payment_status: t.payment_status })),
  });
}

// ---------------------------------------------------------------- kitchen

export interface KitchenTicket {
  id: string;
  order_number: string;
  status: OrderStatus;
  created_at: string;
  table: string | null;
  tab_number: string | null;
  customer: 'Member' | 'Guest';
  notes: string | null;
  items: { name: string; quantity: number; notes: string | null }[];
}

/** FR-KIT-004: no prices, totals or payment data reach the kitchen. */
export function getKitchenTickets(): Promise<KitchenTicket[]> {
  return resolve(
    [...barOrders].sort(byNewest).map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      created_at: o.created_at,
      table: tableLabel(o.bar_table_id),
      tab_number: o.bar_tab_id ? (barTabs.find((t) => t.id === o.bar_tab_id)?.tab_number ?? null) : null,
      customer: o.member_id ? 'Member' : 'Guest',
      notes: o.notes,
      items: barOrderItems.filter((i) => i.bar_order_id === o.id).map((i) => ({ name: i.item_name, quantity: i.quantity, notes: i.notes })),
    })),
  );
}

// ---------------------------------------------------------------- business client

export interface BusinessDashboard {
  company_name: string;
  contact_name: string;
  invoices: (Invoice & { items: InvoiceItem[]; outstanding: string })[];
  payments: Pick<Payment, 'id' | 'payment_number' | 'amount' | 'method' | 'status' | 'paid_at' | 'source_id'>[];
}

export function getBusinessDashboard(clientId: string): Promise<BusinessDashboard | null> {
  const c = businessClients.find((b) => b.id === clientId);
  if (!c) return resolve(null);
  const own = invoices.filter((i) => i.business_client_id === clientId && i.status !== 'DRAFT').sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  return resolve({
    company_name: c.company_name,
    contact_name: c.contact_name,
    invoices: own.map((i) => ({ ...i, items: invoiceItems.filter((x) => x.invoice_id === i.id), outstanding: Math.max(0, parseFloat(i.total_amount) - parseFloat(i.amount_paid)).toFixed(2) })),
    payments: payments
      .filter((p) => p.business_client_id === clientId)
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
      .map(({ id, payment_number, amount, method, status, paid_at, source_id }) => ({ id, payment_number, amount, method, status, paid_at, source_id })),
  });
}

// ---------------------------------------------------------------- owner / admin

export interface OwnerOverview {
  members_total: number;
  active_by_plan: { plan: string; count: number }[];
  members_without_plan: number;
  expiring_30d: number;
  low_stock: Pick<Product, 'id' | 'name' | 'stock_quantity' | 'low_stock_threshold'>[];
  products_total: number;
  shop_orders_by_status: { status: ShopOrderStatus; count: number }[];
  kitchen_open: number;
  kitchen_by_status: { status: OrderStatus; count: number }[];
  invoices_outstanding: string;
  invoices_overdue: number;
  revenue_month: { category: Payment['revenue_category']; amount: string }[];
}

const countBy = <K extends string>(keys: K[]) => {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

/** Aggregates only — no member names, contacts or other personal records. */
export function getOwnerOverview(): Promise<OwnerOverview> {
  const active = memberships.filter((m) => m.status === 'ACTIVE');
  const soon = new Date(PREVIEW_NOW.getTime() + 30 * 86_400_000);
  const monthStart = `${istDate(PREVIEW_NOW.toISOString()).slice(0, 7)}-01`;
  const rev = new Map<Payment['revenue_category'], number>();
  for (const p of payments) {
    if (p.status !== 'SUCCEEDED' && p.status !== 'PARTIALLY_REFUNDED') continue;
    if (istDate(p.paid_at) < monthStart) continue;
    rev.set(p.revenue_category, (rev.get(p.revenue_category) ?? 0) + parseFloat(p.amount) - parseFloat(p.refunded_amount));
  }
  const live = invoices.filter((i) => !['DRAFT', 'VOID', 'PAID'].includes(i.status));
  return resolve({
    members_total: members.length,
    active_by_plan: plans.map((p) => ({ plan: p.name.replace(/ Membership$/, ''), count: active.filter((m) => m.membership_plan_id === p.id).length })),
    members_without_plan: members.filter((m) => !active.some((a) => a.member_id === m.id)).length,
    expiring_30d: active.filter((m) => new Date(m.end_date) <= soon).length,
    low_stock: products.filter((p) => p.is_active && p.stock_quantity <= p.low_stock_threshold).map(({ id, name, stock_quantity, low_stock_threshold }) => ({ id, name, stock_quantity, low_stock_threshold })),
    products_total: products.filter((p) => p.is_active).length,
    shop_orders_by_status: [...countBy(shopOrders.map((o) => o.status))].map(([status, count]) => ({ status, count })),
    kitchen_open: barOrders.filter((o) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length,
    kitchen_by_status: [...countBy(barOrders.map((o) => o.status))].map(([status, count]) => ({ status, count })),
    invoices_outstanding: live.reduce((n, i) => n + parseFloat(i.total_amount) - parseFloat(i.amount_paid), 0).toFixed(2),
    invoices_overdue: invoices.filter((i) => i.status === 'OVERDUE').length,
    revenue_month: [...rev].map(([category, amount]) => ({ category, amount: amount.toFixed(2) })),
  });
}
