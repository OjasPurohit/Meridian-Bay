/**
 * LIVE MODE: when VITE_API_BASE_URL is set and a real session exists, the dashboards read the database through the API.
 * Pages are unchanged: this file fills the same store (`DemoState`) and the same reference arrays (members, courts,
 * staff ...) that the preview mode seeds from mock-data, in place. Every write goes through the API first-class:
 * `hooks.after` (demoStore.ts) sends the matching request after the optimistic local change, then the store is
 * refreshed from the server so what the screen shows is what the database holds.
 * Roles never see more than the API gives them (members never see who booked a slot, kitchen sees no members...).
 */
import type { AuthSession, BarOrderDetail, EventView, BookingDetail, CourtAvailability, EmployeeApplicationView, InvoiceDetail, InvoiceView, MemberDetail, MemberSummary, PaymentView, ShopOrderDetail, StaffView, LeaveView, PayrollView } from '@shared/types/api';
import type { BarMenuItem, BusinessClient, Court, Enquiry, MembershipPlan, Product } from '@shared/types/rows';
import { addDays, istDate } from '@shared/lib/time';
import { apiRequest, ApiError, isBackendConfigured, SESSION_ENDED_EVENT } from '@/api/client';
import { unavailableMessage } from './admin';
import { clientRegistry } from './source';
import type { BarOrderRow, BookingRow, InvoiceRow, PaymentRow, ShopOrderRow } from './derive';
import { buildState } from './seed';
import { DAILY, ALL_MEMBERS, REAL_MEMBERS, applications as applicationsRef, courts as courtsRef, inactiveCourts as inactiveCourtsRef, enquiries as enquiriesRef, leaveRequests, plans as plansRef, planCards, staff as staffRef, DAYS } from './staticData';
import { hooks, replaceState, type BookInput, type KitchenInput, type ShopInput } from './demoStore';
import { DEMO_TODAY, type DemoState, type DEvent, type DMember, type DStaff } from './types';
import type { PaymentMethod } from '@shared/constants/enums';

let session: AuthSession | null = null;
let busy: Promise<void> | null = null;
const subscribers = new Set<(msg: string) => void>();

export const isLive = () => session !== null;
export const onLiveError = (fn: (msg: string) => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
const report = (msg: string) => subscribers.forEach((f) => f(msg));

/** When the server ends the session (token expired / account switched off) polling stops and `SESSION_ENDED_EVENT` is
 *  dispatched: AuthProvider listens (an event keeps the dashboard store out of the public bundle). */
/** The last background-refresh failure that was shown. The same failure is not shown again until a refresh succeeds,
 *  so a server that stays down (or a permission that stays missing) cannot fire a popup every poll. */
let lastPollError: string | null = null;

const num = (s: string) => parseFloat(s);
const get = <T,>(path: string) => apiRequest<T>('GET', path);

/** All pages of a list endpoint (page_size 100). */
async function all<T>(path: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const out: T[] = [];
  for (let page = 1; page <= 30; page++) {
    const rows = await get<T[]>(`${path}${sep}page=${page}&page_size=100`);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

function toDMember(m: MemberSummary | MemberDetail, plans: MembershipPlan[]): DMember {
  const a = m.active_membership;
  const plan = a ? plans.find((p) => p.id === a.membership_plan_id) : undefined;
  const active = a?.status === 'ACTIVE';
  return {
    id: m.id,
    user_id: m.user_id,
    code: m.member_code,
    name: m.full_name,
    email: m.email,
    phone: m.phone ?? '',
    joined_on: m.joined_on,
    type: a?.membership_type ?? null,
    plan_name: a ? a.plan_name.replace(/ Membership$/, '') : 'No plan',
    status: a ? (a.status === 'ACTIVE' ? 'ACTIVE' : a.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED') : 'NONE',
    start_date: a?.start_date ?? null,
    end_date: a?.end_date ?? null,
    days_left: active ? a!.days_remaining : null,
    price_paid: plan ? num(plan.price) : 0,
    court_pct: active && plan ? num(plan.court_discount_percent) : 0,
    shop_pct: active && plan ? num(plan.shop_discount_percent) : 0,
    bar_pct: active && plan ? num(plan.bar_discount_percent) : 0,
    max_plays: plan?.max_plays_per_day ?? 2,
    active: m.is_active,
    address: 'address' in m ? m.address : null,
    dob: 'date_of_birth' in m ? m.date_of_birth : null,
    synthetic: false,
  };
}

const toDEvent = (e: EventView, memberId: string | undefined): DEvent => ({
  id: e.id, title: e.title, kind: e.kind, description: e.description ?? '', start_at: e.start_at, end_at: e.end_at, location: e.location, capacity: e.capacity, fee: num(e.fee),
  registered: e.is_registered && memberId ? [memberId] : [], base_registered: e.registered_count - (e.is_registered ? 1 : 0), perks: ['Member discounts apply automatically'],
});

const replaceAll = <T,>(target: T[], next: T[]) => {
  target.length = 0;
  target.push(...next);
};

/** One anonymous "occupied" booking per BOOKED / BLOCKED slot, so members see taken slots but never who holds them. */
function occupiedFromAvailability(av: CourtAvailability[], ownKeys: Set<string>): BookingRow[] {
  const out: BookingRow[] = [];
  for (const c of av) {
    for (const s of c.slots) {
      if ((s.status !== 'BOOKED' && s.status !== 'BLOCKED') || ownKeys.has(`${c.court_id}|${s.start_at}`)) continue;
      out.push({
        id: `slot-${c.court_id}-${s.start_at}`, booking_number: 'TAKEN', court_id: c.court_id, booking_type: s.status === 'BLOCKED' ? 'MAINTENANCE' : 'REGULAR', member_id: null, guest_name: s.status === 'BLOCKED' ? 'Maintenance' : 'Booked',
        guest_phone: null, start_at: s.start_at, end_at: s.end_at, list_price: '0.00', discount_amount: '0.00', cancelled_at: null, created_at: s.start_at, updated_at: s.start_at, status: 'CONFIRMED', amount_due: '0.00', amount_paid: '0.00', payment_status: 'NOT_REQUIRED',
      } as BookingRow);
    }
  }
  return out;
}

function fillAnalytics(payments: PaymentView[], bookings: BookingDetail[], members: MemberSummary[], payroll: PayrollView[]) {
  for (const d of DAILY) Object.assign(d, { court: 0, membership: 0, shop: 0, bar: 0, business: 0, payroll: 0, utilities: 0, stock: 0, maintenance: 0, marketing: 0, bookings: 0, cancellations: 0, newMembers: 0 });
  const byDate = new Map(DAILY.map((d) => [d.date, d]));
  const ist = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  for (const p of payments) {
    const d = byDate.get(ist(p.paid_at));
    if (!d) continue;
    const net = num(p.amount) - num(p.refunded_amount);
    const k = p.revenue_category.toLowerCase() as 'court' | 'membership' | 'shop' | 'bar' | 'business';
    d[k] += net;
  }
  for (const b of bookings) {
    const d = byDate.get(ist(b.start_at));
    if (!d || b.booking_type === 'MAINTENANCE') continue;
    if (b.status === 'CANCELLED') d.cancellations += 1;
    else d.bookings += 1;
  }
  for (const m of members) {
    const d = byDate.get(m.joined_on);
    if (d) d.newMembers += 1;
  }
  for (const p of payroll) {
    const d = p.paid_on ? byDate.get(p.paid_on) : undefined;
    if (d) d.payroll += num(p.amount);
  }
}

async function load(s: AuthSession): Promise<void> {
  const role = s.user.role;
  const staffRole = role === 'FRONT_DESK' || role === 'KITCHEN_MANAGER' || role === 'OWNER_ADMIN';
  const today = DEMO_TODAY;
  const realToday = istDate(new Date()); // the API refuses availability for past days; the sample clock (DEMO_TODAY) can lag the real one
  const availFrom = today > realToday ? today : realToday;
  const [courts, plans, products, menu, events] = await Promise.all([
    get<Court[]>(session?.user.role === 'OWNER_ADMIN' ? '/courts?include_inactive=true' : '/courts'),
    get<MembershipPlan[]>('/memberships/plans'),
    get<{ id: string; sku: string; name: string; category: Product['category']; brand: string | null; description: string | null; price: string; stock_quantity?: number; low_stock_threshold?: number; is_active?: boolean; stock_status: string }[]>('/shop/products'),
    get<BarMenuItem[]>(staffRole ? '/bar/menu?include_unavailable=true' : '/bar/menu'),
    get<EventView[]>('/events'),
  ]);

  const src = { bookings: [] as BookingRow[], shopOrders: [] as ShopOrderRow[], barOrders: [] as BarOrderRow[], payments: [] as PaymentRow[], invoices: [] as InvoiceRow[] };
  let members: MemberSummary[] = [];
  let bookingsRaw: BookingDetail[] = [];
  let paymentsRaw: PaymentView[] = [];
  let payroll: PayrollView[] = [];

  if (role === 'MEMBER') {
    const [bookings, shop, bar, pays, av] = await Promise.all([
      safe(all<BookingDetail>('/bookings'), []),
      safe(all<ShopOrderDetail>('/shop/orders'), []),
      safe(all<BarOrderDetail>('/bar/orders'), []),
      safe(all<PaymentView>('/payments'), []),
      Promise.all(Array.from({ length: 14 }, (_, i) => safe(get<CourtAvailability[]>(`/courts/availability?date=${addDays(availFrom, i)}`), []))),
    ]);
    bookingsRaw = bookings;
    const own = new Set(bookings.filter((b) => b.status !== 'CANCELLED').map((b) => `${b.court_id}|${new Date(b.start_at).toISOString()}`));
    src.bookings = [...(bookings as unknown as BookingRow[]), ...occupiedFromAvailability(av.flat(), own)];
    src.shopOrders = shop as unknown as ShopOrderRow[];
    src.barOrders = bar as unknown as BarOrderRow[];
    paymentsRaw = pays;
    // the member's own record carries the saved address
    const me = await safe(get<MemberDetail>('/members/me'), null);
    members = me ? [me] : s.member ? [s.member] : [];
  } else if (role === 'STORE_MANAGER') {
    const [shop, pays] = await Promise.all([safe(all<ShopOrderDetail>('/shop/orders'), []), safe(all<PaymentView>('/payments'), [])]);
    src.shopOrders = shop as unknown as ShopOrderRow[];
    paymentsRaw = pays;
  } else if (role === 'KITCHEN_MANAGER') {
    const [bar, pays] = await Promise.all([safe(all<BarOrderDetail>('/bar/orders'), []), safe(all<PaymentView>('/payments'), [])]);
    src.barOrders = bar as unknown as BarOrderRow[];
    paymentsRaw = pays;
  } else {
    // FRONT_DESK and OWNER_ADMIN
    const [bookings, shop, bar, pays, mem] = await Promise.all([
      safe(all<BookingDetail>('/bookings'), []),
      safe(all<ShopOrderDetail>('/shop/orders'), []),
      safe(all<BarOrderDetail>('/bar/orders'), []),
      safe(all<PaymentView>('/payments'), []),
      safe(all<MemberSummary>('/members'), []),
    ]);
    bookingsRaw = bookings;
    src.bookings = bookings as unknown as BookingRow[];
    src.shopOrders = shop as unknown as ShopOrderRow[];
    src.barOrders = bar as unknown as BarOrderRow[];
    paymentsRaw = pays;
    members = mem;
    if (role === 'OWNER_ADMIN') {
      const inv = await safe(all<InvoiceView>('/invoices'), []);
      const details = await Promise.all(inv.map((i) => safe(get<InvoiceDetail>(`/invoices/${i.id}`), null)));
      src.invoices = details.filter((d): d is InvoiceDetail => d !== null) as unknown as InvoiceRow[];
      const [clients, enq, staff, leave, pay, apps] = await Promise.all([
        safe(all<BusinessClient>('/business-clients'), []),
        safe(get<(Enquiry & { plan_name: string | null })[]>('/enquiries'), []),
        safe(get<StaffView[]>('/staff'), []),
        safe(get<LeaveView[]>('/staff/leave-requests'), []),
        safe(get<PayrollView[]>('/staff/payroll'), []),
        safe(get<EmployeeApplicationView[]>('/staff/applications'), []),
      ]);
      payroll = pay;
      replaceAll(clientRegistry, clients);
      replaceAll(applicationsRef, apps.map((a) => ({ id: a.id, name: a.full_name, email: a.email, phone: a.phone ?? '', status: a.status, role: a.approved_role, applied_at: a.applied_at, reviewed_at: a.reviewed_at, reviewed_by: a.reviewed_by_name, note: a.decision_note })));
      replaceAll(enquiriesRef as unknown[], enq.map((e) => ({ id: e.id, name: e.name, phone: e.phone, email: e.email, type: e.enquiry_type, status: e.handled_at ? 'HANDLED' : 'NEW', message: e.message, created_at: e.created_at })));
      const shifts = await safe(get<{ staff_id: string; start_time: string; end_time: string }[]>(`/staff/shifts?from=${today}&to=${today}`), []);
      replaceAll(staffRef, staff.map((m): DStaff => {
        const sh = shifts.find((x) => x.staff_id === m.id);
        const last = pay.filter((p) => p.staff_id === m.id)[0];
        return { id: m.id, user_id: m.user_id, name: m.full_name, email: m.email, designation: m.designation, role: m.role, area: m.role === 'KITCHEN_MANAGER' ? 'BAR' : m.role === 'FRONT_DESK' ? 'COURTS' : m.role === 'STORE_MANAGER' ? 'SHOP' : 'MANAGEMENT', salary: num(m.monthly_salary), phone: m.phone ?? '', shift: sh ? `${sh.start_time.slice(0, 5)}–${sh.end_time.slice(0, 5)}` : 'Off today', payroll: last ? (last.is_paid ? 'PAID' : 'PENDING') : 'PENDING', on_duty: !!sh, active: m.is_active };
      }));
      replaceAll(leaveRequests as unknown[], leave.map((l) => ({ id: l.id, staff: l.staff_name, type: 'LEAVE', from: l.start_date, to: l.end_date, status: l.status, reason: l.reason })));
    }
  }
  src.payments = paymentsRaw as unknown as PaymentRow[];
  const toDCourt = (c: Court) => ({ id: c.id, name: c.name, sport: c.sport_type, rate: num(c.walk_in_rate_per_hour), surface: c.surface, description: c.description });
  replaceAll(courtsRef as unknown[], courts.filter((c) => c.is_active).map(toDCourt));
  replaceAll(inactiveCourtsRef as unknown[], courts.filter((c) => !c.is_active).map(toDCourt));
  replaceAll(plansRef as unknown[], plans);
  replaceAll(planCards as unknown[], plans.map((p) => ({ id: p.id, type: p.membership_type, name: p.name.replace(/ Membership$/, ''), price: num(p.price), court: num(p.court_discount_percent), shop: num(p.shop_discount_percent), bar: num(p.bar_discount_percent), benefits: p.benefits, maxPlays: p.max_plays_per_day })));
  const dmembers = members.map((m) => toDMember(m, plans));
  replaceAll(REAL_MEMBERS, dmembers);
  replaceAll(ALL_MEMBERS, dmembers);
  fillAnalytics(paymentsRaw, bookingsRaw, members, payroll);
  void DAYS;

  const productRows = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, description: p.description, price: p.price, image_url: null, stock_quantity: p.stock_quantity ?? (p.stock_status === 'OUT_OF_STOCK' ? 0 : p.stock_status === 'LOW_STOCK' ? 3 : 50), low_stock_threshold: p.low_stock_threshold ?? 5, is_active: true, created_at: '', updated_at: '' })) as Product[];
  const fresh = buildState({ ...src, products: productRows, menu });
  // Events are the `events` table, the same rows for every role (a member also learns which ones they registered for).
  const myId = s.member?.id;
  replaceState({ ...fresh, events: events.map((e): DEvent => toDEvent(e, myId)) });
}

/** After a write: wait for any refresh already in flight (it may have read the data before the write), then reload. */
export async function refreshLiveFresh(): Promise<void> {
  if (busy) await busy;
  return refreshLive();
}

/** (Re)load everything the signed-in role may see. Concurrent calls share one run. */
export function refreshLive(): Promise<void> {
  if (!session) return Promise.resolve();
  if (busy) return busy;
  const s = session;
  busy = load(s)
    .then(() => {
      lastPollError = null;
    })
    .catch((e: unknown) => {
      if (e instanceof ApiError && (e.code === 'AUTH_UNAUTHORIZED' || e.code === 'ACCOUNT_DISABLED')) {
        stopLive(); // retrying with a dead session would fail (and pop up) forever
        window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: e.code }));
        return;
      }
      const msg = e instanceof ApiError ? e.message : 'Could not refresh from the server.';
      if (msg !== lastPollError) {
        lastPollError = msg;
        report(msg);
      }
    })
    .finally(() => {
      busy = null;
    });
  return busy;
}

let timer: ReturnType<typeof setInterval> | null = null;
export async function startLive(s: AuthSession): Promise<void> {
  session = s;
  await refreshLive();
  if (timer) clearInterval(timer);
  timer = setInterval(() => document.visibilityState === 'visible' && void refreshLive(), 10_000); // kitchen board / orders stay current (ADR-010)
}
export function stopLive() {
  session = null;
  lastPollError = null;
  if (timer) clearInterval(timer);
  timer = null;
}

// ------------------------------------------------------------------ writes
const post = (path: string, body?: unknown) => apiRequest('POST', path, body ?? {});
const patch = (path: string, body: unknown) => apiRequest('PATCH', path, body);

async function send(job: () => Promise<unknown>) {
  try {
    await job();
  } catch (e) {
    report(e instanceof ApiError ? e.message : 'That change could not be saved.');
  }
  await refreshLiveFresh(); // the server's answer is the truth: this also reverts an optimistic change it refused
}

const isMember = () => session?.user.role === 'MEMBER';
const isOwner = () => session?.user.role === 'OWNER_ADMIN';
/** Products, stock and menu items are the owner's and the store manager's to change (the API enforces it). */
const canEditShop = () => session?.user.role === 'OWNER_ADMIN' || session?.user.role === 'STORE_MANAGER';

function onAction(action: string, args: unknown[], result: unknown) {
  if (!session) return;
  const failed = typeof result === 'object' && result !== null && 'ok' in result && (result as { ok: boolean }).ok === false;
  if (failed) return; // refused locally: nothing to send
  switch (action) {
    case 'bookCourt': {
      const i = args[0] as BookInput;
      return void send(() =>
        post('/bookings', {
          court_id: i.court_id,
          start_at: i.start_at,
          ...(isMember() ? {} : i.member_id ? { member_id: i.member_id } : { guest_name: i.name, ...(i.phone ? { guest_phone: i.phone } : {}) }),
          ...(i.method ? { payment_method: isMember() ? 'ONLINE' : i.method } : {}),
        }),
      );
    }
    case 'cancelBooking':
      return void send(() => post(`/bookings/${args[0] as string}/cancel`, {}));
    case 'markBookingPaid':
      return void send(() => post('/payments', { source_type: 'COURT_BOOKING', source_id: args[0], payment_method: args[1] }));
    case 'placeShopOrder': {
      const i = args[0] as ShopInput;
      return void send(async () => {
        await post('/shop/orders', {
          items: i.lines.map((l) => ({ product_id: l.product_id, quantity: l.qty })),
          fulfillment: i.fulfillment,
          ...(i.fulfillment === 'DELIVERY' ? { delivery_address: i.address } : {}),
          ...(isMember() ? {} : i.member_id ? { member_id: i.member_id } : { guest_name: i.customer }),
          ...(isMember() ? {} : { payment_method: i.method }),
        });
        // a member's delivery address is remembered on their profile (members.address) for next time
        const mine = session?.member;
        const address = i.address?.trim();
        if (isMember() && mine && i.fulfillment === 'DELIVERY' && address && address !== (ALL_MEMBERS.find((m) => m.id === mine.id)?.address ?? '')) await patch(`/members/${mine.id}`, { address });
      });
    }
    case 'setShopStatus':
      return void send(() => (args[1] === 'CANCELLED' ? post(`/shop/orders/${args[0] as string}/cancel`) : patch(`/shop/orders/${args[0] as string}/status`, { status: args[1] })));
    case 'cancelShopOrder':
      return void send(() => post(`/shop/orders/${args[0] as string}/cancel`));
    case 'saveProduct': {
      const p = args[0] as { id?: string; sku?: string; name: string; price: number; category?: string; brand?: string | null; description?: string | null; stock?: number; threshold?: number; active?: boolean };
      if (!canEditShop()) return void refreshLive();
      const price = p.price.toFixed(2);
      const real = !!p.id && /^[0-9a-f-]{36}$/.test(p.id);
      return void send(() =>
        real
          ? patch(`/shop/products/${p.id}`, { name: p.name, price, ...(p.category ? { category: p.category } : {}), ...(p.brand ? { brand: p.brand } : {}), ...(p.description ? { description: p.description } : {}) })
          : post('/shop/products', { sku: p.sku ?? `NEW-${Date.now().toString().slice(-6)}`, name: p.name, price, category: p.category ?? 'ACCESSORY', ...(p.brand ? { brand: p.brand } : {}), ...(p.description ? { description: p.description } : {}), initial_stock: p.stock ?? 0 }),
      );
    }
    case 'removeProduct':
      return void (canEditShop() ? send(() => apiRequest('DELETE', `/shop/products/${args[0] as string}`)) : refreshLive());
    case 'adjustProductStock':
      return void (canEditShop() ? send(() => post('/inventory/adjustments', { product_id: args[0], quantity_change: args[1] })) : refreshLive());
    case 'adjustMenuStock':
      return void send(() => post(`/bar/menu-items/${args[0] as string}/stock-adjustments`, { quantity_change: args[1] })); // kitchen + owner; a refusal is reverted by the refetch
    case 'placeKitchenOrder': {
      const i = args[0] as KitchenInput;
      return void send(() =>
        post('/bar/orders', {
          items: i.lines.map((l) => ({ bar_menu_item_id: l.menu_id, quantity: l.qty, ...(l.notes ? { notes: l.notes } : {}) })),
          ...(i.table ? { table_label: i.table } : {}),
          ...(isMember() ? {} : i.member_id ? { member_id: i.member_id } : { guest_name: i.customer || 'Guest' }),
          ...(!isMember() && i.payNow && i.method ? { payment_method: i.method } : {}),
        }),
      );
    }
    case 'setKitchenStatus':
      return void send(() => (args[1] === 'CANCELLED' ? post(`/bar/orders/${args[0] as string}/cancel`) : patch(`/kitchen/orders/${args[0] as string}/status`, { status: args[1] })));
    case 'collectKitchenPayment':
      return void send(() => post('/payments', { source_type: 'BAR_ORDER', source_id: args[0], payment_method: args[1] as PaymentMethod }));
    case 'saveMenuItem': {
      const m = args[0] as { id?: string; name: string; price: number; category?: string; description?: string | null; available?: boolean };
      const real = !!m.id && /^[0-9a-f-]{36}$/.test(m.id);
      return void send(() =>
        real ? patch(`/bar/menu-items/${m.id}`, { name: m.name, price: m.price.toFixed(2), ...(m.category ? { category: m.category } : {}), ...(m.available !== undefined ? { is_available: m.available } : {}) }) : post('/bar/menu-items', { name: m.name, price: m.price.toFixed(2), category: m.category ?? 'SNACK', ...(m.description ? { description: m.description } : {}) }),
      );
    }
    case 'removeMenuItem':
      return void send(() => patch(`/bar/menu-items/${args[0] as string}`, { is_available: false }));
    case 'payInvoice':
      return void send(() => post('/payments', { source_type: 'INVOICE', source_id: args[0], payment_method: session?.user.role === 'OWNER_ADMIN' || session?.user.role === 'FRONT_DESK' ? (args[1] ?? 'CARD') : 'ONLINE' }));
    default:
      return; // events are a demo-only feature (no table behind them)
  }
}

hooks.after = onAction;
/** With a backend an action is only ever applied together with its API call: no session = nothing changes (one notice). */
hooks.blocked = () => {
  if (!isBackendConfigured) return null; // preview build: the local sample store is the point
  const why = unavailableMessage();
  if (why) report(why);
  return why;
};
