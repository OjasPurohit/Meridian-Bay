/**
 * Preview mode only. The database derives status / totals / payment state in SQL views (ADR-015, ADR-016); the API
 * returns those derived values. When there is no backend, this file computes the same values from the plain
 * mock-data rows so the dashboards can still render. Mirrors database/migrations/0004 (court_booking_totals,
 * shop_order_totals, bar_order_totals, invoice_totals, payment_ledger, membership_terms, payment_state()).
 */
import type { BookingStatus, InvoicePaymentState, MembershipStatus, PaymentStatus, PaymentTxnStatus, RevenueCategory } from '@shared/constants/enums';
import type { BarOrder, BarOrderItem, BusinessClient, CourtBooking, Invoice, InvoiceItem, Membership, Payment, ShopOrder, ShopOrderItem } from '@shared/types/rows';

import barOrderItemsJson from '@mock/bar-order-items.json';
import barOrdersJson from '@mock/bar-orders.json';
import businessClientsJson from '@mock/business-clients.json';
import bookingsJson from '@mock/court-bookings.json';
import invoiceItemsJson from '@mock/invoice-items.json';
import invoicesJson from '@mock/invoices.json';
import membershipsJson from '@mock/memberships.json';
import paymentsJson from '@mock/payments.json';
import shopOrderItemsJson from '@mock/shop-order-items.json';
import shopOrdersJson from '@mock/shop-orders.json';
import { DEMO_NOW, DEMO_TODAY } from './types';

const as = <T,>(v: unknown) => v as T;
const n = (s: string) => parseFloat(s);
const money = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

export type BookingRow = CourtBooking & { status: BookingStatus; amount_due: string; amount_paid: string; payment_status: PaymentStatus };
export type ShopOrderRow = ShopOrder & { subtotal: string; total_amount: string; amount_paid: string; payment_status: PaymentStatus; items: ShopOrderItem[] };
export type BarOrderRow = BarOrder & { subtotal: string; total_amount: string; amount_paid: string; payment_status: PaymentStatus; items: BarOrderItem[] };
export type PaymentRow = Payment & { revenue_category: RevenueCategory; status: PaymentTxnStatus };
export type InvoiceRow = Invoice & {
  invoice_type: 'BUSINESS' | 'MEMBERSHIP';
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  payment_state: InvoicePaymentState | null;
  items: InvoiceItem[];
};
export type MembershipRow = Membership & { status: MembershipStatus };

export function paymentState(due: number, gross: number, net: number): PaymentStatus {
  if (due === 0) return 'NOT_REQUIRED';
  if (gross === 0) return 'PENDING';
  if (net <= 0) return 'REFUNDED';
  if (net < due) return 'PARTIALLY_PAID';
  return 'PAID';
}

export function mockRows() {
  const payments = as<Payment[]>(paymentsJson);
  const bySource = (type: Payment['source_type'], id: string) => {
    const ps = payments.filter((p) => p.source_type === type && p.source_id === id);
    return { gross: ps.reduce((a, p) => a + n(p.amount), 0), net: ps.reduce((a, p) => a + n(p.amount) - n(p.refunded_amount), 0) };
  };

  const bookings: BookingRow[] = as<CourtBooking[]>(bookingsJson).map((b) => {
    const due = n(b.list_price) - n(b.discount_amount);
    const p = bySource('COURT_BOOKING', b.id);
    const status: BookingStatus = b.cancelled_at ? 'CANCELLED' : Date.parse(b.end_at) <= Date.parse(DEMO_NOW) ? 'COMPLETED' : 'CONFIRMED';
    return { ...b, status, amount_due: money(due), amount_paid: money(p.net), payment_status: paymentState(b.cancelled_at && p.gross === 0 ? 0 : due, p.gross, p.net) };
  });

  const shopItems = as<ShopOrderItem[]>(shopOrderItemsJson);
  const shopOrders: ShopOrderRow[] = as<ShopOrder[]>(shopOrdersJson).map((o) => {
    const items = shopItems.filter((i) => i.shop_order_id === o.id);
    const sub = items.reduce((a, i) => a + n(i.unit_price) * i.quantity, 0);
    const total = sub - n(o.discount_amount) + n(o.delivery_fee);
    const p = bySource('SHOP_ORDER', o.id);
    return { ...o, items, subtotal: money(sub), total_amount: money(total), amount_paid: money(p.net), payment_status: paymentState(o.status === 'CANCELLED' && p.gross === 0 ? 0 : total, p.gross, p.net) };
  });

  const barItems = as<BarOrderItem[]>(barOrderItemsJson);
  const barOrders: BarOrderRow[] = as<BarOrder[]>(barOrdersJson).map((o) => {
    const items = barItems.filter((i) => i.bar_order_id === o.id);
    const sub = items.reduce((a, i) => a + n(i.unit_price) * i.quantity, 0);
    const total = sub - n(o.discount_amount);
    const p = bySource('BAR_ORDER', o.id);
    return { ...o, items, subtotal: money(sub), total_amount: money(total), amount_paid: money(p.net), payment_status: paymentState(o.status === 'CANCELLED' && p.gross === 0 ? 0 : total, p.gross, p.net) };
  });

  const clients = as<BusinessClient[]>(businessClientsJson);
  const invoiceItems = as<InvoiceItem[]>(invoiceItemsJson);
  const invoices: InvoiceRow[] = as<Invoice[]>(invoicesJson).map((i) => {
    const items = invoiceItems.filter((x) => x.invoice_id === i.id);
    const sub = items.reduce((a, x) => a + n(x.unit_price) * x.quantity, 0);
    const tax = Math.round(sub * n(i.tax_rate)) / 100;
    const total = sub + tax;
    const paid = bySource('INVOICE', i.id).net;
    const payment_state: InvoicePaymentState | null =
      i.status !== 'SENT' ? null : paid >= total ? 'PAID' : i.due_date < DEMO_TODAY ? 'OVERDUE' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
    return { ...i, invoice_type: i.business_client_id ? 'BUSINESS' : 'MEMBERSHIP', items, subtotal: money(sub), tax_amount: money(tax), total_amount: money(total), amount_paid: money(paid), payment_state };
  });
  void clients;

  const payRows: PaymentRow[] = payments.map((p) => {
    let category: RevenueCategory;
    switch (p.source_type) {
      case 'COURT_BOOKING': category = 'COURT'; break;
      case 'MEMBERSHIP': category = 'MEMBERSHIP'; break;
      case 'SHOP_ORDER': category = 'SHOP'; break;
      case 'BAR_ORDER': category = 'BAR'; break;
      default: category = invoices.find((i) => i.id === p.source_id)?.business_client_id ? 'BUSINESS' : 'MEMBERSHIP';
    }
    const status: PaymentTxnStatus = n(p.refunded_amount) === 0 ? 'SUCCEEDED' : n(p.refunded_amount) >= n(p.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    return { ...p, revenue_category: category, status };
  });

  const memberships: MembershipRow[] = as<Membership[]>(membershipsJson).map((m) => ({
    ...m,
    status: m.cancelled_at ? 'CANCELLED' : m.end_date < DEMO_TODAY ? 'EXPIRED' : m.start_date > DEMO_TODAY ? 'UPCOMING' : 'ACTIVE',
  }));

  return { bookings, shopOrders, barOrders, invoices, payments: payRows, memberships };
}
