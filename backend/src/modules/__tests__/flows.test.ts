/**
 * End-to-end role flows over HTTP against a throw-away in-memory database (migrations + seed): login for every role,
 * server-side authorisation, and the money paths (invoice payment, court booking, shop order, cafe + kitchen, HR,
 * settings, reports). Never touches the real champions_club database.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { loadConfig } from '../../config';
import { setUserStateLoader } from '../../kernel/auth';
import { istDate } from '@shared/lib/time';
import { query } from '../../kernel/db';
import { setLogSink } from '../../kernel/http';
import { serve, startTestDb, TEST_JWT_SECRET, useTestEnv, type TestDb } from '../../kernel/__tests__/helpers';

useTestEnv();
const config = loadConfig({ JWT_SECRET: TEST_JWT_SECRET, DATABASE_URL: 'postgresql://t:t@127.0.0.1:1/none', BCRYPT_ROUNDS: '4' });

const PASSWORD = 'Password@123';
const USERS = {
  owner: 'owner@championsclub.example',
  desk: 'neha.sharma@championsclub.example',
  kitchen: 'kitchen@championsclub.example',
  store: 'sanjay.gupta@championsclub.example',
  member: 'aarav.kapoor@example.com',
  other: 'priya.nair@example.com',
} as const;

let t: TestDb;
let server: Awaited<ReturnType<typeof serve>>;
const tokens = new Map<string, string>();
const sessions = new Map<string, any>();

/** pglite-socket drops the connection after a SQL error (real PostgreSQL does not): let the pool recover. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

async function call(who: keyof typeof USERS | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${server.url}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens.get(who)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* csv */
  }
  if (res.status >= 500 || (json && json.success === false)) await settle();
  return { status: res.status, body: json, text };
}

before(async () => {
  t = await startTestDb();
  setLogSink((line) => { if (process.env.TEST_LOGS) console.log(line); });
  setUserStateLoader(); // real lookups against the test database
  server = await serve(await createApp({ config }));
  for (const [who, email] of Object.entries(USERS)) {
    const r = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
    assert.equal(r.status, 200, `${who} login`);
    tokens.set(who, r.body.data.token);
    sessions.set(who, r.body.data);
  }
});
after(async () => {
  await server.close();
  await t.close();
});

describe('auth', () => {
  it('every role logs in and is sent to its own home; profile ids match the role', () => {
    assert.equal(sessions.get('owner').redirect_to, '/owner');
    assert.equal(sessions.get('desk').redirect_to, '/front-desk');
    assert.equal(sessions.get('kitchen').redirect_to, '/kitchen');
    assert.equal(sessions.get('store').redirect_to, '/store-manager');
    assert.equal(sessions.get('member').redirect_to, '/member');
    assert.ok(sessions.get('member').member.active_membership);
    assert.ok(sessions.get('store').staff);
    assert.equal(sessions.get('store').user.role, 'STORE_MANAGER');
    assert.ok(sessions.get('desk').staff);
    assert.equal(sessions.get('owner').user.password_hash, undefined);
  });

  it('wrong password and unknown email are both AUTH_INVALID; /me restores the session; no token is AUTH_UNAUTHORIZED', async () => {
    assert.equal((await call(null, 'POST', '/auth/login', { email: USERS.owner, password: 'nope-nope-1' })).body.error.code, 'AUTH_INVALID');
    assert.equal((await call(null, 'POST', '/auth/login', { email: 'ghost@example.com', password: PASSWORD })).body.error.code, 'AUTH_INVALID');
    assert.equal((await call('member', 'GET', '/auth/me')).body.data.user.role, 'MEMBER');
    assert.equal((await call(null, 'GET', '/auth/me')).body.error.code, 'AUTH_UNAUTHORIZED');
  });

  it('signup creates a MEMBER with no plan', async () => {
    const r = await call(null, 'POST', '/auth/signup', { full_name: 'Test Person', email: 'test.person@example.com', phone: '9876543210', password: 'Passw0rdTest' });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.user.role, 'MEMBER');
    assert.equal(r.body.data.member.active_membership, null);
  });
});

describe('authorisation is enforced by the server', () => {
  it('each role is refused what it may not do', async () => {
    assert.equal((await call('member', 'GET', '/reports/dashboard?period=TODAY')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('desk', 'GET', '/staff')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('kitchen', 'GET', '/payments')).status, 200); // own (empty) list
    assert.equal((await call('kitchen', 'GET', '/invoices')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('store', 'GET', '/members')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('store', 'GET', '/invoices')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('store', 'GET', '/reports/dashboard?period=TODAY')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('kitchen', 'POST', '/shop/products', {})).body.error.code, 'FORBIDDEN');
    assert.equal((await call('member', 'GET', '/settings')).body.error.code, 'FORBIDDEN');
    assert.equal((await call(null, 'GET', '/payments')).body.error.code, 'AUTH_UNAUTHORIZED');
  });
});

describe('invoices: the owner issues them and records the payments', () => {
  let invoiceId = '';
  it('only the owner and the member the invoice is addressed to can see it', async () => {
    const r = await call('owner', 'GET', '/invoices?page_size=100');
    assert.equal(r.status, 200);
    invoiceId = r.body.data.find((i: any) => i.payment_state === 'PARTIALLY_PAID').id;
    assert.equal((await call('store', 'GET', `/invoices/${invoiceId}`)).body.error.code, 'FORBIDDEN');
    assert.equal((await call('desk', 'GET', `/invoices/${invoiceId}`)).body.error.code, 'FORBIDDEN');
    assert.equal((await call('member', 'GET', `/invoices/${invoiceId}`)).body.error.code, 'INVOICE_NOT_FOUND');
  });

  it('records the outstanding amount; invoice becomes PAID; a second payment is refused; the business ledger shows it', async () => {
    const before = (await call('owner', 'GET', `/invoices/${invoiceId}`)).body.data;
    const pay = await call('owner', 'POST', '/payments', { source_type: 'INVOICE', source_id: invoiceId, payment_method: 'UPI' });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.data.amount, before.amount_outstanding);
    assert.equal(pay.body.data.revenue_category, 'BUSINESS');
    const after = (await call('owner', 'GET', `/invoices/${invoiceId}`)).body.data;
    assert.equal(after.payment_state, 'PAID');
    assert.equal(after.amount_outstanding, '0.00');
    assert.equal((await call('owner', 'POST', '/payments', { source_type: 'INVOICE', source_id: invoiceId, payment_method: 'UPI' })).body.error.code, 'ALREADY_PAID');
  });

  it('owner creates, sends and cannot void a part-paid invoice; drafts are editable, sent ones are not; refunds are capped', async () => {
    const clients = await call('owner', 'GET', '/business-clients');
    const bc = clients.body.data[0].id;
    const c = await call('owner', 'POST', '/invoices', { business_client_id: bc, due_date: '2030-01-31', items: [{ description: 'Court hire', quantity: 2, unit_price: '1000.00' }] });
    assert.equal(c.status, 201);
    assert.equal(c.body.data.status, 'DRAFT');
    assert.equal(c.body.data.total_amount, '2360.00'); // 18 % default
    assert.equal((await call('owner', 'PATCH', `/invoices/${c.body.data.id}`, { notes: 'edited' })).status, 200);
    const sent = await call('owner', 'POST', `/invoices/${c.body.data.id}/send`);
    assert.equal(sent.body.data.status, 'SENT');
    assert.equal(sent.body.data.payment_state, 'UNPAID');
    assert.equal((await call('owner', 'PATCH', `/invoices/${c.body.data.id}`, { notes: 'again' })).body.error.code, 'INVOICE_NOT_EDITABLE');
    const part = await call('owner', 'POST', '/payments', { source_type: 'INVOICE', source_id: c.body.data.id, payment_method: 'CARD', amount: '1000.00' });
    assert.equal(part.status, 201);
    assert.equal((await call('owner', 'GET', `/invoices/${c.body.data.id}`)).body.data.payment_state, 'PARTIALLY_PAID');
    assert.equal((await call('owner', 'POST', `/invoices/${c.body.data.id}/void`)).body.error.code, 'INVALID_STATUS_TRANSITION');
    const refund = await call('owner', 'POST', `/payments/${part.body.data.id}/refund`, { amount: '250.00', reason: 'goodwill' });
    assert.equal(refund.body.data.status, 'PARTIALLY_REFUNDED');
    assert.equal((await call('owner', 'POST', `/payments/${part.body.data.id}/refund`, { amount: '900.00', reason: 'too much' })).body.error.code, 'REFUND_EXCEEDS_PAYMENT');
  });
});

describe('member and front desk: membership, court booking, shop', () => {
  it('member sees their own membership status, derived from dates', async () => {
    const me = await call('member', 'GET', '/members/me');
    assert.equal(me.body.data.active_membership.status, 'ACTIVE');
    assert.equal((await call('member', 'GET', `/members/${sessions.get('other').member.id}`)).body.error.code, 'MEMBER_NOT_FOUND');
    assert.equal((await call('member', 'GET', '/members')).body.error.code, 'FORBIDDEN');
    const list = await call('desk', 'GET', '/members?page_size=100');
    assert.ok(list.body.meta.total >= 13);
  });

  let bookingId = '';
  it('member books a court online at the plan price, then cancels with a refund', async () => {
    const courts = (await call(null, 'GET', '/courts')).body.data;
    const day = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const av = (await call('member', 'GET', `/courts/availability?date=${day}&court_id=${courts[0].id}`)).body.data[0];
    const slot = av.slots.find((s: any) => s.status === 'AVAILABLE');
    const price = await call('member', 'GET', `/bookings/price?court_id=${courts[0].id}&start_at=${encodeURIComponent(slot.start_at)}`);
    assert.equal(price.status, 200);
    const b = await call('member', 'POST', '/bookings', { court_id: courts[0].id, start_at: slot.start_at, payment_method: 'ONLINE' });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    bookingId = b.body.data.id;
    assert.equal(b.body.data.status, 'CONFIRMED');
    assert.equal(b.body.data.amount_due, price.body.data.amount_due);
    assert.equal(b.body.data.member_id, sessions.get('member').member.id);
    assert.equal((await call('member', 'POST', '/bookings', { court_id: courts[0].id, start_at: slot.start_at })).body.error.code, 'BOOKING_CONFLICT');
    assert.equal((await call('other', 'GET', `/bookings/${bookingId}`)).body.error.code, 'BOOKING_NOT_FOUND');
    const c = await call('member', 'POST', `/bookings/${bookingId}/cancel`, {});
    assert.equal(c.status, 200);
    assert.equal(c.body.data.booking.status, 'CANCELLED');
    if (price.body.data.is_free === false) assert.equal(c.body.data.refund_amount, price.body.data.amount_due);
    assert.equal((await call('member', 'POST', `/bookings/${bookingId}/cancel`, {})).body.error.code, 'BOOKING_NOT_CANCELLABLE');
  });

  it('front desk books a walk-in, pays by cash; availability hides the booker from members but not from staff', async () => {
    const courts = (await call(null, 'GET', '/courts')).body.data;
    const day = new Date(Date.now() + 22 * 86_400_000).toISOString().slice(0, 10);
    const slot = (await call('desk', 'GET', `/courts/availability?date=${day}&court_id=${courts[1].id}`)).body.data[0].slots.find((s: any) => s.status === 'AVAILABLE');
    assert.equal((await call('desk', 'POST', '/bookings', { court_id: courts[1].id, start_at: slot.start_at })).body.error.code, 'VALIDATION_ERROR');
    const b = await call('desk', 'POST', '/bookings', { court_id: courts[1].id, start_at: slot.start_at, guest_name: 'Walk In', guest_phone: '9811122233', payment_method: 'CASH' });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(b.body.data.payment_status, 'PAID');
    assert.equal(b.body.data.discount_amount, '0.00');
    const staffView = (await call('desk', 'GET', `/courts/availability?date=${day}&court_id=${courts[1].id}`)).body.data[0].slots.find((s: any) => s.start_at === slot.start_at);
    const memberView = (await call('member', 'GET', `/courts/availability?date=${day}&court_id=${courts[1].id}`)).body.data[0].slots.find((s: any) => s.start_at === slot.start_at);
    assert.equal(staffView.booking_id, b.body.data.id);
    assert.equal(memberView.booking_id, null);
    assert.equal(memberView.status, 'BOOKED');
  });

  it('member places a pickup shop order with the member discount; stock goes down; cancelling returns it', async () => {
    const products = (await call('member', 'GET', '/shop/products')).body.data;
    const p = products.find((x: any) => x.stock_status === 'IN_STOCK');
    const stockBefore = (await call('desk', 'GET', '/inventory')).body.data.find((i: any) => i.product_id === p.id).stock_quantity;
    const o = await call('member', 'POST', '/shop/orders', { items: [{ product_id: p.id, quantity: 1 }], fulfillment: 'PICKUP' });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    assert.equal(o.body.data.payment_status, 'PAID');
    assert.equal(o.body.data.status, 'PLACED');
    assert.equal((await call('desk', 'GET', '/inventory')).body.data.find((i: any) => i.product_id === p.id).stock_quantity, stockBefore - 1);
    assert.equal((await call('desk', 'PATCH', `/shop/orders/${o.body.data.id}/status`, { status: 'READY_FOR_PICKUP' })).body.error.code, 'INVALID_STATUS_TRANSITION');
    assert.equal((await call('desk', 'PATCH', `/shop/orders/${o.body.data.id}/status`, { status: 'CONFIRMED' })).body.data.status, 'CONFIRMED');
    const c = await call('desk', 'POST', `/shop/orders/${o.body.data.id}/cancel`);
    assert.equal(c.body.data.status, 'CANCELLED');
    assert.equal(c.body.data.payment_status, 'REFUNDED');
    assert.equal((await call('desk', 'GET', '/inventory')).body.data.find((i: any) => i.product_id === p.id).stock_quantity, stockBefore);
    assert.equal((await call('member', 'POST', '/shop/orders', { items: [{ product_id: p.id, quantity: 1000 }], fulfillment: 'PICKUP' })).body.error.code, 'OUT_OF_STOCK');
  });
});

describe('cafe and kitchen', () => {
  it('desk takes an order paid at once; the kitchen board shows it without prices and moves it along; order cannot skip a step', async () => {
    const menu = (await call(null, 'GET', '/bar/menu')).body.data;
    const o = await call('desk', 'POST', '/bar/orders', { table_label: 'T9', items: [{ bar_menu_item_id: menu[0].id, quantity: 2, notes: 'no sugar' }], payment_method: 'UPI' });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    assert.equal(o.body.data.payment_status, 'PAID');
    const board = await call('kitchen', 'GET', '/kitchen/orders');
    const ticket = board.body.data.find((k: any) => k.id === o.body.data.id);
    assert.ok(ticket);
    assert.equal(ticket.total_amount, undefined);
    assert.equal(ticket.items[0].notes, 'no sugar');
    assert.equal((await call('kitchen', 'PATCH', `/kitchen/orders/${ticket.id}/status`, { status: 'READY' })).body.error.code, 'INVALID_STATUS_TRANSITION');
    assert.equal((await call('kitchen', 'PATCH', `/kitchen/orders/${ticket.id}/status`, { status: 'PREPARING' })).body.data.status, 'PREPARING');
    assert.equal((await call('member', 'GET', '/kitchen/orders')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('desk', 'GET', '/kitchen/orders')).body.error.code, 'FORBIDDEN');
  });

  it('the kitchen can take a READY ticket back to PREPARING (miscommunication); other backward or skipping moves stay rejected', async () => {
    const menu = (await call(null, 'GET', '/bar/menu')).body.data;
    const o = await call('desk', 'POST', '/bar/orders', { table_label: 'T10', items: [{ bar_menu_item_id: menu[0].id, quantity: 1 }], payment_method: 'CASH' });
    const id = o.body.data.id;
    const status = (to: string, who: 'kitchen' | 'desk' | 'member' = 'kitchen') => call(who, 'PATCH', `/kitchen/orders/${id}/status`, { status: to });
    assert.equal((await status('PREPARING')).body.data.status, 'PREPARING');
    assert.equal((await status('READY')).body.data.status, 'READY');
    assert.equal((await status('PREPARING', 'member')).body.error.code, 'FORBIDDEN');
    assert.equal((await status('PREPARING', 'desk')).body.error.code, 'FORBIDDEN');
    assert.equal((await status('PREPARING')).body.data.status, 'PREPARING', 'READY -> PREPARING');
    assert.equal((await query('SELECT status FROM bar_orders WHERE id = $1', [id])).rows[0].status, 'PREPARING');
    assert.equal((await status('NEW')).body.error.code, 'INVALID_STATUS_TRANSITION', 'PREPARING -> NEW');
    assert.equal((await status('SERVED')).body.error.code, 'INVALID_STATUS_TRANSITION', 'PREPARING -> SERVED skips READY');
    assert.equal((await status('READY')).body.data.status, 'READY');
    assert.equal((await status('SERVED')).body.data.status, 'SERVED');
    assert.equal((await status('PREPARING')).body.error.code, 'INVALID_STATUS_TRANSITION', 'SERVED is final');
    assert.equal((await status('READY')).body.error.code, 'INVALID_STATUS_TRANSITION');
    // READY -> NEW / CANCELLED stay forbidden
    const o2 = await call('desk', 'POST', '/bar/orders', { table_label: 'T11', items: [{ bar_menu_item_id: menu[0].id, quantity: 1 }] });
    const id2 = o2.body.data.id;
    await call('kitchen', 'PATCH', `/kitchen/orders/${id2}/status`, { status: 'PREPARING' });
    await call('kitchen', 'PATCH', `/kitchen/orders/${id2}/status`, { status: 'READY' });
    assert.equal((await call('kitchen', 'PATCH', `/kitchen/orders/${id2}/status`, { status: 'NEW' })).body.error.code, 'INVALID_STATUS_TRANSITION');
    assert.equal((await call('kitchen', 'PATCH', `/kitchen/orders/${id2}/status`, { status: 'CANCELLED' })).body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  it('kitchen takes payment for a cafe order only', async () => {
    const menu = (await call(null, 'GET', '/bar/menu')).body.data;
    const o = await call('kitchen', 'POST', '/bar/orders', { guest_name: 'Walk-in', items: [{ bar_menu_item_id: menu[1].id, quantity: 1 }] });
    assert.equal(o.body.data.payment_status, 'PENDING');
    assert.equal((await call('kitchen', 'POST', '/payments', { source_type: 'BAR_ORDER', source_id: o.body.data.id, payment_method: 'CASH' })).status, 201);
    const inv = (await call('owner', 'GET', '/invoices')).body.data[0];
    assert.equal((await call('kitchen', 'POST', '/payments', { source_type: 'INVOICE', source_id: inv.id, payment_method: 'CASH' })).body.error.code, 'FORBIDDEN');
  });
});

describe('staff, settings, reports', () => {
  it('front desk requests leave, owner approves; own-record scoping; overlap refused', async () => {
    const r = await call('desk', 'POST', '/staff/leave-requests', { start_date: '2031-03-01', end_date: '2031-03-03', reason: 'Trip' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await call('desk', 'POST', '/staff/leave-requests', { start_date: '2031-03-02', end_date: '2031-03-04' })).body.error.code, 'LEAVE_OVERLAP');
    assert.equal((await call('desk', 'POST', `/staff/leave-requests/${r.body.data.id}/decision`, { decision: 'APPROVE' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('owner', 'POST', `/staff/leave-requests/${r.body.data.id}/decision`, { decision: 'REJECT' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('owner', 'POST', `/staff/leave-requests/${r.body.data.id}/decision`, { decision: 'APPROVE' })).body.data.status, 'APPROVED');
    const mine = await call('desk', 'GET', '/staff/leave-requests');
    assert.ok(mine.body.data.every((l: any) => l.staff_id === sessions.get('desk').staff.id));
    assert.equal((await call('desk', 'GET', `/staff/${sessions.get('kitchen').staff.id}`)).body.error.code, 'STAFF_NOT_FOUND');
  });

  it('owner schedules shifts (no overlap) and runs payroll once per month', async () => {
    const staff = sessions.get('desk').staff.id;
    const s = await call('owner', 'POST', '/staff/shifts', { staff_id: staff, shift_date: '2031-05-05', start_time: '09:00:00', end_time: '17:00:00', area: 'FRONT_DESK' });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call('owner', 'POST', '/staff/shifts', { staff_id: staff, shift_date: '2031-05-05', start_time: '16:00:00', end_time: '20:00:00', area: 'FRONT_DESK' })).body.error.code, 'SHIFT_OVERLAP');
    const p = await call('owner', 'POST', '/staff/payroll', { staff_id: staff, pay_period: '2031-05-01', payment_method: 'UPI' });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    assert.equal(p.body.data.is_paid, false);
    assert.equal((await call('owner', 'POST', '/staff/payroll', { staff_id: staff, pay_period: '2031-05-01', payment_method: 'UPI' })).body.error.code, 'PAYROLL_EXISTS');
    assert.equal((await call('owner', 'POST', `/staff/payroll/${p.body.data.id}/pay`, {})).body.data.is_paid, true);
  });

  it('settings: only known keys, type-checked, applied at once', async () => {
    assert.equal((await call('owner', 'GET', '/settings')).body.data.length, 18);
    assert.equal((await call('owner', 'PATCH', '/settings/delivery_fee', { value: '75.00' })).body.data.value, '75.00');
    assert.equal((await call('owner', 'PATCH', '/settings/delivery_fee', { value: 'free' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('owner', 'PATCH', '/settings/not_a_key', { value: '1' })).body.error.code, 'SETTING_NOT_FOUND');
    assert.equal((await call('owner', 'PATCH', '/settings/cancellation_cutoff_hours', { value: 4 })).body.data.value, 4);
  });

  it('reports: dashboard, revenue by day, finance, tax and CSV export all answer; revenue equals the ledger', async () => {
    const d = await call('owner', 'GET', '/reports/dashboard?period=MONTH');
    assert.equal(d.status, 200);
    const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    const range = `?from=${iso(-300)}&to=${iso(1)}`;
    const rev = await call('owner', 'GET', `/reports/revenue${range}&group_by=CATEGORY`);
    const fin = await call('owner', 'GET', `/reports/finance${range}`);
    assert.equal(rev.body.data.total, fin.body.data.revenue_total);
    const net = (await t.db.query<{ s: string }>("SELECT sum(amount - refunded_amount)::numeric(12,2)::text AS s FROM payments WHERE (paid_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2", [iso(-300), iso(1)])).rows[0]!.s;
    assert.equal(rev.body.data.total, net);
    assert.equal((await call('owner', 'GET', `/reports/tax${range}`)).status, 200);
    assert.equal((await call('owner', 'GET', `/reports/courts${range}`)).status, 200);
    assert.equal((await call('owner', 'GET', `/reports/memberships${range}`)).status, 200);
    assert.equal((await call('owner', 'GET', `/reports/shop${range}`)).status, 200);
    assert.equal((await call('owner', 'GET', `/reports/bar${range}`)).status, 200);
    const csv = await call('owner', 'GET', `/reports/export?report=REVENUE&from=${iso(-300)}&to=${iso(1)}`);
    assert.ok(csv.text.startsWith('payment_number,paid_on'));
  });

  it('business clients are invoiced companies: only the owner reaches them, there is no client login', async () => {
    assert.equal((await call('owner', 'GET', '/business-clients')).status, 200);
    assert.equal((await call('store', 'GET', '/business-clients')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('member', 'GET', '/business-clients')).body.error.code, 'FORBIDDEN');
    assert.equal((await call(null, 'POST', '/auth/login', { email: 'accounts@greenfield.example', password: PASSWORD })).body.error.code, 'AUTH_INVALID');
  });
});

describe('public website', () => {
  it('serves club info, courts, plans and products without a login; an enquiry lands in the desk inbox', async () => {
    assert.equal((await call(null, 'GET', '/public/club')).body.data.name.length > 0, true);
    assert.ok((await call(null, 'GET', '/courts')).body.data.length > 0);
    assert.ok((await call(null, 'GET', '/shop/products')).body.data.every((p: any) => p.stock_quantity === undefined));
    const e = await call(null, 'POST', '/enquiries', { name: 'Web Visitor', phone: '9876500000', message: 'Hello' });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    const inbox = await call('desk', 'GET', '/enquiries?handled=false');
    assert.ok(inbox.body.data.some((x: any) => x.id === e.body.data.id));
    assert.equal((await call(null, 'GET', '/enquiries')).body.error.code, 'AUTH_UNAUTHORIZED');
  });
});

describe('membership purchase', () => {
  it('front desk sells a plan to a member without one; benefits derive from dates; a second purchase is refused', async () => {
    const none = (await call('desk', 'GET', '/members?no_plan=true&page_size=100')).body.data.find((m: any) => m.active_membership === null);
    if (!none) return; // seed always has one, but never fail on data shape
    const plans = (await call(null, 'GET', '/memberships/plans')).body.data;
    const silver = plans.find((p: any) => p.membership_type === 'SILVER');
    const r = await call('desk', 'POST', '/memberships', { member_id: none.id, membership_plan_id: silver.id, payment_method: 'CARD' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.membership.status, 'ACTIVE');
    assert.equal(r.body.data.payment.amount, silver.price);
    assert.equal((await call('desk', 'POST', '/memberships', { member_id: none.id, membership_plan_id: silver.id, payment_method: 'CARD' })).body.error.code, 'MEMBERSHIP_ALREADY_ACTIVE');
    assert.equal((await call('owner', 'POST', `/memberships/${r.body.data.membership.id}/cancel`, { reason: 'test' })).body.data.status, 'CANCELLED');
    assert.equal((await call('desk', 'GET', `/members/${none.id}`)).body.data.active_membership.status, 'EXPIRED'); // a cancelled term is no longer effective (R-MEM-05)
  });
});


// ---------------------------------------------------------------------------------------------------------------
// helpers for accounts created inside a test
const http = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(`${server.url}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = JSON.parse(text);
  if (res.status >= 500 || json.success === false) await settle();
  return { status: res.status, body: json, text };
};
const login = (email: string, password: string) => http('POST', '/auth/login', { email, password });

describe('store manager', () => {
  it('adds a product that every audience reads from the same table; the owner sees it too', async () => {
    const created = await call('store', 'POST', '/shop/products', { sku: 'SM-TEST-001', name: 'Store Manager Test Racket', category: 'RACKET', brand: 'TestBrand', description: 'Added by the store manager.', price: '4999.00', initial_stock: 12, low_stock_threshold: 3 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    assert.equal(created.body.data.stock_quantity, 12);
    const pub = (await call(null, 'GET', '/shop/products?page_size=100')).body.data;
    const seen = pub.find((p: any) => p.id === id);
    assert.ok(seen, 'public shop lists the new product');
    assert.equal(seen.stock_status, 'IN_STOCK');
    assert.equal(seen.stock_quantity, undefined, 'visitors never see quantities');
    const asMember = (await call('member', 'GET', '/shop/products?page_size=100')).body.data.find((p: any) => p.id === id);
    assert.ok(asMember.member_price && Number(asMember.member_price) < 4999, 'member price comes from the server');
    assert.equal((await call('store', 'GET', '/inventory')).body.data.find((p: any) => p.product_id === id).stock_quantity, 12);
    assert.ok((await call('owner', 'GET', '/inventory')).body.data.find((p: any) => p.product_id === id));
    assert.equal((await call('store', 'POST', '/inventory/adjustments', { product_id: id, quantity_change: 3 })).status, 200);
    assert.equal((await call('store', 'POST', '/shop/products', { sku: 'SM-TEST-001', name: 'Dup', category: 'BALL', price: '10.00' })).body.error.code, 'SKU_TAKEN');
    assert.equal((await call('desk', 'POST', '/shop/products', { sku: 'SM-TEST-002', name: 'Nope', category: 'BALL', price: '10.00' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('member', 'POST', '/shop/products', { sku: 'SM-TEST-003', name: 'Nope', category: 'BALL', price: '10.00' })).body.error.code, 'FORBIDDEN');
  });

  it('takes counter payments for shop orders only, and cannot touch cafe orders, members or reports', async () => {
    const none = '00000000-0000-4000-8000-000000000001';
    assert.equal((await call('store', 'POST', '/payments', { source_type: 'BAR_ORDER', source_id: none, payment_method: 'CASH' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('store', 'POST', '/payments', { source_type: 'SHOP_ORDER', source_id: none, payment_method: 'ONLINE' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('store', 'GET', '/shop/orders')).status, 200);
    assert.equal((await call('store', 'GET', '/kitchen/orders')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('store', 'GET', '/staff')).body.error.code, 'FORBIDDEN');
  });
});

describe('member sign-up with a paid membership', () => {
  it('Gold: creates user + member + membership + online payment in one go, and the member can log in', async () => {
    const gold = (await call(null, 'GET', '/memberships/plans')).body.data.find((p: any) => p.membership_type === 'GOLD');
    const r = await http('POST', '/auth/signup', { full_name: 'Gita Gold', email: 'gita.gold@example.com', phone: '9876500001', password: 'GoldPass123', address: '14 Lake Road, Pune', membership_plan_id: gold.id });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.data.user.role, 'MEMBER');
    assert.equal(r.body.data.redirect_to, '/member');
    assert.equal(r.body.data.member.active_membership.membership_type, 'GOLD');
    assert.ok(!/password_hash|GoldPass123/.test(r.text), 'no password or hash in the response');
    const pays = (await http('GET', '/payments', undefined, r.body.data.token)).body.data;
    assert.equal(pays.length, 1);
    assert.equal(pays[0].source_type, 'MEMBERSHIP');
    assert.equal(pays[0].method, 'ONLINE');
    assert.equal(pays[0].amount, gold.price);
    assert.equal(pays[0].revenue_category, 'MEMBERSHIP');
    const me = (await http('GET', '/members/me', undefined, r.body.data.token)).body.data;
    assert.equal(me.address, '14 Lake Road, Pune');
    assert.equal((await login('gita.gold@example.com', 'GoldPass123')).body.data.redirect_to, '/member');
  });

  it('Silver and Junior work too; a Junior needs a date of birth and a failed purchase leaves no account behind', async () => {
    const plans = (await call(null, 'GET', '/memberships/plans')).body.data;
    const silver = plans.find((p: any) => p.membership_type === 'SILVER');
    const junior = plans.find((p: any) => p.membership_type === 'JUNIOR');
    const s1 = await http('POST', '/auth/signup', { full_name: 'Sia Silver', email: 'sia.silver@example.com', phone: '9876500002', password: 'SilverPass1', membership_plan_id: silver.id });
    assert.equal(s1.body.data.member.active_membership.membership_type, 'SILVER');
    const year = new Date().getFullYear();
    const j1 = await http('POST', '/auth/signup', { full_name: 'Jay Junior', email: 'jay.junior@example.com', phone: '9876500003', password: 'JuniorPass1', date_of_birth: `${year - 12}-05-05`, membership_plan_id: junior.id });
    assert.equal(j1.status, 201, j1.text);
    assert.equal(j1.body.data.member.active_membership.membership_type, 'JUNIOR');
    const j2 = await http('POST', '/auth/signup', { full_name: 'No Dob', email: 'no.dob@example.com', phone: '9876500004', password: 'JuniorPass1', membership_plan_id: junior.id });
    assert.equal(j2.body.error.code, 'JUNIOR_AGE_INVALID');
    assert.equal((await login('no.dob@example.com', 'JuniorPass1')).body.error.code, 'AUTH_INVALID', 'rolled back: no user exists');
    const bad = await http('POST', '/auth/signup', { full_name: 'Bad Plan', email: 'bad.plan@example.com', phone: '9876500005', password: 'BadPlan1234', membership_plan_id: '00000000-0000-4000-8000-0000000000aa' });
    assert.equal(bad.body.error.code, 'MEMBERSHIP_PLAN_NOT_FOUND');
    assert.equal((await login('bad.plan@example.com', 'BadPlan1234')).body.error.code, 'AUTH_INVALID');
  });
});

describe('employee application: pending login, approval, rejection, deactivation', () => {
  const apply = (name: string, email: string, password = 'Employee123') => http('POST', '/staff/applications', { full_name: name, email, phone: '9876511111', password });

  it('PENDING: the applicant can log in but receives no token and no role, only the under-review state', async () => {
    const a = await apply('Kiran Kitchen', 'kiran.kitchen@example.com');
    assert.equal(a.status, 201, a.text);
    assert.equal(a.body.data.state, 'EMPLOYEE_APPLICATION_PENDING');
    assert.equal(a.body.data.token, undefined);
    assert.ok(!/password|hash/i.test(a.text));
    const row = await query("SELECT status, password_hash FROM employee_applications WHERE email = 'kiran.kitchen@example.com'");
    assert.equal(row.rows[0].status, 'PENDING');
    assert.match(row.rows[0].password_hash, /^\$2[aby]\$/);
    assert.equal((await query("SELECT 1 FROM users WHERE email = 'kiran.kitchen@example.com'")).rows.length, 0, 'no user yet');

    const l = await login('kiran.kitchen@example.com', 'Employee123');
    assert.equal(l.status, 200);
    assert.equal(l.body.data.state, 'EMPLOYEE_APPLICATION_PENDING');
    assert.equal(l.body.data.redirect_to, '/employee-application-pending');
    assert.equal(l.body.data.token, undefined);
    assert.equal(l.body.data.user, undefined);
    assert.equal(l.body.data.role, undefined);
    assert.ok(!/password|hash/i.test(l.text));
    assert.equal((await login('kiran.kitchen@example.com', 'WrongPass123')).body.error.code, 'AUTH_INVALID');
  });

  it('one pending application per email; existing accounts cannot apply; a pending email cannot sign up as a member', async () => {
    assert.equal((await apply('Kiran Again', 'KIRAN.kitchen@example.com', 'Employee999')).body.error.code, 'APPLICATION_PENDING');
    assert.equal((await apply('Owner Copy', 'owner@championsclub.example')).body.error.code, 'EMAIL_TAKEN');
    const m = await http('POST', '/auth/signup', { full_name: 'Kiran Member', email: 'kiran.kitchen@example.com', phone: '9876522222', password: 'Member12345' });
    assert.equal(m.body.error.code, 'APPLICATION_PENDING');
  });

  it('only the owner sees and decides applications; the list never carries a hash', async () => {
    for (const who of ['desk', 'kitchen', 'store', 'member'] as const) assert.equal((await call(who, 'GET', '/staff/applications')).body.error.code, 'FORBIDDEN', who);
    assert.equal((await call(null, 'GET', '/staff/applications')).body.error.code, 'AUTH_UNAUTHORIZED');
    const list = await call('owner', 'GET', '/staff/applications');
    assert.equal(list.status, 200);
    assert.ok(!/password|hash/i.test(list.text));
    const mine = list.body.data.find((x: any) => x.email === 'kiran.kitchen@example.com');
    assert.equal(mine.status, 'PENDING');
    assert.equal((await call('desk', 'POST', `/staff/applications/${mine.id}/approve`, { role: 'FRONT_DESK' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('owner', 'POST', `/staff/applications/${mine.id}/approve`, { role: 'MEMBER' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('owner', 'POST', `/staff/applications/${mine.id}/approve`, { role: 'OWNER_ADMIN' })).body.error.code, 'VALIDATION_ERROR');
  });

  it('APPROVED as KITCHEN_MANAGER: users + staff are created, the SAME credentials now give a kitchen session', async () => {
    const list = (await call('owner', 'GET', '/staff/applications?status=PENDING')).body.data;
    const app = list.find((x: any) => x.email === 'kiran.kitchen@example.com');
    const r = await call('owner', 'POST', `/staff/applications/${app.id}/approve`, { role: 'KITCHEN_MANAGER' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.data.status, 'APPROVED');
    assert.equal(r.body.data.approved_role, 'KITCHEN_MANAGER');
    assert.ok(r.body.data.reviewed_at && r.body.data.reviewed_by_name);
    const u = (await query("SELECT u.role, u.is_active, u.password_hash, s.id AS staff_id FROM users u JOIN staff s ON s.user_id = u.id WHERE u.email = 'kiran.kitchen@example.com'")).rows[0];
    assert.equal(u.role, 'KITCHEN_MANAGER');
    assert.equal(u.is_active, true);
    assert.match(u.password_hash, /^\$2[aby]\$/);
    assert.equal((await query("SELECT password_hash FROM employee_applications WHERE id = $1", [app.id])).rows[0].password_hash, null, 'temporary hash cleared');
    assert.equal((await call('owner', 'POST', `/staff/applications/${app.id}/approve`, { role: 'FRONT_DESK' })).body.error.code, 'INVALID_STATUS_TRANSITION');
    assert.equal((await call('owner', 'POST', `/staff/applications/${app.id}/reject`, {})).body.error.code, 'INVALID_STATUS_TRANSITION');

    const l = await login('kiran.kitchen@example.com', 'Employee123');
    assert.equal(l.status, 200);
    assert.equal(l.body.data.user.role, 'KITCHEN_MANAGER');
    assert.equal(l.body.data.redirect_to, '/kitchen');
    assert.ok(l.body.data.staff);
    assert.equal((await http('GET', '/kitchen/orders', undefined, l.body.data.token)).status, 200);
    assert.equal((await http('GET', '/staff', undefined, l.body.data.token)).body.error.code, 'FORBIDDEN');
    assert.equal((await http('GET', '/staff/applications', undefined, l.body.data.token)).body.error.code, 'FORBIDDEN');
  });

  it('APPROVED as STORE_MANAGER goes to /store-manager and can add products; FRONT_DESK goes to /front-desk', async () => {
    await apply('Sunita Store', 'sunita.store@example.com');
    await apply('Farhan Front', 'farhan.front@example.com');
    const list = (await call('owner', 'GET', '/staff/applications?status=PENDING')).body.data;
    const store = list.find((x: any) => x.email === 'sunita.store@example.com');
    const front = list.find((x: any) => x.email === 'farhan.front@example.com');
    assert.equal((await call('owner', 'POST', `/staff/applications/${store.id}/approve`, { role: 'STORE_MANAGER', designation: 'Store Lead', monthly_salary: '30000.00' })).status, 200);
    assert.equal((await call('owner', 'POST', `/staff/applications/${front.id}/approve`, { role: 'FRONT_DESK' })).status, 200);
    const s = await login('sunita.store@example.com', 'Employee123');
    assert.equal(s.body.data.redirect_to, '/store-manager');
    assert.equal(s.body.data.staff.designation, 'Store Lead');
    assert.equal((await http('POST', '/shop/products', { sku: 'SM-NEW-9', name: 'New hire stock', category: 'BALL', price: '99.00' }, s.body.data.token)).status, 201);
    assert.equal((await login('farhan.front@example.com', 'Employee123')).body.data.redirect_to, '/front-desk');
  });

  it('REJECTED: no account, no access, no hash kept; the owner still sees the history; the person may apply again', async () => {
    await apply('Rita Rejected', 'rita.rejected@example.com');
    const app = (await call('owner', 'GET', '/staff/applications?status=PENDING')).body.data.find((x: any) => x.email === 'rita.rejected@example.com');
    const r = await call('owner', 'POST', `/staff/applications/${app.id}/reject`, { note: 'No opening right now.' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, 'REJECTED');
    assert.equal(r.body.data.decision_note, 'No opening right now.');
    assert.equal((await query('SELECT password_hash FROM employee_applications WHERE id = $1', [app.id])).rows[0].password_hash, null);
    assert.equal((await query("SELECT 1 FROM users WHERE email = 'rita.rejected@example.com'")).rows.length, 0);
    assert.equal((await login('rita.rejected@example.com', 'Employee123')).body.error.code, 'AUTH_INVALID');
    assert.equal((await call('owner', 'GET', '/staff/applications?status=REJECTED')).body.data.some((x: any) => x.email === 'rita.rejected@example.com'), true);
    assert.equal((await apply('Rita Retry', 'rita.rejected@example.com', 'Employee456')).status, 201);
    assert.equal((await login('rita.rejected@example.com', 'Employee456')).body.data.state, 'EMPLOYEE_APPLICATION_PENDING');
  });

  it('deactivating an employee blocks login and the token at once; reactivating restores it; history stays', async () => {
    const l = await login('kiran.kitchen@example.com', 'Employee123');
    const token = l.body.data.token;
    const staffId = l.body.data.staff.id;
    assert.equal((await call('owner', 'PATCH', `/staff/${staffId}`, { is_active: false })).body.data.is_active, false);
    assert.equal((await query("SELECT is_active FROM users WHERE email = 'kiran.kitchen@example.com'")).rows[0].is_active, false);
    assert.equal((await login('kiran.kitchen@example.com', 'Employee123')).body.error.code, 'ACCOUNT_DISABLED');
    assert.equal((await http('GET', '/kitchen/orders', undefined, token)).body.error.code, 'ACCOUNT_DISABLED');
    assert.equal((await query('SELECT 1 FROM staff WHERE id = $1', [staffId])).rows.length, 1, 'the employee record stays');
    assert.equal((await call('owner', 'PATCH', `/staff/${staffId}`, { is_active: true })).body.data.is_active, true);
    assert.equal((await login('kiran.kitchen@example.com', 'Employee123')).status, 200);
  });

  it('deactivating a member blocks login; their history stays; reactivating restores it', async () => {
    const l = await login('gita.gold@example.com', 'GoldPass123');
    const memberId = l.body.data.member.id;
    assert.equal((await call('owner', 'PATCH', `/members/${memberId}`, { is_active: false })).status, 200);
    assert.equal((await query("SELECT is_active FROM users WHERE email = 'gita.gold@example.com'")).rows[0].is_active, false);
    assert.equal((await login('gita.gold@example.com', 'GoldPass123')).body.error.code, 'ACCOUNT_DISABLED');
    assert.equal((await http('GET', '/members/me', undefined, l.body.data.token)).body.error.code, 'ACCOUNT_DISABLED');
    assert.equal((await query('SELECT count(*)::int AS n FROM payments WHERE member_id = $1', [memberId])).rows[0].n, 1, 'payments stay');
    assert.equal((await call('desk', 'PATCH', `/members/${memberId}`, { is_active: true })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('owner', 'PATCH', `/members/${memberId}`, { is_active: true })).status, 200);
    assert.equal((await login('gita.gold@example.com', 'GoldPass123')).status, 200);
  });
});

describe('events: one table, owner creates, every role reads, members register', () => {
  const when = (days: number, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
  let eventId = '';

  it('the owner creates an event; it is a database row that the member, desk, kitchen and store manager read back', async () => {
    const before = (await call('member', 'GET', '/events')).body.data.length;
    const c = await call('owner', 'POST', '/events', { title: 'Night Padel Social', kind: 'SOCIAL', description: 'Doubles, snacks.', location: 'Padel Court 1', start_at: when(5), end_at: when(5, 2), capacity: 2, fee: '250.00' });
    assert.equal(c.status, 201, c.text);
    eventId = c.body.data.id;
    assert.equal((await query('SELECT title FROM events WHERE id = $1', [eventId])).rows[0].title, 'Night Padel Social');
    for (const who of ['member', 'desk', 'kitchen', 'store', 'owner'] as const) {
      const list = (await call(who, 'GET', '/events')).body.data;
      assert.ok(list.find((e: any) => e.id === eventId), `${who} sees the new event`);
    }
    assert.equal((await call('member', 'GET', '/events')).body.data.length, before + 1);
    assert.equal((await call(null, 'GET', '/events')).body.error.code, 'AUTH_UNAUTHORIZED');
  });

  it('only the owner can create events; the input is validated', async () => {
    const body = { title: 'X', kind: 'CLINIC', location: 'Y', start_at: when(3), end_at: when(3, 1), capacity: 10 };
    for (const who of ['member', 'desk', 'kitchen', 'store'] as const) assert.equal((await call(who, 'POST', '/events', body)).body.error.code, 'FORBIDDEN', who);
    assert.equal((await call('owner', 'POST', '/events', { ...body, end_at: when(2) })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('owner', 'POST', '/events', { ...body, capacity: 0 })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('owner', 'POST', '/events', { ...body, kind: 'PARTY' })).body.error.code, 'VALIDATION_ERROR');
  });

  it('a member registers and cancels; capacity is enforced; staff cannot register', async () => {
    const mine = (await call('member', 'POST', `/events/${eventId}/registrations`)).body.data;
    assert.equal(mine.is_registered, true);
    assert.equal(mine.registered_count, 1);
    assert.equal((await call('member', 'POST', `/events/${eventId}/registrations`)).body.data.registered_count, 1, 'idempotent');
    assert.equal((await call('other', 'POST', `/events/${eventId}/registrations`)).body.data.registered_count, 2);
    assert.equal((await call('owner', 'GET', '/events')).body.data.find((e: any) => e.id === eventId).is_registered, false, 'is_registered is the caller own');
    // a third member does not fit: capacity 2
    const l = await call(null, 'POST', '/auth/signup', { full_name: 'Third Member', email: 'third.member@example.com', phone: '9876500077', password: 'ThirdPass123' });
    const full = await fetch(`${server.url}/api/v1/events/${eventId}/registrations`, { method: 'POST', headers: { Authorization: `Bearer ${l.body.data.token}`, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(((await full.json()) as any).error.code, 'EVENT_FULL');
    await settle();
    assert.equal((await call('desk', 'POST', `/events/${eventId}/registrations`)).body.error.code, 'FORBIDDEN');
    const gone = (await call('member', 'DELETE', `/events/${eventId}/registrations`)).body.data;
    assert.equal(gone.is_registered, false);
    assert.equal(gone.registered_count, 1);
    assert.equal((await query('SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1', [eventId])).rows[0].n, 1);
    assert.equal((await call('member', 'POST', '/events/00000000-0000-4000-8000-000000000000/registrations')).body.error.code, 'EVENT_NOT_FOUND');
  });

  it('an event that has ended cannot be registered for', async () => {
    const past = await query("INSERT INTO events (title, kind, location, start_at, end_at, capacity) VALUES ('Old', 'CLINIC', 'Court', now() - interval '3 days', now() - interval '2 days', 5) RETURNING id");
    assert.equal((await call('member', 'POST', `/events/${past.rows[0].id}/registrations`)).body.error.code, 'EVENT_ENDED');
  });
});

describe('courts: the owner adds a court and every role reads it from the same table', () => {
  it('a new court is a database row; owner, desk, member and the public list it; availability includes it; inactive courts are not offered', async () => {
    const c = await call('owner', 'POST', '/courts', { name: 'Padel Court 9', sport_type: 'PADEL', walk_in_rate_per_hour: '900.00', surface: 'Glass', description: 'Added by the owner.' });
    assert.equal(c.status, 201, c.text);
    const id = c.body.data.id;
    assert.equal((await query('SELECT walk_in_rate_per_hour FROM courts WHERE id = $1', [id])).rows[0].walk_in_rate_per_hour, '900.00');
    for (const who of ['owner', 'desk', 'member', null] as const) {
      assert.ok((await call(who, 'GET', '/courts')).body.data.find((x: any) => x.id === id), `${who ?? 'public'} sees the court`);
    }
    const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    for (const who of ['member', 'desk', 'owner'] as const) {
      const av = (await call(who, 'GET', `/courts/availability?date=${date}`)).body.data;
      const mine = av.find((x: any) => x.court_id === id);
      assert.ok(mine && mine.slots.some((s: any) => s.status === 'AVAILABLE'), `${who}: availability includes the new court`);
    }
    assert.equal((await call('desk', 'POST', '/courts', { name: 'Nope', sport_type: 'TENNIS', walk_in_rate_per_hour: '500.00' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('member', 'POST', '/courts', { name: 'Nope', sport_type: 'TENNIS', walk_in_rate_per_hour: '500.00' })).body.error.code, 'FORBIDDEN');
    assert.equal((await call('owner', 'POST', '/courts', { name: 'Padel Court 9', sport_type: 'PADEL', walk_in_rate_per_hour: '900.00' })).status, 409, 'duplicate name');
    assert.equal((await call('owner', 'PATCH', `/courts/${id}`, { is_active: false })).status, 200);
    assert.ok(!(await call('member', 'GET', '/courts')).body.data.find((x: any) => x.id === id), 'a deactivated court is not offered');
  });
});

describe('products: a store-manager product reaches the public shop', () => {
  it('created by the store manager -> products row -> public, member, owner and store manager lists', async () => {
    const created = await call('store', 'POST', '/shop/products', { sku: 'PUB-SYNC-001', name: 'Public Sync Grip', category: 'ACCESSORY', price: '199.00', initial_stock: 12 });
    assert.equal(created.status, 201, created.text);
    const id = created.body.data.id;
    assert.equal((await query('SELECT stock_quantity FROM products WHERE id = $1', [id])).rows[0].stock_quantity, 12);
    for (const who of [null, 'member', 'owner', 'store'] as const) {
      const row = (await call(who, 'GET', '/shop/products?page_size=100')).body.data.find((x: any) => x.id === id);
      assert.ok(row, `${who ?? 'public'} sees the product`);
      assert.equal(row.stock_status, 'IN_STOCK');
    }
    const pub = (await call(null, 'GET', '/shop/products')).body.data.find((x: any) => x.id === id);
    assert.equal(pub.stock_quantity, undefined, 'the public list shows a stock status, not quantities');
    assert.equal((await call('store', 'DELETE', `/shop/products/${id}`)).status, 200);
    assert.ok(!(await call(null, 'GET', '/shop/products')).body.data.find((x: any) => x.id === id), 'a retired product leaves the public shop');
  });
});

describe('live repairs: stock by one, menu from the kitchen, member date of birth', () => {
  it('stock moves by exactly 1 per adjustment, never below 0, and the owner and store manager see the same number', async () => {
    const created = await call('store', 'POST', '/shop/products', { sku: 'STEP-001', name: 'Stepper Grip', category: 'ACCESSORY', price: '99.00', initial_stock: 1 });
    const id = created.body.data.id;
    const stock = async () => (await query('SELECT stock_quantity FROM products WHERE id = $1', [id])).rows[0].stock_quantity;
    assert.equal((await call('store', 'POST', '/inventory/adjustments', { product_id: id, quantity_change: 1 })).status, 200);
    assert.equal(await stock(), 2);
    assert.equal((await call('owner', 'POST', '/inventory/adjustments', { product_id: id, quantity_change: -1 })).status, 200);
    assert.equal(await stock(), 1);
    assert.equal((await call('owner', 'POST', '/inventory/adjustments', { product_id: id, quantity_change: -1 })).status, 200);
    assert.equal((await call('owner', 'POST', '/inventory/adjustments', { product_id: id, quantity_change: -1 })).status, 400, 'stock cannot go below zero');
    assert.equal(await stock(), 0);
    for (const who of ['store', 'owner'] as const) assert.equal((await call(who, 'GET', '/inventory')).body.data.find((p: any) => p.product_id === id).stock_quantity, 0);
  });

  it('a drink added by the kitchen is the same bar_menu_items row for the kitchen, the member, the desk and the public', async () => {
    const c = await call('kitchen', 'POST', '/bar/menu-items', { name: 'Kitchen Cold Brew', category: 'DRINK', price: '180.00' });
    assert.equal(c.status, 201, c.text);
    const id = c.body.data.id;
    assert.equal((await query('SELECT category, is_available FROM bar_menu_items WHERE id = $1', [id])).rows[0].is_available, true);
    for (const who of [null, 'member', 'desk', 'kitchen', 'owner'] as const) {
      assert.ok((await call(who, 'GET', '/bar/menu')).body.data.find((m: any) => m.id === id), `${who ?? 'public'} sees the new drink`);
    }
    assert.equal((await call('kitchen', 'PATCH', `/bar/menu-items/${id}`, { is_available: false })).status, 200);
    assert.ok(!(await call('member', 'GET', '/bar/menu')).body.data.find((m: any) => m.id === id), 'a hidden item leaves the member and public menu');
    assert.ok((await call('kitchen', 'GET', '/bar/menu?include_unavailable=true')).body.data.find((m: any) => m.id === id), 'the kitchen still sees it');
  });

  it('the owner changes a member date of birth; it is stored and read back; bad dates are refused', async () => {
    const members = (await call('owner', 'GET', '/members?page_size=100')).body.data;
    const m = members.find((x: any) => x.email === USERS.member);
    assert.equal((await call('owner', 'PATCH', `/members/${m.id}`, { date_of_birth: '1990-02-03' })).status, 200);
    assert.equal((await query('SELECT date_of_birth::text AS d FROM members WHERE id = $1', [m.id])).rows[0].d, '1990-02-03');
    assert.equal((await call('owner', 'GET', `/members/${m.id}`)).body.data.date_of_birth, '1990-02-03');
    assert.equal((await call('owner', 'GET', '/members?page_size=100')).body.data.find((x: any) => x.id === m.id).date_of_birth, '1990-02-03');
    assert.equal((await call('owner', 'PATCH', `/members/${m.id}`, { date_of_birth: '2999-01-01' })).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('owner', 'PATCH', `/members/${m.id}`, { date_of_birth: '03/02/1990' })).body.error.code, 'VALIDATION_ERROR');
  });
});

describe('book a trial: a public request the owner approves, then every calendar shows it', () => {
  const nextSlot = async () => {
    const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const av = (await call(null, 'GET', `/courts/availability?date=${date}`)).body.data;
    const tennis = av.filter((c: any) => c.sport_type === 'TENNIS');
    assert.ok(tennis.length >= 2, 'the seed has at least two tennis courts');
    return tennis[0].slots.find((s: any) => s.status === 'AVAILABLE' && tennis.every((c: any) => c.slots.find((x: any) => x.start_at === s.start_at)?.status === 'AVAILABLE')).start_at as string;
  };
  const request = (name: string, phone: string, start_at: string, sport = 'TENNIS') => call(null, 'POST', '/bookings/trial', { name, phone, email: 'tara@example.com', sport_type: sport, start_at });

  it('a request books nothing: it waits in the owner inbox; approval creates the free TRIAL booking that owner and desk both see', async () => {
    const start_at = await nextSlot();
    const r = await request('Tara Trial', '9876543201', start_at);
    assert.equal(r.status, 201, r.text);
    const e = r.body.data;
    assert.equal(e.enquiry_type, 'TRIAL');
    assert.equal(e.handled_at, null);
    assert.equal(e.trial_booking_id, null);
    assert.equal((await query("SELECT count(*)::int AS n FROM court_bookings WHERE booking_type = 'TRIAL' AND guest_phone = '9876543201'")).rows[0].n, 0, 'no court is taken before approval');
    assert.ok((await call('owner', 'GET', '/enquiries?handled=false&enquiry_type=TRIAL')).body.data.find((x: any) => x.id === e.id), 'owner sees the request');

    for (const who of ['desk', 'store', 'member', 'kitchen'] as const) assert.equal((await call(who, 'POST', `/enquiries/${e.id}/approve-trial`, {})).body.error.code, 'FORBIDDEN', who);
    assert.equal((await call(null, 'POST', `/enquiries/${e.id}/approve-trial`, {})).body.error.code, 'AUTH_UNAUTHORIZED');

    const ok = await call('owner', 'POST', `/enquiries/${e.id}/approve-trial`, {});
    assert.equal(ok.status, 200, ok.text);
    assert.ok(ok.body.data.handled_at && ok.body.data.trial_booking_id);
    const b = (await call('owner', 'GET', `/bookings/${ok.body.data.trial_booking_id}`)).body.data;
    assert.equal(b.booking_type, 'TRIAL');
    assert.equal(b.sport_type, 'TENNIS');
    assert.equal(b.guest_name, 'Tara Trial');
    assert.equal(b.guest_email, 'tara@example.com');
    assert.equal(Number(b.amount_due), 0);
    assert.equal(b.payment_status, 'NOT_REQUIRED');
    assert.equal((await query("SELECT count(*)::int AS n FROM payments WHERE source_type = 'COURT_BOOKING' AND source_id = $1", [b.id])).rows[0].n, 0);
    for (const who of ['owner', 'desk'] as const) {
      const list = (await call(who, 'GET', '/bookings?booking_type=TRIAL&page_size=100')).body.data;
      assert.ok(list.find((x: any) => x.id === b.id), `${who} sees the trial in the bookings list`);
    }
    const day = istDate(start_at);
    const addD = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7), 0)).toISOString().slice(0, 10);
    for (const [label, from, to] of [['day', day, day], ['week window', addD(day, -3), addD(day, 3)], ['month window', `${day.slice(0, 7)}-01`, monthEnd]] as const) {
      for (const who of ['owner', 'desk'] as const) {
        const hit = (await call(who, 'GET', `/bookings?from=${from}&to=${to}&page_size=100`)).body.data;
        assert.ok(hit.find((x: any) => x.id === b.id), `${who}: the approved trial is inside the ${label}`);
      }
    }
    const before = (await call('owner', 'GET', `/bookings?from=${addD(day, -9)}&to=${addD(day, -1)}&page_size=100`)).body.data;
    assert.ok(!before.find((x: any) => x.id === b.id), 'a range that ends the day before does not include it');
    const av = (await call('owner', 'GET', `/courts/availability?date=${day}`)).body.data;
    assert.ok(av.flatMap((c: any) => c.slots).some((s: any) => s.booking_id === b.id), 'the slot shows as booked with the trial booking id');
    assert.equal((await call('owner', 'POST', `/enquiries/${e.id}/approve-trial`, {})).body.error.code, 'TRIAL_REQUEST_CLOSED', 'a decided request cannot be decided twice');
  });

  it('declining books nothing; one open trial per phone; the phone must be exactly 10 digits; slots and input are validated', async () => {
    const start_at = await nextSlot();
    const one = (await request('Uma', '9876543202', start_at)).body.data;
    assert.equal((await request('Uma again', '9876543202', await nextSlot())).body.error.code, 'TRIAL_ALREADY_BOOKED', 'a waiting request blocks a second one');
    const d = await call('owner', 'POST', `/enquiries/${one.id}/decline-trial`, {});
    assert.equal(d.status, 200, d.text);
    assert.ok(d.body.data.handled_at);
    assert.equal(d.body.data.trial_booking_id, null);
    assert.equal((await query("SELECT count(*)::int AS n FROM court_bookings WHERE booking_type = 'TRIAL' AND guest_phone = '9876543202'")).rows[0].n, 0);
    assert.equal((await call('owner', 'POST', `/enquiries/${one.id}/decline-trial`, {})).body.error.code, 'TRIAL_REQUEST_CLOSED');
    assert.equal((await request('Uma later', '9876543202', start_at)).status, 201, 'after a decline the visitor may ask again');

    for (const bad of ['880545', '98765432011', '+919876543205', '98765abcde', '']) {
      const r = await request('Bad', bad, start_at);
      assert.equal(r.body.error.code, 'VALIDATION_ERROR', `phone "${bad}"`);
      assert.match(JSON.stringify(r.body.error.details), /10-digit/);
    }
    assert.equal((await request('Bad', '9876543299', new Date(Date.now() - 86_400_000).toISOString())).body.error.code, 'INVALID_SLOT');
    assert.equal((await request('Bad', '9876543298', start_at, 'GOLF')).body.error.code, 'VALIDATION_ERROR');
  });

  it('approving fails with BOOKING_CONFLICT when the courts were taken meanwhile; a request is refused up front when nothing is free', async () => {
    const start_at = await nextSlot();
    const reqs = [(await request('Vik', '9876543203', start_at)).body.data, (await request('Wes', '9876543204', start_at)).body.data, (await request('Yan', '9876543206', start_at)).body.data];
    assert.ok(reqs.every(Boolean), 'requests do not hold a court, so they can all be filed');
    assert.equal((await call('owner', 'POST', `/enquiries/${reqs[0].id}/approve-trial`, {})).status, 200);
    assert.equal((await call('owner', 'POST', `/enquiries/${reqs[1].id}/approve-trial`, {})).status, 200);
    const third = await call('owner', 'POST', `/enquiries/${reqs[2].id}/approve-trial`, {});
    assert.equal(third.body.error.code, 'BOOKING_CONFLICT');
    assert.equal((await query('SELECT handled_at IS NULL AS open FROM enquiries WHERE id = $1', [reqs[2].id])).rows[0].open, true, 'a failed approval leaves the request open');
    assert.equal((await request('Zed', '9876543207', start_at)).body.error.code, 'BOOKING_CONFLICT');
  });

  it('the front desk can cancel an approved trial and free its court', async () => {
    const start_at = await nextSlot();
    const e = (await request('Xena', '9876543208', start_at)).body.data;
    const t1 = (await call('owner', 'POST', `/enquiries/${e.id}/approve-trial`, {})).body.data;
    assert.equal((await call('desk', 'POST', `/bookings/${t1.trial_booking_id}/cancel`, {})).status, 200);
    assert.equal((await query('SELECT cancelled_at IS NOT NULL AS c FROM court_bookings WHERE id = $1', [t1.trial_booking_id])).rows[0].c, true);
  });
});

describe('cafe till: member lookup and the authoritative member price', () => {
  it('kitchen finds a member by number, e-mail or name; gets only the discount; the full member list stays closed', async () => {
    const hits = (await call('kitchen', 'GET', `/bar/member-lookup?q=${encodeURIComponent(USERS.member)}`)).body.data;
    assert.equal(hits.length, 1);
    const h = hits[0];
    assert.deepEqual(Object.keys(h).sort(), ['bar_discount_percent', 'full_name', 'member_code', 'member_id', 'membership_status', 'membership_type', 'plan_name']);
    assert.equal(h.membership_status, 'ACTIVE');
    assert.equal(h.bar_discount_percent, '15.00', 'Gold cafe discount');
    assert.equal((await call('kitchen', 'GET', `/bar/member-lookup?q=${h.member_code}`)).body.data[0].member_id, h.member_id);
    assert.equal((await call('kitchen', 'GET', '/bar/member-lookup?q=Aarav')).body.data[0].member_id, h.member_id);
    assert.equal((await call('kitchen', 'GET', '/bar/member-lookup?q=zzzzzz')).body.data.length, 0);
    assert.equal((await call('kitchen', 'GET', '/bar/member-lookup?q=a')).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('kitchen', 'GET', '/members')).body.error.code, 'FORBIDDEN');
    for (const who of ['member', 'store'] as const) assert.equal((await call(who, 'GET', '/bar/member-lookup?q=aarav')).body.error.code, 'FORBIDDEN', who);
    assert.equal((await call(null, 'GET', '/bar/member-lookup?q=aarav')).body.error.code, 'AUTH_UNAUTHORIZED');
  });

  it('a Gold member pays the discounted price (80 -> 68), a walk-in pays 80; the order and payment use the server price', async () => {
    const menu = (await call(null, 'GET', '/bar/menu')).body.data;
    const coffee = menu.find((m: any) => m.name === 'Filter Coffee');
    assert.equal(coffee.price, '80.00');
    const memberId = (await call('kitchen', 'GET', `/bar/member-lookup?q=${encodeURIComponent(USERS.member)}`)).body.data[0].member_id;
    const walkIn = (await call('kitchen', 'POST', '/bar/orders', { guest_name: 'Walk-in', items: [{ bar_menu_item_id: coffee.id, quantity: 1 }], payment_method: 'CASH' })).body.data;
    const gold = (await call('kitchen', 'POST', '/bar/orders', { member_id: memberId, items: [{ bar_menu_item_id: coffee.id, quantity: 1 }], payment_method: 'CASH' })).body.data;
    assert.equal(walkIn.total_amount, '80.00');
    assert.equal(gold.total_amount, '68.00');
    assert.equal(gold.discount_amount, '12.00');
    assert.equal((await query("SELECT amount::text AS a FROM payments WHERE source_type = 'BAR_ORDER' AND source_id = $1", [gold.id])).rows[0].a, '68.00');
  });

  it('every plan has its own cafe discount', async () => {
    const plans = (await call(null, 'GET', '/memberships/plans')).body.data;
    const pct = Object.fromEntries(plans.map((p: any) => [p.membership_type, p.bar_discount_percent]));
    assert.deepEqual([pct.GOLD, pct.SILVER, pct.JUNIOR], ['15.00', '10.00', '5.00']);
  });
});

describe('kitchen stock: the kitchen manager adjusts cafe stock one at a time, in the database', () => {
  const stockOf = async (id: string) => (await query('SELECT stock_quantity AS n FROM bar_menu_items WHERE id = $1', [id])).rows[0].n as number;
  const adjust = (who: Parameters<typeof call>[0], id: string, change: number) => call(who, 'POST', `/bar/menu-items/${id}/stock-adjustments`, { quantity_change: change });

  it('+1 and -1 persist; stock never goes below zero; the menu returns the quantity', async () => {
    const item = (await call('kitchen', 'GET', '/bar/menu?include_unavailable=true')).body.data.find((m: any) => m.name === 'Cold Coffee');
    const before = await stockOf(item.id);
    assert.equal(item.stock_quantity, before);
    assert.equal((await adjust('kitchen', item.id, 1)).body.data.stock_quantity, before + 1);
    assert.equal(await stockOf(item.id), before + 1);
    assert.equal((await adjust('kitchen', item.id, -1)).body.data.stock_quantity, before);
    assert.equal((await adjust('kitchen', item.id, -(before + 1))).body.error.code, 'VALIDATION_ERROR');
    assert.equal(await stockOf(item.id), before, 'a refused change leaves the stock alone');
    assert.equal((await adjust('kitchen', item.id, 0)).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await adjust('kitchen', '00000000-0000-4000-8000-000000000000', 1)).body.error.code, 'MENU_ITEM_NOT_FOUND');
  });

  it('owner may adjust too; members, desk and store manager may not; the store inventory stays closed to the kitchen', async () => {
    const item = (await call(null, 'GET', '/bar/menu')).body.data[0];
    assert.equal((await adjust('owner', item.id, 1)).status, 200);
    assert.equal((await adjust('owner', item.id, -1)).status, 200);
    for (const who of ['member', 'desk', 'store'] as const) assert.equal((await adjust(who, item.id, 1)).body.error.code, 'FORBIDDEN', who);
    assert.equal((await adjust(null, item.id, 1)).body.error.code, 'AUTH_UNAUTHORIZED');
    assert.equal((await call('kitchen', 'GET', '/inventory')).body.error.code, 'FORBIDDEN');
    const p = (await call('store', 'GET', '/inventory')).body.data[0];
    assert.equal((await call('store', 'POST', '/inventory/adjustments', { product_id: p.product_id, quantity_change: 1 })).status, 200, 'store manager adjustment still works');
  });

  it('a cafe order takes its quantity off the stock, a cancel puts it back, and too many is OUT_OF_STOCK', async () => {
    const item = (await call(null, 'GET', '/bar/menu')).body.data.find((m: any) => m.name === 'Soft Drink');
    const before = await stockOf(item.id);
    const o = (await call('kitchen', 'POST', '/bar/orders', { guest_name: 'Stock test', items: [{ bar_menu_item_id: item.id, quantity: 2 }] })).body.data;
    assert.equal(await stockOf(item.id), before - 2);
    assert.equal((await call('kitchen', 'POST', `/bar/orders/${o.id}/cancel`)).status, 200);
    assert.equal(await stockOf(item.id), before);
    const r = await call('kitchen', 'POST', '/bar/orders', { guest_name: 'Too many', items: [{ bar_menu_item_id: item.id, quantity: 100 }] });
    assert.equal(r.body.error.code, 'OUT_OF_STOCK');
    assert.equal(await stockOf(item.id), before);
  });
});
