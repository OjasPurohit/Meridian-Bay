import type { BarMenuItem, BusinessClient, Product } from '@shared/types/rows';

import barMenuJson from '@mock/bar-menu-items.json';
import businessClientsJson from '@mock/business-clients.json';
import productsJson from '@mock/products.json';
import { mockRows, type BarOrderRow, type BookingRow, type InvoiceRow, type PaymentRow, type ShopOrderRow } from './derive';
import { ALL_MEMBERS, rng } from './staticData';
import type { DBooking, DInvoice, DKOrder, DMenuItem, DPayment, DProduct, DShopOrder } from './types';

const as = <T,>(v: unknown) => v as T;

/** Everything the dashboards read, in the API's shapes (derived values included). Preview = mock-data, live = the API. */
export interface Source {
  bookings: BookingRow[];
  products: Product[];
  shopOrders: ShopOrderRow[];
  menu: BarMenuItem[];
  barOrders: BarOrderRow[];
  payments: PaymentRow[];
  invoices: InvoiceRow[];
}

export function mockSource(): Source {
  const r = mockRows();
  return { bookings: r.bookings, products: as<Product[]>(productsJson), shopOrders: r.shopOrders, menu: as<BarMenuItem[]>(barMenuJson), barOrders: r.barOrders, payments: r.payments, invoices: r.invoices };
}

/** Business clients (companies the club invoices) known to the UI: names on invoices and payments. Live mode refills this array in place. */
export const clientRegistry: BusinessClient[] = as<BusinessClient[]>(businessClientsJson);
export const clientName = (id: string | null) => clientRegistry.find((c) => c.id === id)?.company_name ?? 'Business client';

const num = (s: string) => parseFloat(s);
const nameOfMember = (memberId: string | null) => ALL_MEMBERS.find((x) => x.id === memberId)?.name ?? 'Member';
const payOf = (src: Source, sourceId: string) => src.payments.find((p) => p.source_id === sourceId);

const SOCIAL = /^Social play:/;

export function seedBookings(src: Source): DBooking[] {
  return src.bookings.map((b) => {
    const pay = payOf(src, b.id);
    const m = ALL_MEMBERS.find((x) => x.id === b.member_id);
    const maintenance = b.booking_type === 'MAINTENANCE';
    const social = !b.member_id && !!b.guest_name && SOCIAL.test(b.guest_name);
    const trial = b.booking_type === 'TRIAL' || (!b.member_id && !social && !maintenance && num(b.list_price) > 0 && num(b.list_price) === num(b.discount_amount));
    return {
      id: b.id,
      number: b.booking_number,
      court_id: b.court_id,
      start_at: b.start_at,
      end_at: b.end_at,
      kind: maintenance ? 'MAINTENANCE' : social ? 'SOCIAL' : trial ? 'TRIAL' : 'REGULAR',
      status: b.status,
      member_id: b.member_id,
      name: maintenance ? 'Maintenance' : m ? m.name : (b.guest_name ?? 'Guest'),
      phone: m ? m.phone : b.guest_phone,
      list_price: num(b.list_price),
      discount: num(b.discount_amount),
      amount_due: num(b.amount_due),
      pay: b.payment_status === 'NOT_REQUIRED' ? 'FREE' : b.payment_status === 'REFUNDED' ? 'REFUNDED' : b.payment_status === 'PAID' ? 'PAID' : 'PENDING',
      method: pay?.method ?? null,
      title: social ? b.guest_name!.replace(SOCIAL, '').trim() : undefined,
      created_at: b.created_at,
    };
  });
}

export function seedProducts(src: Source): DProduct[] {
  return src.products.filter((p) => p.is_active).map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, description: p.description, price: num(p.price), stock: p.stock_quantity, threshold: p.low_stock_threshold, active: true }));
}

export function seedShopOrders(src: Source): DShopOrder[] {
  return src.shopOrders.map((o) => ({
    id: o.id,
    number: o.order_number,
    member_id: o.member_id,
    customer: o.member_id ? nameOfMember(o.member_id) : (o.guest_name ?? 'Guest'),
    lines: o.items.map((i) => ({ id: i.product_id, name: i.product_name, qty: i.quantity, unit: num(i.unit_price) })),
    subtotal: num(o.subtotal),
    discount: num(o.discount_amount),
    delivery_fee: num(o.delivery_fee),
    total: num(o.total_amount),
    fulfillment: o.fulfillment,
    address: o.delivery_address,
    status: o.status,
    created_at: o.created_at,
    method: payOf(src, o.id)?.method ?? null,
  }));
}

export function seedMenu(src: Source): DMenuItem[] {
  const r = rng(4242);
  return src.menu.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    description: m.description,
    price: num(m.price),
    available: m.is_available,
    stock: m.is_available ? (m.name.startsWith('Chicken') ? 7 : 24 + Math.floor(r() * 60)) : 0,
    threshold: 10,
  }));
}

export function seedKitchenOrders(src: Source): DKOrder[] {
  return src.barOrders
    .map((o) => {
      const pay = payOf(src, o.id);
      return {
        id: o.id,
        number: o.order_number,
        member_id: o.member_id,
        customer: o.member_id ? nameOfMember(o.member_id) : (o.guest_name ?? 'Guest'),
        source: 'BAR' as const,
        table: o.table_label,
        lines: o.items.map((i) => ({ id: i.bar_menu_item_id, name: i.item_name, qty: i.quantity, unit: num(i.unit_price), notes: i.notes })),
        subtotal: num(o.subtotal),
        discount: num(o.discount_amount),
        total: num(o.total_amount),
        status: o.status,
        created_at: o.created_at,
        timeline: o.status === 'NEW' ? [{ status: 'NEW' as const, at: o.created_at }] : [{ status: 'NEW' as const, at: o.created_at }, { status: o.status, at: o.updated_at }],
        pay: o.payment_status === 'PAID' ? ('PAID' as const) : ('PENDING' as const),
        method: pay?.method ?? null,
        notes: o.notes,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function seedPayments(src: Source): DPayment[] {
  return src.payments
    .map((p) => {
      const m = ALL_MEMBERS.find((x) => x.id === p.member_id);
      return {
        id: p.id,
        number: p.payment_number,
        category: p.revenue_category,
        amount: num(p.amount) - num(p.refunded_amount),
        method: p.method,
        at: p.paid_at,
        payer: p.business_client_id ? clientName(p.business_client_id) : (m?.name ?? p.payer_name ?? 'Guest'),
        status: p.status === 'REFUNDED' ? ('REFUNDED' as const) : ('SUCCEEDED' as const),
        ref: p.payment_number,
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** UI-level invoice status: the stored lifecycle plus the derived payment state. */
function displayInvoiceStatus(i: InvoiceRow): DInvoice['status'] {
  if (i.status !== 'SENT') return i.status;
  return i.payment_state === 'UNPAID' || i.payment_state === null ? 'SENT' : i.payment_state;
}

export function seedInvoices(src: Source): DInvoice[] {
  return src.invoices
    .map((i) => ({
      id: i.id,
      number: i.invoice_number,
      type: i.invoice_type,
      client_id: i.business_client_id,
      client: i.business_client_id ? clientName(i.business_client_id) : nameOfMember(i.member_id),
      status: displayInvoiceStatus(i),
      issue_date: i.issue_date,
      due_date: i.due_date,
      subtotal: num(i.subtotal),
      tax: num(i.tax_amount),
      total: num(i.total_amount),
      paid: num(i.amount_paid),
      items: i.items.map((x) => ({ description: x.description, qty: x.quantity, unit: num(x.unit_price), total: num(x.unit_price) * x.quantity })),
      notes: i.notes,
    }))
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));
}
