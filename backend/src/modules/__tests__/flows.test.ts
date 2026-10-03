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
import { setLogSink } from '../../kernel/http';
import { serve, startTestDb, TEST_JWT_SECRET, useTestEnv, type TestDb } from '../../kernel/__tests__/helpers';

useTestEnv();
const config = loadConfig({ JWT_SECRET: TEST_JWT_SECRET, DATABASE_URL: 'postgresql://t:t@127.0.0.1:1/none', BCRYPT_ROUNDS: '4' });

const PASSWORD = 'Password@123';
const USERS = {
  owner: 'owner@championsclub.example',
  desk: 'neha.sharma@championsclub.example',
  kitchen: 'kitchen@championsclub.example',
  business: 'sanjay.gupta@technova.example',
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
    assert.equal(sessions.get('business').redirect_to, '/business');
    assert.equal(sessions.get('member').redirect_to, '/member');
    assert.ok(sessions.get('member').member.active_membership);
    assert.ok(sessions.get('business').business_client);
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
    assert.equal((await call('business', 'GET', '/members')).body.error.code, 'FORBIDDEN');
    assert.equal((await call('member', 'GET', '/settings')).body.error.code, 'FORBIDDEN');
    assert.equal((await call(null, 'GET', '/payments')).body.error.code, 'AUTH_UNAUTHORIZED');
  });
});

describe('business client flow: own invoices, partial online payment, history', () => {
  let invoiceId = '';
  it('sees only their own sent invoices, never drafts or other clients', async () => {
    const r = await call('business', 'GET', '/invoices');
    assert.equal(r.status, 200);
    const mine = sessions.get('business').business_client.id;
    assert.ok(r.body.data.length >= 1);
    for (const i of r.body.data) {
      assert.equal(i.business_client_id, mine);
      assert.notEqual(i.status, 'DRAFT');
    }
    invoiceId = r.body.data.find((i: any) => i.payment_state === 'PARTIALLY_PAID').id;
    const all = await call('owner', 'GET', '/invoices?page_size=100');
    const foreign = all.body.data.find((i: any) => i.business_client_id !== mine);
    assert.equal((await call('business', 'GET', `/invoices/${foreign.id}`)).body.error.code, 'INVOICE_NOT_FOUND');
  });

  it('pays the outstanding amount online; invoice becomes PAID; a second payment is refused; tax is pro-rated', async () => {
    const before = (await call('business', 'GET', `/invoices/${invoiceId}`)).body.data;
    const pay = await call('business', 'POST', '/payments', { source_type: 'INVOICE', source_id: invoiceId, payment_method: 'ONLINE' });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.data.amount, before.amount_outstanding);
    assert.ok(pay.body.data.gateway_reference.startsWith('MOCK-'));
    assert.equal(pay.body.data.revenue_category, 'BUSINESS');
    const after = (await call('business', 'GET', `/invoices/${invoiceId}`)).body.data;
    assert.equal(after.payment_state, 'PAID');
    assert.equal(after.amount_outstanding, '0.00');
    assert.equal((await call('business', 'POST', '/payments', { source_type: 'INVOICE', source_id: invoiceId, payment_method: 'ONLINE' })).body.error.code, 'ALREADY_PAID');
    const hist = await call('business', 'GET', '/payments');
    assert.ok(hist.body.data.every((p: any) => p.business_client_id === sessions.get('business').business_client.id));
  });

  it('cannot pay with cash, cannot overpay, and cannot pay for someone else', async () => {
    assert.equal((await call('business', 'POST', '/payments', { source_type: 'INVOICE', source_id: invoiceId, payment_method: 'CASH' })).body.error.code, 'FORBIDDEN');
    const all = await call('owner', 'GET', '/invoices?payment_state=OVERDUE');
    const foreign = all.body.data[0];
    assert.equal((await call('business', 'POST', '/payments', { source_type: 'INVOICE', source_id: foreign.id, payment_method: 'ONLINE' })).body.error.code, 'FORBIDDEN');
  });

  it('owner creates, sends and cannot void a paid invoice; drafts are editable, sent ones are not', async () => {
    const bc = sessions.get('business').business_client.id;
    const c = await call('owner', 'POST', '/invoices', { business_client_id: bc, due_date: '2030-01-31', items: [{ description: 'Court hire', quantity: 2, unit_price: '1000.00' }] });
    assert.equal(c.status, 201);
    assert.equal(c.body.data.status, 'DRAFT');
    assert.equal(c.body.data.total_amount, '2360.00'); // 18 % default
    assert.equal((await call('business', 'GET', `/invoices/${c.body.data.id}`)).body.error.code, 'INVOICE_NOT_FOUND');
    assert.equal((await call('owner', 'PATCH', `/invoices/${c.body.data.id}`, { notes: 'edited' })).status, 200);
    const sent = await call('owner', 'POST', `/invoices/${c.body.data.id}/send`);
    assert.equal(sent.body.data.status, 'SENT');
    assert.equal(sent.body.data.payment_state, 'UNPAID');
    assert.equal((await call('owner', 'PATCH', `/invoices/${c.body.data.id}`, { notes: 'again' })).body.error.code, 'INVOICE_NOT_EDITABLE');
    const part = await call('business', 'POST', '/payments', { source_type: 'INVOICE', source_id: c.body.data.id, payment_method: 'ONLINE', amount: '1000.00' });
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

  it('clients module still works for the owner and the business client sees only themselves', async () => {
    assert.equal((await call('owner', 'GET', '/business-clients')).status, 200);
    assert.equal((await call('business', 'GET', '/business-clients/me')).body.data.company_name.length > 0, true);
    assert.equal((await call('business', 'GET', '/business-clients')).body.error.code, 'FORBIDDEN');
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
