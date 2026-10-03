// Worked request/response examples, built from the real mock-data (so ids/prices match the seed).
// Keyed by endpoint id; an endpoint may have several. Responses are abridged ("…") where long.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/schema.mjs';
import { toPaise, fromPaise, percentOf, taxInclusive } from '../../shared/lib/money.ts';

const load = (t) => JSON.parse(readFileSync(path.join(ROOT, 'mock-data', t + '.json'), 'utf8'));
const users = load('users'), members = load('members'), courts = load('courts'), products = load('products'), menu = load('bar-menu-items');
const memberships = load('memberships'), plans = load('membership-plans'), bookings = load('court-bookings'), tabs = load('bar-tabs'), invoices = load('invoices'), barOrders = load('bar-orders');
const shopOrders = load('shop-orders'), sessions = load('social-sessions'), enquiries = load('enquiries'), tables = load('bar-tables'), payments = load('payments');
const user = (name) => users.find((u) => u.full_name === name);
const member = (name) => members.find((m) => m.user_id === user(name).id);
const court = (name) => courts.find((c) => c.name === name);
const product = (sku) => products.find((p) => p.sku === sku);
const mi = (name) => menu.find((m) => m.name === name);
const plan = (t) => plans.find((p) => p.membership_type === t);

const t1 = court('Tennis Court 1'), aarav = member('Aarav Kapoor'), rohan = member('Rohan Desai');
const nextBooking = bookings.filter((b) => b.booking_type === 'REGULAR' && b.status === 'CONFIRMED' && b.court_id === t1.id).sort((a, b) => b.start_at.localeCompare(a.start_at))[0];
const freeStart = new Date(Date.parse(nextBooking.start_at) + 3 * 86400000).toISOString(); // a later free day, same time
const freeEnd = new Date(Date.parse(freeStart) + 3600000).toISOString();
const taxOf = (due) => fromPaise(taxInclusive(toPaise(due), 18));
const NOW = '2026-10-03T11:45:00.000Z';
const nextNo = (prefix, rows, width, plus = 0) => prefix + String(rows.length + 1 + plus).padStart(width, '0'); // next human-readable number after the seed
const openTab = tabs.find((t) => t.status === 'OPEN' && t.member_id);
const preparing = barOrders.find((o) => o.status === 'PREPARING');
const newOrder = barOrders.find((o) => o.status === 'NEW');
const aaravMs = memberships.find((m) => m.member_id === aarav.id && m.status === 'ACTIVE');
const daysLeft = Math.round((Date.parse(aaravMs.end_date) - Date.parse(NOW.slice(0, 10))) / 86400000);

export const examples = {
  'auth.login': [{
    title: 'Member logs in',
    request: { email: user('Aarav Kapoor').email, password: 'Password@123' },
    response: { success: true, data: { token: 'eyJhbGciOiJIUzI1NiIs…', expires_at: '2026-10-03T19:45:00.000Z', user: { id: user('Aarav Kapoor').id, email: user('Aarav Kapoor').email, role: 'MEMBER', full_name: 'Aarav Kapoor', phone: user('Aarav Kapoor').phone, is_active: true, must_change_password: false, last_login_at: NOW, created_at: '…', updated_at: '…' }, redirect_to: '/member', member: { id: aarav.id, member_code: aarav.member_code, full_name: 'Aarav Kapoor', active_membership: { membership_type: 'GOLD', plan_name: 'Gold Membership', status: 'ACTIVE', end_date: aaravMs.end_date, days_remaining: daysLeft }, '…': '…' }, staff: null, business_client: null } },
  }, {
    title: 'Wrong password', status: 401,
    request: { email: user('Aarav Kapoor').email, password: 'nope' },
    response: { success: false, error: { code: 'AUTH_INVALID', message: 'Invalid email or password.' } },
  }],
  'bookings.price': [{
    title: 'Silver member (50% court discount)',
    request: { query: `?court_id=${t1.id}&start_at=${freeStart}&member_id=${rohan.id}` },
    response: { success: true, data: { court_id: t1.id, start_at: freeStart, end_at: freeEnd, customer_type: 'MEMBER', membership_type: 'SILVER', list_price: '800.00', discount_percent: '50.00', discount_amount: '400.00', amount_due: '400.00', tax_rate: '18.00', tax_amount: taxOf('400.00'), is_free: false, plays_used_today: 0, plays_allowed_per_day: 2 } },
  }],
  'bookings.create': [{
    title: 'Gold member books for free',
    request: { court_id: t1.id, start_at: freeStart },
    response: { success: true, message: 'Booking confirmed.', data: { id: '…', booking_number: nextNo('BK-', bookings, 6), court_id: t1.id, court_name: 'Tennis Court 1', sport_type: 'TENNIS', booking_type: 'REGULAR', status: 'CONFIRMED', customer_type: 'MEMBER', member_id: aarav.id, member_name: 'Aarav Kapoor', start_at: freeStart, end_at: freeEnd, list_price: '800.00', discount_amount: '800.00', amount_due: '0.00', tax_amount: '0.00', payment_status: 'NOT_REQUIRED', '…': '…' } },
  }, {
    title: 'Front desk books a walk-in, paying cash', request: { court_id: t1.id, start_at: freeStart, guest_name: 'Deepak Chawla', guest_phone: '+919844455667', payment_method: 'CASH' },
    response: { success: true, data: { booking_number: nextNo('BK-', bookings, 6, 1), customer_type: 'WALK_IN', guest_name: 'Deepak Chawla', list_price: '800.00', discount_amount: '0.00', amount_due: '800.00', tax_amount: taxOf('800.00'), payment_status: 'PAID', status: 'CONFIRMED', '…': '…' } },
  }, {
    title: 'Slot already taken', status: 409, request: { court_id: t1.id, start_at: nextBooking.start_at },
    response: { success: false, error: { code: 'BOOKING_CONFLICT', message: 'This court is already booked for that time.', details: { court_id: t1.id, start_at: nextBooking.start_at } } },
  }, {
    title: 'Third play in one day', status: 409, request: { court_id: t1.id, start_at: freeStart },
    response: { success: false, error: { code: 'DAILY_BOOKING_LIMIT', message: 'Member has reached the maximum plays allowed per day.', details: { plays_used_today: 2, plays_allowed_per_day: 2, date: freeStart.slice(0, 10) } } },
  }],
  'courts.availability': [{
    title: 'Tennis courts for one day (abridged)', request: { query: `?date=${nextBooking.start_at.slice(0, 10)}&sport_type=TENNIS` },
    response: { success: true, data: [{ court_id: t1.id, court_name: 'Tennis Court 1', sport_type: 'TENNIS', date: nextBooking.start_at.slice(0, 10), slots: [{ start_at: '…T00:30:00.000Z', end_at: '…T01:30:00.000Z', status: 'AVAILABLE', booking_id: null, social_session_id: null, spots_left: null, walk_in_price: '800.00' }, { start_at: nextBooking.start_at, end_at: new Date(Date.parse(nextBooking.start_at) + 3600000).toISOString(), status: 'BOOKED', booking_id: null, social_session_id: null, spots_left: null, walk_in_price: '800.00' }, '…'] }] },
  }],
  'social.join': (() => { const s = sessions.find((x) => x.status === 'OPEN'); return [{
    title: 'Silver member joins a Friday session (pays member fee)', request: { payment_method: 'ONLINE' },
    response: { success: true, data: { id: '…', social_session_id: s.id, member_id: rohan.id, display_name: 'Rohan Desai', status: 'JOINED', fee_amount: '150.00', tax_amount: taxOf('150.00'), payment_status: 'PAID', '…': '…' } },
  }, {
    title: 'Session full', status: 409, request: {}, response: { success: false, error: { code: 'SOCIAL_SESSION_FULL', message: 'This social session is full.' } },
  }]; })(),
  'shop.orderCreate': [{
    title: 'Member orders shoes for pickup (Silver: 10% off)',
    request: { items: [{ product_id: product('SHO-NIK-COURT').id, quantity: 1 }], fulfillment: 'PICKUP', payment_method: 'ONLINE' },
    response: { success: true, data: { order_number: nextNo('SO-', shopOrders, 6), channel: 'ONLINE', fulfillment: 'PICKUP', status: 'PLACED', subtotal: '9495.00', discount_amount: '949.50', delivery_fee: '0.00', tax_amount: taxOf('8545.50'), total_amount: '8545.50', payment_status: 'PAID', items: [{ product_name: 'Nike Court Air Zoom Vapor Shoes', unit_price: '9495.00', quantity: 1, line_total: '9495.00' }], '…': '…' } },
  }, {
    title: 'Out of stock', status: 409, request: { items: [{ product_id: product('SHO-ASI-GELRES').id, quantity: 1 }], fulfillment: 'PICKUP', payment_method: 'ONLINE' },
    response: { success: false, error: { code: 'OUT_OF_STOCK', message: 'Insufficient stock for one or more items.', details: { items: [{ product_id: product('SHO-ASI-GELRES').id, requested: 1, available: 0 }] } } },
  }],
  'bar.orderCreate': [{
    title: 'Front desk takes an order for a Gold member on an open tab (15% auto-discount)',
    request: { bar_tab_id: openTab.id, items: [{ bar_menu_item_id: mi('Protein Shake').id, quantity: 2 }, { bar_menu_item_id: mi('French Fries').id, quantity: 1, notes: 'extra salt' }] },
    response: { success: true, data: { order_number: nextNo('BO-', barOrders, 6), status: 'NEW', table_label: 'Table 3', tab_number: openTab.tab_number, member_name: 'Priya Nair', subtotal: '570.00', discount_amount: '85.50', tax_amount: fromPaise(taxInclusive(toPaise('484.50'), 5)), total_amount: '484.50', payment_status: 'PENDING', items: [{ item_name: 'Protein Shake', unit_price: '220.00', quantity: 2, line_total: '440.00' }, { item_name: 'French Fries', unit_price: '130.00', quantity: 1, line_total: '130.00', notes: 'extra salt' }], '…': '…' } },
  }],
  'kitchen.list': [{
    title: 'Kitchen board (abridged) — no prices, no payment data', request: { query: '?status=NEW,ACCEPTED,PREPARING,READY' },
    response: { success: true, data: [{ id: barOrders.find((o) => o.status === 'PREPARING').id, order_number: barOrders.find((o) => o.status === 'PREPARING').order_number, status: 'PREPARING', table_label: 'Table 5', tab_number: 'TAB-000004', customer_label: 'Imran Qureshi', notes: 'Extra spicy', created_at: '…', ready_at: null, minutes_waiting: 10, items: [{ item_name: 'Chicken Wings (6 pcs)', quantity: 1, notes: null }, { item_name: 'French Fries', quantity: 1, notes: null }] }, '…'] },
  }],
  'kitchen.status': [{
    title: 'Mark an order READY', request: { status: 'READY' },
    response: { success: true, data: { order_number: preparing.order_number, status: 'READY', ready_at: NOW, '…': '…' } },
  }, {
    title: 'Skipping a step', status: 409, request: { status: 'SERVED' },
    response: { success: false, error: { code: 'INVALID_STATUS_TRANSITION', message: 'This status change is not allowed.', details: { from: 'NEW', to: 'SERVED', allowed: ['ACCEPTED', 'CANCELLED'] } } },
  }],
  'bar.tabSettle': [{
    title: 'Settle a tab by card', request: { payment_method: 'CARD' },
    response: { success: true, data: { tab: { tab_number: openTab.tab_number, status: 'SETTLED', subtotal: '…', discount_amount: '…', total_amount: '…', payment_status: 'PAID', '…': '…' }, payment: { payment_number: nextNo('PAY-', payments, 7), source_type: 'TAB', revenue_category: 'BAR', method: 'CARD', status: 'SUCCEEDED', '…': '…' } } },
  }, {
    title: 'Food still in the kitchen', status: 409, request: { payment_method: 'CARD' },
    response: { success: false, error: { code: 'TAB_HAS_ACTIVE_ORDERS', message: 'Tab has orders that are not yet served or cancelled.', details: { order_numbers: [preparing.order_number] } } },
  }],
  'payments.create': (() => { const inv = invoices.find((i) => i.status === 'PARTIALLY_PAID'); return [{
    title: 'Business client pays part of an invoice online', request: { source_type: 'INVOICE', source_id: inv.id, amount: '5000.00', payment_method: 'ONLINE' },
    response: { success: true, data: { payment_number: nextNo('PAY-', payments, 7), source_type: 'INVOICE', source_id: inv.id, revenue_category: 'BUSINESS', amount: '5000.00', tax_amount: fromPaise(Math.round((500000 * toPaise(inv.tax_amount)) / toPaise(inv.total_amount))), method: 'ONLINE', status: 'SUCCEEDED', '…': '…' } },
  }, {
    title: 'Partial amount on a booking', status: 422, request: { source_type: 'COURT_BOOKING', source_id: '…', amount: '100.00', payment_method: 'CASH' },
    response: { success: false, error: { code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Payment amount does not match the amount due.', details: { amount_due: '800.00' } } },
  }]; })(),
  'enquiries.create': [{
    title: 'Visitor requests a tennis trial (no login)', request: { name: 'Siddharth Rao', phone: '+919900100002', email: 'sid.rao@example.com', enquiry_type: 'TRIAL', sport_type: 'TENNIS', preferred_start_at: freeStart, message: 'Would like to try a tennis session this week.' },
    response: { success: true, message: 'Thanks! The club will contact you shortly.', data: { id: '…', enquiry_type: 'TRIAL', source: 'WEBSITE', status: 'NEW', name: 'Siddharth Rao', '…': '…' } },
  }],
  'invoices.create': [{
    title: 'Owner invoices a business client (tax-exclusive lines)',
    request: { invoice_type: 'BUSINESS', business_client_id: load('business-clients')[0].id, due_date: '2026-10-17', items: [{ description: 'Padel court hire (8 sessions)', quantity: 8, unit_price: '1000.00' }], send_now: true },
    response: { success: true, data: { invoice_number: nextNo('INV-', invoices, 5), status: 'SENT', subtotal: '8000.00', tax_rate: '18.00', tax_amount: '1440.00', total_amount: '9440.00', amount_paid: '0.00', amount_outstanding: '9440.00', '…': '…' } },
  }],
  'reports.dashboard': [{
    title: 'Owner dashboard, this month (abridged)', request: { query: '?period=MONTH' },
    response: { success: true, data: { period: 'MONTH', range: { from: '2026-10-01', to: '2026-10-03' }, revenue: { total: '…', refunds: '…', by_category: [{ key: 'COURT', label: 'Courts', amount: '…', count: 0 }, '…'], by_method: ['…'] }, memberships: { active_total: 10, by_type: ['…'], new_in_period: 1, expiring_soon: 2 }, courts: { bookings_count: 0, utilization_percent: '…', cancellations_count: 0, revenue: '…' }, shop: { orders_count: 0, sales_amount: '…', low_stock_count: 3 }, bar: { '…': '…' }, enquiries: { '…': '…' }, finance: { '…': '…' }, staff: { pending_leave_requests: 1 } } },
  }],
};
