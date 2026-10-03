import { useSyncExternalStore } from 'react';
import type { ErrorCode } from '@shared/constants/errors';
import type { OrderStatus, PaymentMethod, ShopOrderStatus } from '@shared/constants/enums';
import { SLOT_INTERVAL_MINUTES, SESSION_DURATION_MINUTES } from '@shared/constants/rules';
import { applyDiscount, fromPaise, percentOf, toPaise } from '@shared/lib/money';
import { istDate, slotStarts } from '@shared/lib/time';

import { seedState, STATE_VERSION } from './seed';
import { ALL_MEMBERS, courts, memberById } from './staticData';
import { DEMO_NOW, DEMO_TODAY, type BizProduct, type BizTx, type DBooking, type DCourt, type DemoState, type DEvent, type DInvoice, type DKOrder, type DMember, type DMenuItem, type DPayment, type DProduct, type DShopOrder, type Dealer, type OrderLine } from './types';

/* ------------------------------------------------------------------ store plumbing */
const KEY = 'mb.demo.state';
let state: DemoState = load();
const listeners = new Set<() => void>();

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as DemoState;
      if (s.v === STATE_VERSION) return s;
    }
  } catch {
    /* private mode / corrupt → reseed */
  }
  return seedState();
}

function commit(next: DemoState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  // Another tab (e.g. the kitchen screen) changed the demo data → follow it.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue) as DemoState;
        listeners.forEach((l) => l());
      } catch {
        /* ignore */
      }
    }
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useDemo = () => useSyncExternalStore(subscribe, () => state, () => state);
export const getDemo = () => state;

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`);
const money = (n: number) => Math.round(n * 100) / 100;
const nextNo = (prefix: string, existing: string[], width: number) => {
  const max = existing.reduce((m, x) => Math.max(m, parseInt(x.replace(/\D/g, ''), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
};

/* ------------------------------------------------------------------ pure business helpers (mirror docs/business-rules) */
export const courtById = (id: string): DCourt | undefined => courts.find((c) => c.id === id);
const MS_SESSION = SESSION_DURATION_MINUTES * 60_000;

export const liveBooking = (b: DBooking) => b.status !== 'CANCELLED';
export const dayOf = (iso: string) => istDate(iso);

/** R-COURT-05: member discount only while the membership is effective; otherwise walk-in rate. */
export function courtPrice(court: DCourt, member: DMember | null | undefined) {
  const pct = member && member.status === 'ACTIVE' ? member.court_pct : 0;
  const r = applyDiscount(toPaise(court.rate), pct);
  return { list: court.rate, pct, discount: Number(fromPaise(r.discount)), due: Number(fromPaise(r.due)) };
}

export function memberDiscount(member: DMember | null | undefined, area: 'court' | 'shop' | 'bar') {
  if (!member || member.status !== 'ACTIVE') return 0;
  return area === 'court' ? member.court_pct : area === 'shop' ? member.shop_pct : member.bar_pct;
}

/** R-COURT-04: plays used by a member on an IST date. */
export function playsUsed(s: DemoState, memberId: string, date: string) {
  const regular = s.bookings.filter((b) => b.member_id === memberId && b.kind === 'REGULAR' && liveBooking(b) && dayOf(b.start_at) === date).length;
  const social = s.events.filter((e) => e.kind === 'SOCIAL' && e.registered.includes(memberId) && dayOf(e.start_at) === date).length;
  return regular + social;
}

export function overlapping(s: DemoState, courtId: string, startIso: string, ignoreId?: string) {
  const a = Date.parse(startIso);
  const b = a + MS_SESSION;
  return s.bookings.find((x) => x.id !== ignoreId && x.court_id === courtId && liveBooking(x) && Date.parse(x.start_at) < b && Date.parse(x.end_at) > a);
}

export type SlotState = 'AVAILABLE' | 'PAST' | 'TAKEN' | 'CLOSED';
export function slotState(s: DemoState, courtId: string, startIso: string): SlotState {
  const start = Date.parse(startIso);
  if (start <= Date.parse(DEMO_NOW)) return 'PAST';
  const hhmm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(startIso));
  if (hhmm > '21:00') return 'CLOSED';
  return overlapping(s, courtId, startIso) ? 'TAKEN' : 'AVAILABLE';
}

/** Every bookable start (06:00–21:00, every 30 min) for a date. */
export const startsFor = (date: string) => slotStarts(date, '06:00', '22:00', SLOT_INTERVAL_MINUTES, SESSION_DURATION_MINUTES);
/** Half-hour grid columns for display (06:00–21:30). */
export const gridStarts = (date: string) => slotStarts(date, '06:00', '22:00', SLOT_INTERVAL_MINUTES, SLOT_INTERVAL_MINUTES);

export function nextFreeSlot(s: DemoState, date: string, sport?: string) {
  for (const startIso of startsFor(date)) {
    for (const c of courts) {
      if (sport && sport !== 'ALL' && c.sport !== sport) continue;
      if (slotState(s, c.id, startIso) === 'AVAILABLE') return { court: c, start_at: startIso };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ actions */
export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode | 'INVALID_INPUT'; message: string };
const fail = (code: ErrorCode | 'INVALID_INPUT', message: string): { ok: false; code: ErrorCode | 'INVALID_INPUT'; message: string } => ({ ok: false, code, message });

function addPayment(s: DemoState, p: Omit<DPayment, 'id' | 'number' | 'status'> & { status?: DPayment['status'] }): DemoState {
  const payment: DPayment = { id: uid(), number: nextNo('PAY-', s.payments.map((x) => x.number), 7), status: 'SUCCEEDED', ...p };
  return { ...s, payments: [payment, ...s.payments] };
}

export interface BookInput {
  court_id: string;
  start_at: string;
  member_id?: string | null;
  name?: string;
  phone?: string;
  method?: PaymentMethod | null;
}

function bookCourt(input: BookInput): Result<DBooking> {
  const s = state;
  const court = courtById(input.court_id);
  if (!court) return fail('COURT_NOT_FOUND', 'Court not found.');
  if (slotState(s, court.id, input.start_at) === 'PAST' || slotState(s, court.id, input.start_at) === 'CLOSED') return fail('INVALID_SLOT', 'That start time is not bookable.');
  if (overlapping(s, court.id, input.start_at)) return fail('BOOKING_CONFLICT', 'This court is already booked for that time.');
  const member = input.member_id ? memberById(input.member_id) : undefined;
  if (input.member_id && !member) return fail('MEMBER_NOT_FOUND', 'Member not found.');
  if (!member && !input.name?.trim()) return fail('VALIDATION_ERROR', 'Enter the guest’s name.');
  if (member) {
    const date = dayOf(input.start_at);
    const used = playsUsed(s, member.id, date);
    if (used >= member.max_plays) return fail('DAILY_BOOKING_LIMIT', `${member.name.split(' ')[0]} has already used ${used} of ${member.max_plays} plays on this day.`);
  }
  const price = courtPrice(court, member);
  const free = price.due === 0;
  const paidNow = !free && !!input.method;
  const created = new Date().toISOString();
  const booking: DBooking = {
    id: uid(),
    number: nextNo('BK-', s.bookings.map((b) => b.number), 6),
    court_id: court.id,
    start_at: input.start_at,
    end_at: new Date(Date.parse(input.start_at) + MS_SESSION).toISOString(),
    kind: 'REGULAR',
    status: 'CONFIRMED',
    member_id: member?.id ?? null,
    name: member?.name ?? input.name!.trim(),
    phone: member?.phone ?? input.phone?.trim() ?? null,
    list_price: price.list,
    discount: price.discount,
    amount_due: price.due,
    pay: free ? 'FREE' : paidNow ? 'PAID' : 'PENDING',
    method: paidNow ? input.method! : null,
    created_at: created,
  };
  let next: DemoState = { ...s, bookings: [...s.bookings, booking] };
  if (paidNow) next = addPayment(next, { category: 'COURT', amount: price.due, method: input.method!, at: created, payer: booking.name, ref: booking.number });
  commit(next);
  return { ok: true, value: booking };
}

function cancelBooking(id: string): Result<DBooking> {
  const b = state.bookings.find((x) => x.id === id);
  if (!b) return fail('BOOKING_NOT_FOUND', 'Booking not found.');
  if (b.status === 'CANCELLED' || b.status === 'COMPLETED') return fail('BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled.');
  const refunded = b.pay === 'PAID';
  const next: DBooking = { ...b, status: 'CANCELLED', pay: refunded ? 'REFUNDED' : b.pay };
  let s: DemoState = { ...state, bookings: state.bookings.map((x) => (x.id === id ? next : x)) };
  if (refunded) s = { ...s, payments: s.payments.map((p) => (p.ref === b.number ? { ...p, status: 'REFUNDED' as const } : p)) };
  commit(s);
  return { ok: true, value: next };
}

function patchBooking(id: string, patch: Partial<DBooking>) {
  commit({ ...state, bookings: state.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
}

function markBookingPaid(id: string, method: PaymentMethod) {
  const b = state.bookings.find((x) => x.id === id);
  if (!b || b.pay !== 'PENDING') return;
  let s: DemoState = { ...state, bookings: state.bookings.map((x) => (x.id === id ? { ...x, pay: 'PAID' as const, method } : x)) };
  s = addPayment(s, { category: 'COURT', amount: b.amount_due, method, at: new Date().toISOString(), payer: b.name, ref: b.number });
  commit(s);
}

/* ---- store / shop */
export interface ShopInput {
  member_id: string | null;
  customer: string;
  lines: { product_id: string; qty: number }[];
  fulfillment: DShopOrder['fulfillment'];
  address?: string;
  method: PaymentMethod;
}

function placeShopOrder(input: ShopInput): Result<DShopOrder> {
  const s = state;
  const member = input.member_id ? memberById(input.member_id) : undefined;
  const lines: OrderLine[] = [];
  for (const l of input.lines) {
    const p = s.products.find((x) => x.id === l.product_id);
    if (!p || !p.active) return fail('PRODUCT_NOT_FOUND', 'Product not found.');
    if (l.qty > p.stock) return fail('OUT_OF_STOCK', p.stock === 0 ? `${p.name} is out of stock.` : `Only ${p.stock} of ${p.name} left.`);
    lines.push({ id: p.id, name: p.name, qty: l.qty, unit: p.price });
  }
  if (!lines.length) return fail('VALIDATION_ERROR', 'Add at least one item.');
  if (input.fulfillment === 'DELIVERY' && !input.address?.trim()) return fail('DELIVERY_ADDRESS_REQUIRED', 'Delivery address is required for delivery orders.');
  const subtotalP = lines.reduce((a, l) => a + toPaise(l.unit) * l.qty, 0);
  const discountP = percentOf(subtotalP, memberDiscount(member, 'shop'));
  const afterP = subtotalP - discountP;
  const fee = input.fulfillment === 'DELIVERY' && afterP < toPaise(2000) ? 50 : 0;
  const order: DShopOrder = {
    id: uid(),
    number: nextNo('SO-', s.shopOrders.map((o) => o.number), 6),
    member_id: member?.id ?? null,
    customer: member?.name ?? input.customer,
    lines,
    subtotal: Number(fromPaise(subtotalP)),
    discount: Number(fromPaise(discountP)),
    delivery_fee: fee,
    total: Number(fromPaise(afterP)) + fee,
    fulfillment: input.fulfillment,
    address: input.fulfillment === 'DELIVERY' ? input.address!.trim() : null,
    status: input.fulfillment === 'IN_STORE' ? 'COMPLETED' : 'PLACED',
    created_at: new Date().toISOString(),
    method: input.method,
  };
  let next: DemoState = {
    ...s,
    shopOrders: [order, ...s.shopOrders],
    products: s.products.map((p) => {
      const l = lines.find((x) => x.id === p.id);
      return l ? { ...p, stock: p.stock - l.qty } : p;
    }),
  };
  next = addPayment(next, { category: 'SHOP', amount: order.total, method: input.method, at: order.created_at, payer: order.customer, ref: order.number });
  commit(next);
  return { ok: true, value: order };
}

function setShopStatus(id: string, status: ShopOrderStatus) {
  commit({ ...state, shopOrders: state.shopOrders.map((o) => (o.id === id ? { ...o, status } : o)) });
}

function cancelShopOrder(id: string) {
  const o = state.shopOrders.find((x) => x.id === id);
  if (!o || o.status === 'CANCELLED' || o.status === 'COMPLETED') return;
  commit({
    ...state,
    shopOrders: state.shopOrders.map((x) => (x.id === id ? { ...x, status: 'CANCELLED' as const } : x)),
    products: state.products.map((p) => {
      const l = o.lines.find((x) => x.id === p.id);
      return l ? { ...p, stock: p.stock + l.qty } : p;
    }),
  });
}

function saveProduct(p: Partial<DProduct> & { name: string; price: number }) {
  const existing = p.id ? state.products.find((x) => x.id === p.id) : undefined;
  if (existing) commit({ ...state, products: state.products.map((x) => (x.id === existing.id ? { ...x, ...p } : x)) });
  else
    commit({
      ...state,
      products: [{ id: uid(), sku: p.sku ?? `NEW-${Math.floor(Math.random() * 9000 + 1000)}`, category: p.category ?? 'ACCESSORY', brand: p.brand ?? null, description: p.description ?? null, stock: p.stock ?? 0, threshold: p.threshold ?? 5, active: true, name: p.name, price: p.price }, ...state.products],
    });
}
const removeProduct = (id: string) => commit({ ...state, products: state.products.filter((p) => p.id !== id) });
const adjustProductStock = (id: string, delta: number) => commit({ ...state, products: state.products.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)) });

/* ---- kitchen */
export interface KitchenInput {
  member_id: string | null;
  customer: string;
  lines: { menu_id: string; qty: number; notes?: string }[];
  source: DKOrder['source'];
  table?: string | null;
  method: PaymentMethod | null;
  payNow: boolean;
}

function placeKitchenOrder(input: KitchenInput): Result<DKOrder> {
  const s = state;
  const member = input.member_id ? memberById(input.member_id) : undefined;
  const lines: OrderLine[] = [];
  for (const l of input.lines) {
    const m = s.menu.find((x) => x.id === l.menu_id);
    if (!m || !m.available) return fail('MENU_ITEM_UNAVAILABLE', 'That item is currently unavailable.');
    if (l.qty > m.stock) return fail('OUT_OF_STOCK', `Only ${m.stock} of ${m.name} left.`);
    lines.push({ id: m.id, name: m.name, qty: l.qty, unit: m.price, notes: l.notes ?? null });
  }
  if (!lines.length) return fail('VALIDATION_ERROR', 'Add at least one item.');
  const subtotalP = lines.reduce((a, l) => a + toPaise(l.unit) * l.qty, 0);
  const discountP = percentOf(subtotalP, memberDiscount(member, 'bar'));
  const now = new Date().toISOString();
  const order: DKOrder = {
    id: uid(),
    number: nextNo('BO-', s.kOrders.map((o) => o.number), 6),
    member_id: member?.id ?? null,
    customer: member?.name ?? input.customer,
    source: input.source,
    table: input.table ?? null,
    lines,
    subtotal: Number(fromPaise(subtotalP)),
    discount: Number(fromPaise(discountP)),
    total: Number(fromPaise(subtotalP - discountP)),
    status: 'NEW',
    created_at: now,
    timeline: [{ status: 'NEW', at: now }],
    pay: input.payNow ? 'PAID' : 'PENDING',
    method: input.payNow ? input.method : null,
  };
  let next: DemoState = {
    ...s,
    kOrders: [order, ...s.kOrders],
    menu: s.menu.map((m) => {
      const l = lines.find((x) => x.id === m.id);
      return l ? { ...m, stock: m.stock - l.qty } : m;
    }),
  };
  if (input.payNow && input.method) next = addPayment(next, { category: 'BAR', amount: order.total, method: input.method, at: now, payer: order.customer, ref: order.number });
  commit(next);
  return { ok: true, value: order };
}

function setKitchenStatus(id: string, status: OrderStatus) {
  const at = new Date().toISOString();
  commit({ ...state, kOrders: state.kOrders.map((o) => (o.id === id ? { ...o, status, timeline: [...o.timeline, { status, at }] } : o)) });
}

function collectKitchenPayment(id: string, method: PaymentMethod) {
  const o = state.kOrders.find((x) => x.id === id);
  if (!o || o.pay === 'PAID') return;
  let s: DemoState = { ...state, kOrders: state.kOrders.map((x) => (x.id === id ? { ...x, pay: 'PAID' as const, method } : x)) };
  s = addPayment(s, { category: 'BAR', amount: o.total, method, at: new Date().toISOString(), payer: o.customer, ref: o.number });
  commit(s);
}

function saveMenuItem(m: Partial<DMenuItem> & { name: string; price: number }) {
  const existing = m.id ? state.menu.find((x) => x.id === m.id) : undefined;
  if (existing) commit({ ...state, menu: state.menu.map((x) => (x.id === existing.id ? { ...x, ...m } : x)) });
  else commit({ ...state, menu: [{ id: uid(), category: m.category ?? 'SNACK', description: m.description ?? null, available: m.available ?? true, stock: m.stock ?? 30, threshold: m.threshold ?? 10, name: m.name, price: m.price }, ...state.menu] });
}
const removeMenuItem = (id: string) => commit({ ...state, menu: state.menu.filter((m) => m.id !== id) });
const adjustMenuStock = (id: string, delta: number) => commit({ ...state, menu: state.menu.map((m) => (m.id === id ? { ...m, stock: Math.max(0, m.stock + delta) } : m)) });

/* ---- events / invoices */
function toggleEvent(eventId: string, memberId: string): Result<DEvent> {
  const e = state.events.find((x) => x.id === eventId);
  if (!e) return fail('NOT_FOUND', 'Event not found.');
  const joined = e.registered.includes(memberId);
  if (!joined) {
    const taken = e.registered.length + e.base_registered;
    if (taken >= e.capacity) return fail('SOCIAL_SESSION_FULL', 'This event is full.');
    if (e.kind === 'SOCIAL') {
      const m = memberById(memberId);
      const used = playsUsed(state, memberId, dayOf(e.start_at));
      if (m && used >= m.max_plays) return fail('DAILY_BOOKING_LIMIT', 'You have reached your plays for that day.');
    }
  }
  const next = { ...e, registered: joined ? e.registered.filter((x) => x !== memberId) : [...e.registered, memberId] };
  commit({ ...state, events: state.events.map((x) => (x.id === eventId ? next : x)) });
  return { ok: true, value: next };
}

function addEvent(e: Omit<DEvent, 'id' | 'registered' | 'base_registered'>) {
  commit({ ...state, events: [...state.events, { ...e, id: uid(), registered: [], base_registered: 0 }].sort((a, b) => a.start_at.localeCompare(b.start_at)) });
}

function payInvoice(id: string, method: PaymentMethod = 'ONLINE') {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv || inv.status === 'PAID' || inv.status === 'VOID' || inv.status === 'DRAFT') return;
  const due = money(inv.total - inv.paid);
  let s: DemoState = { ...state, invoices: state.invoices.map((i) => (i.id === id ? { ...i, paid: i.total, status: 'PAID' as const } : i)) };
  s = addPayment(s, { category: inv.type === 'BUSINESS' ? 'BUSINESS' : 'MEMBERSHIP', amount: due, method, at: new Date().toISOString(), payer: inv.client, ref: inv.number });
  commit(s);
}

/* ---- the business client's own books */
function saveBizProduct(p: Partial<BizProduct> & { name: string; price: number }) {
  const existing = p.id ? state.bizProducts.find((x) => x.id === p.id) : undefined;
  if (existing) commit({ ...state, bizProducts: state.bizProducts.map((x) => (x.id === existing.id ? { ...x, ...p } : x)) });
  else commit({ ...state, bizProducts: [{ id: uid(), sku: p.sku ?? `TN-NEW-${Math.floor(Math.random() * 900 + 100)}`, category: p.category ?? 'General', description: p.description ?? '', cost: p.cost ?? Math.round(p.price * 0.6), stock: p.stock ?? 0, name: p.name, price: p.price }, ...state.bizProducts] });
}
const removeBizProduct = (id: string) => commit({ ...state, bizProducts: state.bizProducts.filter((p) => p.id !== id) });
function saveDealer(d: Partial<Dealer> & { name: string }) {
  const existing = d.id ? state.dealers.find((x) => x.id === d.id) : undefined;
  if (existing) commit({ ...state, dealers: state.dealers.map((x) => (x.id === existing.id ? { ...x, ...d } : x)) });
  else commit({ ...state, dealers: [{ id: uid(), contact: d.contact ?? '', phone: d.phone ?? '', email: d.email ?? '', city: d.city ?? '', since: DEMO_TODAY, status: 'ACTIVE', offers: d.offers ?? [], traded: 0, name: d.name }, ...state.dealers] });
}
function addBizTx(t: Omit<BizTx, 'id' | 'ref'>) {
  commit({ ...state, bizTx: [{ ...t, id: uid(), ref: `TN-${t.type[0]}-${Math.floor(Math.random() * 9000 + 1000)}` }, ...state.bizTx] });
}

export function resetDemoData() {
  commit(seedState());
}

export const demo = {
  bookCourt,
  cancelBooking,
  patchBooking,
  markBookingPaid,
  placeShopOrder,
  setShopStatus,
  cancelShopOrder,
  saveProduct,
  removeProduct,
  adjustProductStock,
  placeKitchenOrder,
  setKitchenStatus,
  collectKitchenPayment,
  saveMenuItem,
  removeMenuItem,
  adjustMenuStock,
  toggleEvent,
  addEvent,
  payInvoice,
  saveBizProduct,
  removeBizProduct,
  saveDealer,
  addBizTx,
  reset: resetDemoData,
};

export { ALL_MEMBERS };
export type { DInvoice };
