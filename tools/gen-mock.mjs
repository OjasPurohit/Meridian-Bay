// Generates mock-data/*.json and database/seed/seed.sql from ONE script so they can never disagree.
//   npm run mock:build                         (anchors "today" to the real current date)
//   npm run mock:build -- --base-date=2026-10-03
// Guarantees (asserted below): every row has exactly the columns of its table; enum values valid;
// no overlapping live bookings; <= max plays/day; totals/tax/stock/payments reconcile.
import bcrypt from 'bcryptjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseSchema, ROOT } from './lib/schema.mjs';
import { toPaise, fromPaise, percentOf, taxInclusive } from '../shared/lib/money.ts';
import { istToUtc, istDate as istDateOf, addDays as addDaysShared, termEndDate } from '../shared/lib/time.ts';

const schema = parseSchema();
const argBase = process.argv.find((a) => a.startsWith('--base-date='))?.split('=')[1];
const BASE = argBase ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD (IST)

// ------------------------------------------------------------------ time helpers (all business times are IST = UTC+05:30)
const DAY = 86400000;
const baseMs = Date.parse(BASE + 'T00:00:00Z');
const addDays = addDaysShared;
const d = (off) => addDays(BASE, off);
const addYearsMinus1 = (dateStr) => termEndDate(dateStr, 12);
const tsMs = (dateStr, hhmm) => Date.parse(istToUtc(dateStr, hhmm));
const iso = (ms) => new Date(ms).toISOString();
const ts = (off, hhmm) => iso(tsMs(d(off), hhmm));
const NOW_MS = tsMs(BASE, '17:15'); // mock "now" = today 17:15 IST (just before the evening rush)
const dow = new Date(baseMs).getUTCDay(); // 0=Sun..6=Sat
const lastFri = -(((dow - 5 + 7) % 7) || 7);
const nextFri = ((5 - dow + 7) % 7) || 7;
const istDate = istDateOf;

// ------------------------------------------------------------------ money helpers (integer paise internally)
const P = toPaise, M = fromPaise, pctOf = percentOf, taxIncl = taxInclusive; // ONE shared implementation (shared/lib/money.ts)

// ------------------------------------------------------------------ id + row registry
const tableIndex = Object.keys(schema.tables);
const idMaps = {};
export function uid(table, key) {
  const m = (idMaps[table] ??= new Map());
  if (!m.has(key)) m.set(key, m.size + 1);
  const t = (tableIndex.indexOf(table) + 1).toString(16).padStart(2, '0') + '000000';
  return `${t}-0000-4000-8000-${String(m.get(key)).padStart(12, '0')}`;
}
const data = Object.fromEntries(tableIndex.map((t) => [t, []]));
function add(table, obj) {
  const def = schema.tables[table];
  if (!def) throw new Error(`unknown table ${table}`);
  const cols = new Map(def.columns.map((c) => [c.name, c]));
  for (const k of Object.keys(obj)) if (!cols.has(k)) throw new Error(`${table}: unknown column "${k}"`);
  const row = {};
  for (const c of def.columns) {
    let v = obj[c.name];
    if (v === undefined) {
      if (c.notNull) throw new Error(`${table}.${c.name} is NOT NULL but missing in ${JSON.stringify(obj).slice(0, 120)}`);
      v = null;
    }
    const en = schema.enums[c.type];
    if (en && v !== null && !en.includes(v)) throw new Error(`${table}.${c.name}: "${v}" not in enum ${c.type}`);
    row[c.name] = v;
  }
  data[table].push(row);
  return row;
}

// ================================================================== USERS / STAFF / CLIENT
const PASSWORD = 'Password@123';
const PW_HASH = bcrypt.hashSync(PASSWORD, 10);
const T0 = ts(-200, '10:00');
const userSpecs = [
  ['owner', 'owner@championsclub.example', 'OWNER_ADMIN', 'Vikram Malhotra', '+919820000001'],
  ['neha', 'neha.sharma@championsclub.example', 'FRONT_DESK', 'Neha Sharma', '+919820000002'],
  ['arjun', 'arjun.mehta@championsclub.example', 'FRONT_DESK', 'Arjun Mehta', '+919820000003'],
  ['pooja', 'pooja.iyer@championsclub.example', 'FRONT_DESK', 'Pooja Iyer', '+919820000004'],
  ['ramesh', 'kitchen@championsclub.example', 'KITCHEN_MANAGER', 'Ramesh Patil', '+919820000005'],
  ['sanjay', 'sanjay.gupta@technova.example', 'BUSINESS_CLIENT', 'Sanjay Gupta', '+919820000006'],
];
const memberSpecs = [
  // key, name, phone, dob, plan, startOffset
  ['aarav', 'Aarav Kapoor', '9811100001', '1991-04-12', 'GOLD', -200],
  ['priya', 'Priya Nair', '9811100002', '1988-11-03', 'GOLD', -260],
  ['rohan', 'Rohan Desai', '9811100003', '1994-02-21', 'SILVER', -120],
  ['ananya', 'Ananya Iyer', '9811100004', '1996-08-30', 'SILVER', -225],
  ['kabir', 'Kabir Singh', '9811100005', '1993-12-05', 'SILVER', -2],
  ['meera', 'Meera Joshi', '9811100006', '1990-06-18', 'SILVER', null], // expiring: end = BASE+9
  ['ishaan', 'Ishaan Verma', '9811100007', `${BASE.slice(0, 4) - 14}-03-09`, 'JUNIOR', -180],
  ['diya', 'Diya Reddy', '9811100008', `${BASE.slice(0, 4) - 16}-07-21`, 'JUNIOR', -30],
  ['karan', 'Karan Bhatia', '9811100009', '1985-09-27', 'GOLD', null], // expiring: end = BASE+28
  ['sneha', 'Sneha Kulkarni', '9811100010', '1992-01-15', 'SILVER', null], // expired: end = BASE-9
  ['rahul', 'Rahul Menon', '9811100011', '1998-05-09', null, null], // signed up online, no plan yet
  ['tanvi', 'Tanvi Shah', '9811100012', '1995-10-02', 'GOLD', -80], // upgraded from SILVER
  ['vihaan', 'Vihaan Patel', '9811100013', '1997-03-22', 'SILVER', null], // plan CANCELLED by the owner (no refund)
];
for (const [k, email, role, name, phone] of userSpecs)
  add('users', { id: uid('users', k), email, password_hash: PW_HASH, role, full_name: name, phone, is_active: true, must_change_password: false, last_login_at: ts(-1, '09:00'), created_at: T0, updated_at: T0 });
for (const [k, name, phone] of memberSpecs)
  add('users', { id: uid('users', k), email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}@example.com`, password_hash: PW_HASH, role: 'MEMBER', full_name: name, phone: `+91${phone}`, is_active: true, must_change_password: false, last_login_at: k === 'rahul' ? ts(-1, '21:10') : ts(-1, '18:00'), created_at: T0, updated_at: T0 });

const staffSpecs = [
  ['owner', 'Owner', null, '0.00'], ['neha', 'Front Desk Executive', 'FRONT_DESK', '28000.00'], ['arjun', 'Front Desk Executive', 'FRONT_DESK', '28000.00'],
  ['pooja', 'Bar & Counter Associate', 'BAR', '24000.00'], ['ramesh', 'Kitchen Manager', 'KITCHEN', '35000.00'],
];
staffSpecs.forEach(([k, des, area, sal], i) =>
  add('staff', { id: uid('staff', k), user_id: uid('users', k), employee_code: `EMP-${String(i + 1).padStart(4, '0')}`, designation: des, default_area: area, monthly_salary: sal, joined_on: d(-400 + i * 20), is_active: true, created_at: T0, updated_at: T0 }));

add('business_clients', { id: uid('business_clients', 'technova'), user_id: uid('users', 'sanjay'), company_name: 'TechNova Solutions Pvt Ltd', contact_name: 'Sanjay Gupta', email: 'sanjay.gupta@technova.example', phone: '+919820000006', gstin: '27AABCT1234F1Z5', billing_address: '5th Floor, Cyber Park, Hinjewadi, Pune 411057', notes: 'Quarterly corporate sports day + cricket net bookings', is_active: true, created_at: ts(-90, '11:00'), updated_at: ts(-90, '11:00') });
add('business_clients', { id: uid('business_clients', 'greenfield'), user_id: null, company_name: 'Greenfield Corp', contact_name: 'Meera Pillai', email: 'accounts@greenfield.example', phone: '+919820000007', gstin: '27AAACG9876K1Z2', billing_address: '12 Industrial Estate, Chakan, Pune 410501', notes: 'Invoiced only; no portal login', is_active: true, created_at: ts(-60, '11:00'), updated_at: ts(-60, '11:00') });

// ================================================================== PLANS / MEMBERSHIPS
const PLAN = {
  GOLD: { price: '30000.00', c: '100.00', s: '15.00', b: '15.00', name: 'Gold Membership', desc: 'Premium, full access to every court, best discounts at the shop and bar.', benefits: ['Free court bookings (up to 2 plays per day)', '15% off at the gear shop', '15% off at the bar & cafeteria', 'Join Friday social play free', 'Priority support from the front desk'], order: 1 },
  SILVER: { price: '15000.00', c: '50.00', s: '10.00', b: '10.00', name: 'Silver Membership', desc: 'Standard membership with member court rates and everyday discounts.', benefits: ['50% off court bookings (up to 2 plays per day)', '10% off at the gear shop', '10% off at the bar & cafeteria', 'Join Friday social play at member rate'], order: 2 },
  JUNIOR: { price: '7500.00', c: '70.00', s: '5.00', b: '5.00', name: 'Junior Membership', desc: 'For players under 18 — discounted court rates.', benefits: ['70% off court bookings (up to 2 plays per day)', '5% off at the gear shop', '5% off at the bar & cafeteria', 'Junior-friendly Friday social play'], order: 3 },
};
for (const [type, p] of Object.entries(PLAN))
  add('membership_plans', { id: uid('membership_plans', type), membership_type: type, name: p.name, description: p.desc, duration_months: 12, price: p.price, court_discount_percent: p.c, shop_discount_percent: p.s, bar_discount_percent: p.b, max_plays_per_day: 2, min_age: type === 'JUNIOR' ? 5 : 18, max_age: type === 'JUNIOR' ? 17 : null, benefits: p.benefits, sort_order: p.order, is_active: true, created_at: T0, updated_at: T0 });

memberSpecs.forEach(([k, , , dob, , startOff], i) => {
  const first = memberSpecs.find((m) => m[0] === k);
  const joined = k === 'rahul' ? d(-1) : k === 'kabir' ? d(-2) : d(first[5] ?? -300);
  add('members', { id: uid('members', k), user_id: uid('users', k), member_code: `CCM-${String(i + 1).padStart(5, '0')}`, date_of_birth: dob, address: `${10 + i}, Club Road, Pune`, emergency_contact_name: 'Family Contact', emergency_contact_phone: `+91982200${String(i).padStart(4, '0')}`, photo_url: null, notes: k === 'sneha' ? 'Membership lapsed — remind at desk' : null, joined_on: joined, created_by_user_id: uid('users', 'neha'), created_at: ts(-200, '10:00'), updated_at: ts(-200, '10:00') });
});

const startOfTerm = (end) => { const s = new Date(Date.parse(end + 'T00:00:00Z')); s.setUTCFullYear(s.getUTCFullYear() - 1); return addDays(s.toISOString().slice(0, 10), 1); };
const memberships = []; // {key, member, type, start, end, status, price}
function addMembership(key, member, type, start, end, status, extra = {}) {
  const plan = PLAN[type];
  const row = add('memberships', { id: uid('memberships', key), member_id: uid('members', member), membership_plan_id: uid('membership_plans', type), status, start_date: start, end_date: end, price_paid: plan.price, previous_membership_id: extra.prev ? uid('memberships', extra.prev) : null, cancelled_at: null, cancellation_reason: null, created_by_user_id: uid('users', 'neha'), created_at: iso(tsMs(start, '10:30')), updated_at: iso(tsMs(start, '10:30')) });
  memberships.push({ key, member, type, start, end, status });
  return row;
}
for (const [k, , , , type, off] of memberSpecs) {
  if (!type || k === 'tanvi') continue;
  if (k === 'meera') { const end = d(9); addMembership('m_meera', k, type, startOfTerm(end), end, 'ACTIVE'); continue; }
  if (k === 'karan') { const end = d(28); addMembership('m_karan', k, type, startOfTerm(end), end, 'ACTIVE'); continue; }
  if (k === 'vihaan') { const start = d(-45); const row = addMembership('m_vihaan', k, type, start, addYearsMinus1(start), 'CANCELLED'); row.cancelled_at = ts(-38, '15:00'); row.cancellation_reason = 'Member relocated abroad; plan cancelled at the member\'s request (no refund per policy)'; continue; }
  if (k === 'sneha') { const end = d(-9); addMembership('m_sneha', k, type, startOfTerm(end), end, 'EXPIRED'); continue; }
  const start = d(off);
  addMembership('m_' + k, k, type, start, addYearsMinus1(start), 'ACTIVE');
}
// Tanvi: SILVER -> upgraded to GOLD (history chain)
addMembership('m_tanvi_silver', 'tanvi', 'SILVER', d(-150), d(-81), 'CHANGED');
addMembership('m_tanvi_gold', 'tanvi', 'GOLD', d(-80), addYearsMinus1(d(-80)), 'ACTIVE', { prev: 'm_tanvi_silver' });
const memberById = (k) => memberSpecs.find((m) => m[0] === k);
const membershipOn = (member, dateStr) => memberships.find((m) => m.member === member && m.start <= dateStr && dateStr <= m.end && m.status !== 'CANCELLED');

// ------------------------------------------------------------------ payments collector (assigned numbers after sorting)
const payQueue = [];
function pay({ source_type, source_id, category, member = null, client = null, payer = null, amount, method, paidAt, by = 'arjun', rate, ref = null, refunded = 0, reason = null, notes = null }) {
  const tax = taxIncl(amount, rate);
  payQueue.push({ source_type, source_id, revenue_category: category, member_id: member ? uid('members', member) : null, business_client_id: client ? uid('business_clients', client) : null, payer_name: payer, amount: M(amount), tax_amount: M(tax), method, status: refunded === 0 ? 'SUCCEEDED' : refunded >= amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED', gateway_reference: ref ?? (method === 'ONLINE' ? `RZP-${100000 + payQueue.length * 37}` : method === 'UPI' ? `UPI-${220000 + payQueue.length * 53}` : method === 'CARD' ? `AUTH-${7000 + payQueue.length * 11}` : null), received_by_user_id: method === 'ONLINE' ? null : uid('users', by), paid_at: paidAt, refunded_amount: M(refunded), refund_reason: reason, refunded_at: refunded ? iso(Date.parse(paidAt) + 3 * 3600000) : null, notes });
}
const TAX = { COURT: 18, MEMBERSHIP: 18, SHOP: 18, BAR: 5, BUSINESS: 18 };
const METHODS = ['UPI', 'CARD', 'CASH', 'ONLINE'];
for (const m of memberships) {
  if (m.key === 'm_tanvi_silver' && false) continue;
  pay({ source_type: 'MEMBERSHIP', source_id: uid('memberships', m.key), category: 'MEMBERSHIP', member: m.member, amount: P(PLAN[m.type].price), method: METHODS[(m.key.length + m.start.length) % 4], paidAt: iso(tsMs(m.start, '10:30')), rate: TAX.MEMBERSHIP, by: 'neha' });
}

// ================================================================== COURTS
const courts = {
  T1: ['Tennis Court 1', 'TENNIS', 'Clay court, floodlit', 'Clay', '800.00'],
  T2: ['Tennis Court 2', 'TENNIS', 'Hard court, floodlit', 'Acrylic hard', '800.00'],
  C1: ['Cricket Net 1', 'CRICKET', 'Practice net with bowling machine', 'Turf', '1200.00'],
  P1: ['Padel Court 1', 'PADEL', 'Glass-walled padel court', 'Artificial turf', '1000.00'],
  B1: ['Badminton Court 1', 'BADMINTON', 'Indoor wooden court', 'Wood', '400.00'],
  B2: ['Badminton Court 2', 'BADMINTON', 'Indoor wooden court', 'Wood', '400.00'],
};
Object.entries(courts).forEach(([k, [name, sport, desc, surface, rate]], i) =>
  add('courts', { id: uid('courts', k), name, sport_type: sport, description: desc, surface, walk_in_rate_per_hour: rate, image_url: null, sort_order: i + 1, is_active: true, created_at: T0, updated_at: T0 }));

// ================================================================== ENQUIRIES (before bookings: trial FK)
const enq = (k, o) => add('enquiries', { id: uid('enquiries', k), enquiry_type: 'GENERAL', source: 'WEBSITE', status: 'NEW', email: null, message: null, membership_plan_id: null, sport_type: null, preferred_start_at: null, assigned_to_user_id: null, next_follow_up_at: null, converted_member_id: null, lost_reason: null, created_by_user_id: null, ...o, updated_at: o.updated_at ?? o.created_at });
enq('e_general', { name: 'Anita Deshmukh', phone: '+919900100001', email: 'anita.d@example.com', message: 'What are your timings and do you offer coaching for beginners?', created_at: ts(0, '09:40') });
enq('e_trial', { enquiry_type: 'TRIAL', status: 'CONTACTED', name: 'Siddharth Rao', phone: '+919900100002', email: 'sid.rao@example.com', message: 'Would like to try a tennis session this week.', sport_type: 'TENNIS', preferred_start_at: ts(2, '18:00'), assigned_to_user_id: uid('users', 'neha'), created_at: ts(-1, '20:15'), updated_at: ts(0, '10:00') });
enq('e_gold', { enquiry_type: 'MEMBERSHIP', name: 'Pranav Kulkarni', phone: '+919900100003', email: 'pranav.k@example.com', message: 'Interested in Gold membership — what is included for family?', membership_plan_id: uid('membership_plans', 'GOLD'), created_at: ts(0, '11:05') });
enq('e_quote', { enquiry_type: 'MEMBERSHIP', status: 'QUOTE_SENT', name: 'Neelam Shah', phone: '+919900100004', email: 'neelam.shah@example.com', message: 'Silver plan for myself, please share the price.', membership_plan_id: uid('membership_plans', 'SILVER'), assigned_to_user_id: uid('users', 'arjun'), next_follow_up_at: ts(2, '12:00'), created_at: ts(-4, '13:20'), updated_at: ts(-2, '15:00') });
enq('e_followup', { enquiry_type: 'MEMBERSHIP', source: 'PHONE', status: 'FOLLOW_UP', name: 'Harsh Vardhan', phone: '+919900100005', message: 'Wants junior membership for his 12 year old son.', membership_plan_id: uid('membership_plans', 'JUNIOR'), assigned_to_user_id: uid('users', 'neha'), next_follow_up_at: ts(0, '16:00'), created_by_user_id: uid('users', 'neha'), created_at: ts(-3, '17:30'), updated_at: ts(-1, '12:00') });
enq('e_converted', { enquiry_type: 'TRIAL', status: 'CONVERTED', name: 'Kabir Singh', phone: '+919811100005', email: 'kabir.singh@example.com', message: 'Trial then membership.', sport_type: 'TENNIS', membership_plan_id: uid('membership_plans', 'SILVER'), assigned_to_user_id: uid('users', 'neha'), converted_member_id: uid('members', 'kabir'), created_at: ts(-9, '10:00'), updated_at: ts(-2, '10:30') });
enq('e_lost', { enquiry_type: 'MEMBERSHIP', status: 'LOST', name: 'Ritu Bansal', phone: '+919900100006', email: 'ritu.b@example.com', message: 'Silver plan enquiry', membership_plan_id: uid('membership_plans', 'SILVER'), assigned_to_user_id: uid('users', 'arjun'), lost_reason: 'Found a cheaper club nearby', created_at: ts(-20, '12:00'), updated_at: ts(-12, '12:00') });
enq('e_business', { enquiry_type: 'BUSINESS', status: 'CONTACTED', name: 'Apex Realty — Rohit Jain', phone: '+919900100007', email: 'events@apexrealty.example', message: 'Corporate sports day for 60 employees next month. Need a quote.', assigned_to_user_id: uid('users', 'owner'), next_follow_up_at: ts(1, '11:00'), created_at: ts(-2, '14:00'), updated_at: ts(-1, '16:30') });
enq('e_walkin', { source: 'WALK_IN', name: 'Tarun Oberoi', phone: '+919900100008', message: 'Asked about padel court availability on weekends.', created_by_user_id: uid('users', 'arjun'), created_at: ts(-1, '19:20') });
const fu = (k, e, by, method, note, at, next = null) => add('enquiry_follow_ups', { id: uid('enquiry_follow_ups', k), enquiry_id: uid('enquiries', e), done_by_user_id: uid('users', by), method, note, followed_up_at: at, next_follow_up_at: next, created_at: at });
fu('f1', 'e_trial', 'neha', 'CALL', 'Confirmed tennis trial slot with the visitor. Trial court booked.', ts(0, '10:00'));
fu('f2', 'e_quote', 'arjun', 'CALL', 'Explained Silver benefits; sent quote on WhatsApp.', ts(-2, '15:00'), ts(2, '12:00'));
fu('f3', 'e_followup', 'neha', 'CALL', 'Spoke to father; will visit with son this weekend.', ts(-1, '12:00'), ts(0, '16:00'));
fu('f4', 'e_converted', 'neha', 'CALL', 'Trial went well; sending Silver quote.', ts(-6, '11:00'));
fu('f5', 'e_converted', 'neha', 'IN_PERSON', 'Accepted quote; registered at desk.', ts(-2, '10:20'));
fu('f6', 'e_lost', 'arjun', 'WHATSAPP', 'Customer chose another club (price).', ts(-12, '12:00'));
fu('f7', 'e_business', 'owner', 'EMAIL', 'Requested headcount and preferred dates.', ts(-1, '16:30'), ts(1, '11:00'));
const quote = (k, e, plan, desc, amt, valid, status, sentAt, by) => add('quotes', { id: uid('quotes', k), quote_number: `QT-${String(data.quotes.length + 1).padStart(5, '0')}`, enquiry_id: uid('enquiries', e), membership_plan_id: plan ? uid('membership_plans', plan) : null, description: desc, amount: amt, valid_until: valid, status, sent_at: sentAt, created_by_user_id: uid('users', by), created_at: sentAt ?? ts(-1, '10:00'), updated_at: sentAt ?? ts(-1, '10:00') });
quote('q1', 'e_quote', 'SILVER', 'Silver Membership — 12 months', '15000.00', d(5), 'SENT', ts(-2, '15:00'), 'arjun');
quote('q2', 'e_converted', 'SILVER', 'Silver Membership — 12 months', '15000.00', d(-1), 'ACCEPTED', ts(-6, '11:30'), 'neha');
quote('q3', 'e_lost', 'SILVER', 'Silver Membership — 12 months', '15000.00', d(-14), 'REJECTED', ts(-18, '12:00'), 'arjun');

// ================================================================== COURT BOOKINGS
const live = []; // for overlap + daily-limit assertions
const bookings = []; // {key, member}
function pricing(courtKey, memberKey) {
  const list = P(courts[courtKey][4]);
  if (!memberKey) return { list, disc: 0, due: list, membership: null };
  return { list, memberKey };
}
function makeBooking(spec) {
  const [off, hhmm, courtKey, who, status, method] = spec;
  const date = d(off);
  const startMs = tsMs(date, hhmm);
  const guest = who.startsWith('guest:');
  const maint = who === 'MAINT';
  const trial = who.startsWith('trial:');
  const list = P(courts[courtKey][4]);
  let disc = 0, ms = null, memberKey = null, gname = null, gphone = null, ctype = null;
  if (guest || trial) { const [n, p] = who.split(':')[1].split('|'); gname = n; gphone = '+91' + p; ctype = 'WALK_IN'; }
  else if (!maint) { memberKey = who; ctype = 'MEMBER'; ms = membershipOn(who, date); if (ms) disc = pctOf(list, parseFloat(PLAN[ms.type].c)); }
  const type = maint ? 'MAINTENANCE' : trial ? 'TRIAL' : 'REGULAR';
  const due = maint || trial ? 0 : list - disc;
  const lst = maint || trial ? 0 : list;
  const created = Math.min(startMs - DAY, NOW_MS - 2 * 3600000);
  const selfBooked = method === 'ONLINE' && memberKey;
  const cancelled = status === 'CANCELLED';
  const key = `b_${off}_${hhmm}_${courtKey}`;
  let pstatus = due === 0 ? 'NOT_REQUIRED' : method === 'PENDING' ? 'PENDING' : 'PAID';
  if (cancelled && due > 0 && method !== 'PENDING') pstatus = 'REFUNDED';
  const row = add('court_bookings', { id: uid('court_bookings', key), booking_number: `BK-${String(data.court_bookings.length + 1).padStart(6, '0')}`, court_id: uid('courts', courtKey), booking_type: type, status, customer_type: ctype, member_id: memberKey ? uid('members', memberKey) : null, membership_id: ms ? uid('memberships', ms.key) : null, guest_name: gname, guest_phone: gphone, enquiry_id: trial ? uid('enquiries', 'e_trial') : null, start_at: iso(startMs), end_at: iso(startMs + 3600000), list_price: M(lst), discount_amount: M(maint || trial ? 0 : disc), amount_due: M(due), tax_amount: M(taxIncl(due, TAX.COURT)), payment_status: pstatus, notes: maint ? 'Resurfacing / maintenance' : trial ? 'Trial session (enquiry)' : null, cancelled_at: cancelled ? iso(startMs - 5 * 3600000) : null, cancelled_by_user_id: cancelled ? uid('users', memberKey ?? 'arjun') : null, cancellation_reason: cancelled ? 'Change of plans' : null, created_by_user_id: maint ? uid('users', 'owner') : selfBooked ? uid('users', memberKey) : uid('users', 'arjun'), created_at: iso(created), updated_at: iso(created) });
  if (!cancelled) live.push({ court: courtKey, s: startMs, e: startMs + 3600000, member: memberKey, date });
  if (due > 0 && method !== 'PENDING') {
    const paidAt = status === 'COMPLETED' && method !== 'ONLINE' ? iso(startMs) : iso(created + 600000);
    pay({ source_type: 'COURT_BOOKING', source_id: row.id, category: 'COURT', member: memberKey, payer: guest ? gname : null, amount: due, method, paidAt, rate: TAX.COURT, refunded: cancelled ? due : 0, reason: cancelled ? 'Cancelled before cut-off — full refund' : null, by: 'arjun' });
  }
  bookings.push({ key, row });
  return row;
}
const bookingSpecs = [
  [-6, '18:00', 'T1', 'rohan', 'COMPLETED', 'UPI'], [-6, '19:00', 'T1', 'ananya', 'COMPLETED', 'CARD'], [-6, '18:00', 'T2', 'guest:Vishal Rao|9810011223', 'COMPLETED', 'CASH'],
  [-5, '07:00', 'B1', 'ishaan', 'COMPLETED', 'UPI'], [-5, '18:30', 'P1', 'aarav', 'COMPLETED', null], [-5, '19:30', 'C1', 'priya', 'COMPLETED', null],
  [-4, '17:00', 'T2', 'tanvi', 'COMPLETED', null], [-4, '18:00', 'B2', 'guest:Mohit Jain|9822233445', 'COMPLETED', 'CASH'],
  [-3, '06:30', 'T1', 'meera', 'COMPLETED', 'UPI'], [-3, '19:00', 'P1', 'karan', 'COMPLETED', null], [-3, '20:00', 'P1', 'rohan', 'COMPLETED', 'CARD'],
  [-2, '18:00', 'T1', 'kabir', 'COMPLETED', 'UPI'], [-2, '18:00', 'T2', 'guest:Sunita Pillai|9833344556', 'COMPLETED', 'UPI'], [-2, '20:00', 'C1', 'aarav', 'COMPLETED', null], [-2, '19:00', 'B1', 'sneha', 'COMPLETED', 'CARD'],
  [-1, '17:00', 'T2', 'diya', 'COMPLETED', 'CASH'], [-1, '18:00', 'B1', 'ananya', 'CANCELLED', 'UPI'],
  [0, '06:30', 'T2', 'priya', 'COMPLETED', null], [0, '08:00', 'T1', 'rohan', 'COMPLETED', 'UPI'],
  [0, '18:00', 'T1', 'aarav', 'CONFIRMED', null], [0, '18:00', 'T2', 'guest:Deepak Chawla|9844455667', 'CONFIRMED', 'PENDING'], [0, '18:30', 'B1', 'diya', 'CONFIRMED', 'PENDING'], [0, '19:00', 'P1', 'tanvi', 'CONFIRMED', null], [0, '20:00', 'C1', 'karan', 'CONFIRMED', null],
  [1, '07:00', 'T1', 'ananya', 'CONFIRMED', 'ONLINE'], [1, '18:00', 'T1', 'aarav', 'CONFIRMED', null], [1, '19:00', 'T1', 'aarav', 'CONFIRMED', null], [1, '18:00', 'T2', 'rohan', 'CONFIRMED', 'ONLINE'],
  [1, '17:00', 'B2', 'guest:Nikhil Arora|9855566778', 'CONFIRMED', 'PENDING'], [1, '20:00', 'B1', 'rahul', 'CONFIRMED', 'PENDING'],
  [2, '18:00', 'T2', 'trial:Siddharth Rao|9900100002', 'CONFIRMED', null], [2, '19:00', 'P1', 'priya', 'CONFIRMED', null], [2, '06:00', 'T1', 'meera', 'CONFIRMED', 'ONLINE'],
  [3, '18:00', 'C1', 'karan', 'CONFIRMED', null], [3, '17:30', 'B1', 'ishaan', 'CONFIRMED', 'ONLINE'],
  [4, '19:00', 'T1', 'tanvi', 'CONFIRMED', null], [4, '18:00', 'P1', 'guest:Rhea Kapoor|9866677889', 'CONFIRMED', 'PENDING'],
  [5, '10:00', 'T2', 'MAINT', 'CONFIRMED', null], [5, '11:00', 'T2', 'MAINT', 'CONFIRMED', null],
  [nextFri, '17:00', 'B1', 'rohan', 'CONFIRMED', 'ONLINE'],
];
for (const s of bookingSpecs) makeBooking(s);

// ------------------------------------------------------------------ social play (Fridays)
const socialDefs = [
  { key: 'ss_past1', off: lastFri, hhmm: '19:00', court: 'T1', title: 'Friday Social Doubles', cap: 8, fee: 30000, status: 'COMPLETED', parts: [['aarav', 'PAID'], ['rohan', 'UPI'], ['ananya', 'CARD'], ['ishaan', 'CASH'], ['guest:Vishal Rao|9810011223', 'CASH']] },
  { key: 'ss_past2', off: lastFri, hhmm: '20:00', court: 'T1', title: 'Late Night Social', cap: 6, fee: 30000, status: 'COMPLETED', parts: [['priya', 'PAID'], ['karan', 'PAID'], ['tanvi', 'PAID']] },
  { key: 'ss_open1', off: nextFri, hhmm: '18:00', court: 'T1', title: 'Friday Social Doubles', cap: 8, fee: 30000, status: 'OPEN', parts: [['priya', 'PAID'], ['tanvi', 'PAID'], ['meera', 'ONLINE'], ['diya', 'UPI'], ['guest:Rhea Kapoor|9866677889', 'PENDING'], ['kabir', 'LEFT']] },
  { key: 'ss_full', off: nextFri, hhmm: '19:00', court: 'T2', title: 'Friday Social — Mixed Play', cap: 6, fee: 30000, status: 'OPEN', parts: [['aarav', 'PAID'], ['karan', 'PAID'], ['rohan', 'ONLINE'], ['ananya', 'UPI'], ['kabir', 'ONLINE'], ['guest:Nikhil Arora|9855566778', 'CASH']] },
];
const playsOnDate = {}; // member|date -> count for assertion
for (const m of live) if (m.member) playsOnDate[m.member + '|' + m.date] = (playsOnDate[m.member + '|' + m.date] ?? 0) + 1;
for (const s of socialDefs) {
  const date = d(s.off); const startMs = tsMs(date, s.hhmm);
  const bk = add('court_bookings', { id: uid('court_bookings', 'bk_' + s.key), booking_number: `BK-${String(data.court_bookings.length + 1).padStart(6, '0')}`, court_id: uid('courts', s.court), booking_type: 'SOCIAL_SESSION', status: s.status === 'COMPLETED' ? 'COMPLETED' : 'CONFIRMED', customer_type: null, member_id: null, membership_id: null, guest_name: null, guest_phone: null, enquiry_id: null, start_at: iso(startMs), end_at: iso(startMs + 3600000), list_price: '0.00', discount_amount: '0.00', amount_due: '0.00', tax_amount: '0.00', payment_status: 'NOT_REQUIRED', notes: 'Held for Friday social play', cancelled_at: null, cancelled_by_user_id: null, cancellation_reason: null, created_by_user_id: uid('users', 'neha'), created_at: ts(s.off - 7, '12:00'), updated_at: ts(s.off - 7, '12:00') });
  live.push({ court: s.court, s: startMs, e: startMs + 3600000, member: null, date });
  const ss = add('social_sessions', { id: uid('social_sessions', s.key), court_booking_id: bk.id, title: s.title, description: 'Open play — rotate partners, all levels welcome.', capacity: s.cap, fee_per_person: M(s.fee), status: s.status, created_by_user_id: uid('users', 'neha'), created_at: ts(s.off - 7, '12:00'), updated_at: ts(s.off - 7, '12:00') });
  s.parts.forEach(([who, how], i) => {
    const guest = who.startsWith('guest:');
    let name = null, phone = null, mk = null, fee = s.fee, ms = null;
    if (guest) { [name, phone] = who.split(':')[1].split('|'); phone = '+91' + phone; }
    else { mk = who; ms = membershipOn(who, date); if (ms) fee = s.fee - pctOf(s.fee, parseFloat(PLAN[ms.type].c)); }
    const left = how === 'LEFT';
    const paidNow = !left && fee > 0 && how !== 'PENDING';
    const joinedAt = iso(Math.min(startMs - 2 * DAY + i * 3600000, NOW_MS - 3600000));
    const pstatus = fee === 0 ? 'NOT_REQUIRED' : left ? 'REFUNDED' : how === 'PENDING' ? 'PENDING' : 'PAID';
    const row = add('social_session_participants', { id: uid('social_session_participants', `${s.key}_${i}`), social_session_id: ss.id, member_id: mk ? uid('members', mk) : null, guest_name: name, guest_phone: phone, status: left ? 'CANCELLED' : 'JOINED', fee_amount: M(fee), tax_amount: M(taxIncl(fee, TAX.COURT)), payment_status: pstatus, joined_at: joinedAt, cancelled_at: left ? iso(Math.min(startMs - DAY, NOW_MS - 1800000)) : null, created_at: joinedAt, updated_at: joinedAt });
    if (!left && mk) playsOnDate[mk + '|' + date] = (playsOnDate[mk + '|' + date] ?? 0) + 1;
    if ((paidNow || (left && fee > 0 && how === 'LEFT' && false)) && fee > 0)
      pay({ source_type: 'SOCIAL_PARTICIPANT', source_id: row.id, category: 'COURT', member: mk, payer: name, amount: fee, method: how === 'PAID' ? 'UPI' : how, paidAt: s.status === 'COMPLETED' ? iso(startMs - 600000) : iso(Date.parse(joinedAt) + 300000), rate: TAX.COURT, by: 'neha' });
  });
}
// ---- booking assertions
for (const [k, n] of Object.entries(playsOnDate)) if (n > 2) throw new Error(`daily limit violated: ${k} = ${n}`);
const byCourt = {};
for (const b of live) (byCourt[b.court] ??= []).push(b);
for (const [c, arr] of Object.entries(byCourt)) { arr.sort((a, b) => a.s - b.s); for (let i = 1; i < arr.length; i++) if (arr[i].s < arr[i - 1].e) throw new Error(`overlap on ${c} at ${iso(arr[i].s)}`); }

// ================================================================== SHOP
const PRODUCTS = [
  // key, sku, name, cat, brand, price, final stock, threshold, restock
  ['wilson_clash', 'RKT-WIL-CLASH100', 'Wilson Clash 100 v2 Tennis Racket', 'RACKET', 'Wilson', '16999.00', 6, 3, 0],
  ['babolat_pd', 'RKT-BAB-PUREDRIVE', 'Babolat Pure Drive Tennis Racket', 'RACKET', 'Babolat', '15499.00', 5, 3, 0],
  ['yonex_astrox', 'RKT-YON-ASTROX88D', 'Yonex Astrox 88D Pro Badminton Racket', 'RACKET', 'Yonex', '9999.00', 8, 4, 0],
  ['head_padel', 'RKT-HEA-PADEL', 'Head Delta Pro Padel Racket', 'RACKET', 'Head', '8499.00', 4, 3, 0],
  ['wilson_balls', 'BAL-WIL-USOPEN3', 'Wilson US Open Tennis Balls (can of 3)', 'BALL', 'Wilson', '650.00', 3, 5, 0],
  ['dunlop_balls', 'BAL-DUN-FORT3', 'Dunlop Fort Tennis Balls (can of 3)', 'BALL', 'Dunlop', '550.00', 30, 8, 12],
  ['sg_ball', 'BAL-SG-TEST', 'SG Test Cricket Ball (red leather)', 'BALL', 'SG', '450.00', 20, 6, 0],
  ['shuttles', 'BAL-YON-MAVIS350', 'Yonex Mavis 350 Shuttlecocks (tube of 6)', 'BALL', 'Yonex', '950.00', 25, 8, 0],
  ['asics_shoes', 'SHO-ASI-GELRES', 'ASICS Gel-Resolution 9 Tennis Shoes', 'SHOES', 'ASICS', '12999.00', 0, 2, 0],
  ['nike_shoes', 'SHO-NIK-COURT', 'Nike Court Air Zoom Vapor Shoes', 'SHOES', 'Nike', '9495.00', 5, 2, 0],
  ['yonex_shoes', 'SHO-YON-POWERCUSH', 'Yonex Power Cushion Badminton Shoes', 'SHOES', 'Yonex', '6999.00', 7, 3, 0],
  ['string', 'ACC-BAB-RPMBLAST', 'Babolat RPM Blast Racket String (12m)', 'ACCESSORY', 'Babolat', '1200.00', 4, 10, 0],
  ['overgrip', 'ACC-WIL-OVERGRIP3', 'Wilson Pro Overgrip (pack of 3)', 'ACCESSORY', 'Wilson', '499.00', 40, 10, 0],
  ['wristband', 'ACC-NIK-WRIST', 'Nike Wristband (pair)', 'ACCESSORY', 'Nike', '350.00', 25, 6, 0],
  ['bag', 'ACC-HEA-BAG6', 'Head Tour Team 6R Racket Bag', 'ACCESSORY', 'Head', '3299.00', 9, 3, 0],
  ['polo', 'APP-CC-POLO', 'Champions Club Performance Polo', 'APPAREL', 'Champions Club', '1499.00', 33, 10, 0],
  ['tee', 'APP-CC-TEE', 'Champions Club Dri-Fit Tee', 'APPAREL', 'Champions Club', '999.00', 28, 10, 0],
  ['track', 'APP-CC-TRACK', 'Champions Club Track Pants', 'APPAREL', 'Champions Club', '1799.00', 18, 6, 0],
];
const prod = Object.fromEntries(PRODUCTS.map((p) => [p[0], p]));
const SHOP_ORDERS = [
  // key, off, hhmm, channel, fulfillment, status, who(member|guest), items[[prod,qty]], method
  ['s1', -5, '17:20', 'PHYSICAL', 'IN_STORE', 'COMPLETED', 'rohan', [['string', 1], ['overgrip', 2]], 'CARD'],
  ['s2', -4, '12:10', 'PHYSICAL', 'IN_STORE', 'COMPLETED', 'guest:Walk-in Customer|9810055555', [['wilson_balls', 2], ['wristband', 1]], 'CASH'],
  ['s3', -3, '09:30', 'ONLINE', 'PICKUP', 'COMPLETED', 'ananya', [['nike_shoes', 1]], 'ONLINE'],
  ['s4', -2, '14:00', 'ONLINE', 'DELIVERY', 'COMPLETED', 'aarav', [['asics_shoes', 1], ['polo', 2]], 'ONLINE'],
  ['s5', -1, '16:45', 'ONLINE', 'PICKUP', 'READY_FOR_PICKUP', 'ishaan', [['yonex_shoes', 1]], 'ONLINE'],
  ['s6', 0, '10:15', 'ONLINE', 'DELIVERY', 'OUT_FOR_DELIVERY', 'priya', [['track', 1], ['tee', 1]], 'ONLINE'],
  ['s7', 0, '11:40', 'ONLINE', 'DELIVERY', 'PLACED', 'tanvi', [['bag', 1]], 'ONLINE'],
  ['s8', -1, '11:00', 'ONLINE', 'DELIVERY', 'CANCELLED', 'meera', [['overgrip', 1]], 'ONLINE'],
  ['s9', 0, '13:25', 'PHYSICAL', 'IN_STORE', 'COMPLETED', 'kabir', [['shuttles', 2]], 'CARD'],
  ['s10', 0, '12:05', 'ONLINE', 'PICKUP', 'CONFIRMED', 'karan', [['head_padel', 1]], 'ONLINE'],
];
// stock ledger: compute net sold, derive opening
const sold = {}, restocked = {};
for (const o of SHOP_ORDERS) if (o[5] !== 'CANCELLED') for (const [p, q] of o[7]) sold[p] = (sold[p] ?? 0) + q;
for (const p of PRODUCTS) restocked[p[0]] = p[8];
const opening = Object.fromEntries(PRODUCTS.map((p) => [p[0], p[6] - restocked[p[0]] + (sold[p[0]] ?? 0)]));
for (const p of PRODUCTS) if (opening[p[0]] < 0) throw new Error('negative opening stock ' + p[0]);
for (const p of PRODUCTS)
  add('products', { id: uid('products', p[0]), sku: p[1], name: p[2], category: p[3], brand: p[4], description: `${p[2]} — available at the Champions Club shop.`, price: p[5], image_url: null, stock_quantity: p[6], low_stock_threshold: p[7], is_active: true, created_at: ts(-30, '09:00'), updated_at: ts(0, '09:00') });
const movements = []; // collect then sort by time to compute quantity_after
for (const p of PRODUCTS) {
  if (opening[p[0]] > 0) movements.push({ at: tsMs(d(-30), '09:00'), product: p[0], change: opening[p[0]], reason: 'OPENING', note: 'Opening stock', order: null });
  if (restocked[p[0]]) movements.push({ at: tsMs(d(-8), '11:00'), product: p[0], change: restocked[p[0]], reason: 'RESTOCK', note: 'Supplier delivery', order: null });
}
for (const [k, off, hhmm, channel, fulfil, status, who, items, method] of SHOP_ORDERS) {
  const at = tsMs(d(off), hhmm);
  const guest = who.startsWith('guest:');
  const mk = guest ? null : who;
  const ms = mk ? membershipOn(mk, d(off)) : null;
  let sub = 0; const lines = items.map(([p, q]) => { const up = P(prod[p][5]); sub += up * q; return { p, q, up, lt: up * q }; });
  const disc = ms ? pctOf(sub, parseFloat(PLAN[ms.type].s)) : 0;
  const freeAbove = 200000;
  const fee = fulfil === 'DELIVERY' && sub - disc < freeAbove ? 5000 : 0;
  const total = sub - disc + fee;
  const cancelled = status === 'CANCELLED';
  const completed = status === 'COMPLETED';
  const row = add('shop_orders', { id: uid('shop_orders', k), order_number: `SO-${String(data.shop_orders.length + 1).padStart(6, '0')}`, channel, fulfillment: fulfil, status, member_id: mk ? uid('members', mk) : null, membership_id: ms ? uid('memberships', ms.key) : null, guest_name: guest ? who.split(':')[1].split('|')[0] : null, guest_phone: guest ? '+91' + who.split('|')[1] : null, delivery_address: fulfil === 'DELIVERY' ? `${12 + data.shop_orders.length}, Lake View Residency, Baner, Pune 411045` : null, subtotal: M(sub), discount_amount: M(disc), delivery_fee: M(fee), tax_amount: M(taxIncl(total, TAX.SHOP)), total_amount: M(total), payment_status: cancelled ? 'REFUNDED' : 'PAID', notes: k === 's6' ? 'Please hand over to the security desk if I am not home' : null, placed_by_user_id: channel === 'ONLINE' ? uid('users', mk) : uid('users', 'arjun'), completed_at: completed ? iso(at + (fulfil === 'IN_STORE' ? 0 : 6 * 3600000)) : null, cancelled_at: cancelled ? iso(at + 3600000) : null, cancellation_reason: cancelled ? 'Customer changed mind' : null, created_at: iso(at), updated_at: iso(at + 3600000) });
  lines.forEach((l, i) => add('shop_order_items', { id: uid('shop_order_items', `${k}_${i}`), shop_order_id: row.id, product_id: uid('products', l.p), product_name: prod[l.p][2], unit_price: M(l.up), quantity: l.q, line_total: M(l.lt), created_at: iso(at) }));
  for (const l of lines) {
    movements.push({ at, product: l.p, change: -l.q, reason: 'SALE', note: `Order ${row.order_number}`, order: row.id });
    if (cancelled) movements.push({ at: at + 3600000, product: l.p, change: l.q, reason: 'CANCELLATION', note: `Order ${row.order_number} cancelled`, order: row.id });
  }
  pay({ source_type: 'SHOP_ORDER', source_id: row.id, category: 'SHOP', member: mk, payer: guest ? row.guest_name : null, amount: total, method, paidAt: iso(at + 60000), rate: TAX.SHOP, refunded: cancelled ? total : 0, reason: cancelled ? 'Order cancelled — refunded to original method' : null, by: 'arjun' });
}
movements.sort((a, b) => a.at - b.at);
const running = {};
movements.forEach((m, i) => {
  running[m.product] = (running[m.product] ?? 0) + m.change;
  if (running[m.product] < 0) throw new Error('stock went negative for ' + m.product);
  add('inventory_movements', { id: uid('inventory_movements', i), product_id: uid('products', m.product), quantity_change: m.change, quantity_after: running[m.product], reason: m.reason, shop_order_id: m.order, notes: m.note, created_by_user_id: m.reason === 'OPENING' || m.reason === 'RESTOCK' ? uid('users', 'owner') : uid('users', 'arjun'), created_at: iso(m.at) });
});
for (const p of PRODUCTS) if (running[p[0]] !== p[6]) throw new Error(`ledger mismatch ${p[0]}: ${running[p[0]]} vs ${p[6]}`);

// ================================================================== BAR
const MENU = {
  filter_coffee: ['Filter Coffee', 'DRINK', '80.00'], cold_coffee: ['Cold Coffee', 'DRINK', '140.00'], lime_soda: ['Fresh Lime Soda', 'DRINK', '90.00'], oj: ['Fresh Orange Juice', 'DRINK', '130.00'],
  energy: ['Energy Drink', 'DRINK', '160.00'], protein: ['Protein Shake', 'DRINK', '220.00'], soft: ['Soft Drink', 'DRINK', '60.00'],
  veg_sand: ['Veg Club Sandwich', 'SNACK', '150.00'], paneer_sand: ['Paneer Tikka Sandwich', 'SNACK', '180.00'], fries: ['French Fries', 'SNACK', '130.00'],
  wings: ['Chicken Wings (6 pcs)', 'FOOD', '320.00'], burger: ['Veg Burger', 'FOOD', '180.00'], pasta: ['Penne Arrabbiata', 'FOOD', '260.00'], thali: ['Light Lunch Thali', 'FOOD', '280.00'],
};
const MENU_DESC = { filter_coffee: 'South-Indian style filter coffee', cold_coffee: 'Blended iced coffee with ice cream', protein: 'Whey shake with banana (post-match recovery)', veg_sand: 'Triple-decker grilled sandwich with fries', paneer_sand: 'Tandoori paneer, mint chutney, grilled', wings: 'Spicy peri-peri wings with dip', burger: 'Crispy veg patty, cheese, house sauce', pasta: 'Penne in spicy tomato sauce (kitchen out of stock today)', thali: 'Dal, sabzi, roti, rice and curd' };
Object.entries(MENU).forEach(([k, [n, c, p]], i) => add('bar_menu_items', { id: uid('bar_menu_items', k), name: n, category: c, description: MENU_DESC[k] ?? null, price: p, is_available: k !== 'pasta' ? true : false, sort_order: i + 1, created_at: T0, updated_at: T0 }));
const TABLES = { T1: [2, 'OCCUPIED'], T2: [2, 'AVAILABLE'], T3: [4, 'OCCUPIED'], T4: [4, 'AVAILABLE'], T5: [4, 'OCCUPIED'], T6: [6, 'AVAILABLE'], T7: [6, 'OCCUPIED'], T8: [2, 'OUT_OF_SERVICE'] };
Object.entries(TABLES).forEach(([k, [cap, st]]) => add('bar_tables', { id: uid('bar_tables', k), label: k.replace('T', 'Table '), capacity: cap, status: st, created_at: T0, updated_at: ts(0, '17:00') }));

// tabs: key -> {table, who, status, method, settleOff, settleHhmm}
const TABS = {
  tab1: { table: 'T2', who: 'aarav', status: 'SETTLED', method: 'CARD', openOff: -1, open: '19:00', settleOff: -1, settle: '20:40' },
  tab2: { table: 'T6', who: 'ananya', status: 'SETTLED', method: 'UPI', openOff: -1, open: '20:55', settleOff: -1, settle: '21:50' },
  tab3: { table: 'T3', who: 'priya', status: 'OPEN', openOff: 0, open: '15:35' },
  tab4: { table: 'T5', who: 'guest:Imran Qureshi', status: 'OPEN', openOff: 0, open: '16:45' },
};
// orders: key, off, hhmm, table, tab, who, items[[menu,qty]], status, method(for non-tab), taker
const BAR_ORDERS = [
  ['b01', -5, '19:30', 'T4', null, 'guest:Group of 4', [['wings', 1], ['fries', 2], ['soft', 4]], 'SERVED', 'UPI'],
  ['b02', -5, '20:10', 'T2', null, 'rohan', [['cold_coffee', 2], ['paneer_sand', 1]], 'SERVED', 'CARD'],
  ['b03', -5, '21:00', 'T1', null, 'guest:Late Diner', [['burger', 1], ['lime_soda', 1]], 'SERVED', 'CASH'],
  ['b04', -3, '19:40', 'T3', null, 'karan', [['protein', 2], ['veg_sand', 2]], 'SERVED', 'CARD'],
  ['b05', -3, '20:25', 'T5', null, 'guest:Table Guests', [['thali', 2], ['soft', 2]], 'SERVED', 'CASH'],
  ['b06', -2, '18:50', 'T2', null, 'ishaan', [['oj', 1], ['fries', 1]], 'SERVED', 'CASH'],
  ['b07', -2, '19:35', 'T6', null, 'guest:Six Friends', [['wings', 2], ['fries', 3], ['energy', 3]], 'SERVED', 'UPI'],
  ['b08', -2, '20:45', 'T4', null, 'tanvi', [['protein', 1], ['burger', 1]], 'SERVED', 'UPI'],
  ['b09', -1, '19:10', 'T2', 'tab1', 'aarav', [['cold_coffee', 2], ['fries', 1]], 'SERVED', null],
  ['b10', -1, '19:50', 'T2', 'tab1', 'aarav', [['veg_sand', 2], ['oj', 1]], 'SERVED', null],
  ['b11', -1, '20:30', 'T5', null, 'guest:Ravi Menon', [['wings', 1], ['soft', 2]], 'SERVED', 'UPI'],
  ['b12', -1, '21:05', 'T6', 'tab2', 'ananya', [['protein', 2], ['burger', 1]], 'SERVED', null],
  ['b13', -1, '21:30', 'T1', null, 'guest:Mr Shetty', [['filter_coffee', 2]], 'SERVED', 'CASH'],
  ['b14', -1, '20:00', 'T4', null, 'guest:Walk-in Guest', [['pasta', 1]], 'CANCELLED', null],
  ['b15', 0, '14:20', 'T2', null, 'guest:Afternoon Guest', [['soft', 2]], 'SERVED', 'CASH'],
  ['b16', 0, '15:40', 'T3', 'tab3', 'priya', [['lime_soda', 1]], 'SERVED', null],
  ['b17', 0, '16:30', 'T3', 'tab3', 'priya', [['veg_sand', 1], ['fries', 1]], 'SERVED', null],
  ['b18', 0, '17:00', 'T3', 'tab3', 'priya', [['protein', 1]], 'READY', null],
  ['b19', 0, '16:50', 'T5', 'tab4', 'guest:Imran Qureshi', [['energy', 2]], 'SERVED', null],
  ['b20', 0, '17:05', 'T5', 'tab4', 'guest:Imran Qureshi', [['wings', 1, 'extra spicy'], ['fries', 1]], 'PREPARING', null],
  ['b21', 0, '17:08', 'T1', null, 'rohan', [['filter_coffee', 1], ['burger', 1]], 'ACCEPTED', 'PENDING'],
  ['b22', 0, '17:12', 'T7', null, 'guest:Walk-in Guest', [['cold_coffee', 2], ['paneer_sand', 2]], 'NEW', 'PENDING'],
];
const FLOW = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'];
const FLOW_MIN = [0, 2, 5, 15, 22];
const tabTotals = {};
const barRows = {};
for (const [k, off, hhmm, table, tab, who, items, status, method] of BAR_ORDERS) {
  const guest = who.startsWith('guest:');
  const mk = guest ? null : who;
  const gname = guest ? who.split(':')[1] : null;
  const at = tsMs(d(off), hhmm);
  const ms = mk ? membershipOn(mk, d(off)) : null;
  let sub = 0; const lines = items.map(([m, q, n]) => { const up = P(MENU[m][2]); sub += up * q; return { m, q, n: n ?? null, up, lt: up * q }; });
  const disc = ms ? pctOf(sub, parseFloat(PLAN[ms.type].b)) : 0;
  const total = sub - disc;
  const cancelled = status === 'CANCELLED';
  const idx = FLOW.indexOf(status);
  const pstatus = cancelled ? 'NOT_REQUIRED' : tab ? (TABS[tab].status === 'SETTLED' ? 'PAID' : 'PENDING') : method === 'PENDING' ? 'PENDING' : 'PAID';
  const row = add('bar_orders', { id: uid('bar_orders', k), order_number: `BO-${String(data.bar_orders.length + 1).padStart(6, '0')}`, bar_table_id: uid('bar_tables', table), bar_tab_id: tab ? uid('bar_tabs', tab) : null, member_id: mk ? uid('members', mk) : null, membership_id: ms ? uid('memberships', ms.key) : null, guest_name: gname, status, subtotal: M(sub), discount_amount: M(disc), tax_amount: M(taxIncl(total, TAX.BAR)), total_amount: M(total), payment_status: pstatus, notes: k === 'b20' ? 'Extra spicy' : null, taken_by_user_id: uid('users', 'pooja'), ready_at: idx >= 3 ? iso(at + FLOW_MIN[3] * 60000) : null, served_at: idx >= 4 ? iso(at + FLOW_MIN[4] * 60000) : null, cancelled_at: cancelled ? iso(at + 4 * 60000) : null, cancellation_reason: cancelled ? 'Item unavailable — kitchen out of ingredients' : null, created_at: iso(at), updated_at: iso(at + (cancelled ? 4 : FLOW_MIN[Math.max(idx, 0)]) * 60000) });
  barRows[k] = row;
  lines.forEach((l, i) => add('bar_order_items', { id: uid('bar_order_items', `${k}_${i}`), bar_order_id: row.id, bar_menu_item_id: uid('bar_menu_items', l.m), item_name: MENU[l.m][0], unit_price: M(l.up), quantity: l.q, line_total: M(l.lt), notes: l.n, created_at: iso(at) }));
  // status events
  add('order_status_events', { id: uid('order_status_events', `${k}_0`), bar_order_id: row.id, from_status: null, to_status: 'NEW', changed_by_user_id: uid('users', 'pooja'), note: 'Order placed at counter', created_at: iso(at) });
  if (cancelled) add('order_status_events', { id: uid('order_status_events', `${k}_c`), bar_order_id: row.id, from_status: 'NEW', to_status: 'CANCELLED', changed_by_user_id: uid('users', 'ramesh'), note: row.cancellation_reason, created_at: iso(at + 4 * 60000) });
  else for (let i = 1; i <= idx; i++) add('order_status_events', { id: uid('order_status_events', `${k}_${i}`), bar_order_id: row.id, from_status: FLOW[i - 1], to_status: FLOW[i], changed_by_user_id: uid('users', 'ramesh'), note: null, created_at: iso(at + FLOW_MIN[i] * 60000) });
  if (tab && !cancelled) { const t = (tabTotals[tab] ??= { sub: 0, disc: 0, total: 0 }); t.sub += sub; t.disc += disc; t.total += total; }
  if (!tab && !cancelled && pstatus === 'PAID') pay({ source_type: 'BAR_ORDER', source_id: row.id, category: 'BAR', member: mk, payer: gname, amount: total, method, paidAt: iso(at + FLOW_MIN[4] * 60000), rate: TAX.BAR, by: 'pooja' });
}
for (const [k, t] of Object.entries(TABS)) {
  const guest = t.who.startsWith('guest:'); const mk = guest ? null : t.who;
  const tt = tabTotals[k]; const settled = t.status === 'SETTLED';
  const row = add('bar_tabs', { id: uid('bar_tabs', k), tab_number: `TAB-${String(data.bar_tabs.length + 1).padStart(6, '0')}`, bar_table_id: uid('bar_tables', t.table), member_id: mk ? uid('members', mk) : null, guest_name: guest ? t.who.split(':')[1] : null, status: t.status, opened_at: ts(t.openOff, t.open), settled_at: settled ? ts(t.settleOff, t.settle) : null, opened_by_user_id: uid('users', 'pooja'), settled_by_user_id: settled ? uid('users', 'pooja') : null, subtotal: settled ? M(tt.sub) : '0.00', discount_amount: settled ? M(tt.disc) : '0.00', tax_amount: settled ? M(taxIncl(tt.total, TAX.BAR)) : '0.00', total_amount: settled ? M(tt.total) : '0.00', payment_status: settled ? 'PAID' : 'PENDING', created_at: ts(t.openOff, t.open), updated_at: settled ? ts(t.settleOff, t.settle) : ts(t.openOff, t.open) });
  if (settled) pay({ source_type: 'TAB', source_id: row.id, category: 'BAR', member: mk, payer: guest ? row.guest_name : null, amount: tt.total, method: t.method, paidAt: ts(t.settleOff, t.settle), rate: TAX.BAR, by: 'pooja' });
}

// ================================================================== INVOICES
function invoice(k, { type, client = null, member = null, status, issue, due, items, rate, paid = [], notes = null, sent = true }) {
  let sub = 0; const lines = items.map(([desc, q, up]) => { const u = P(up); sub += u * q; return { desc, q, u, lt: u * q }; });
  const tax = pctOf(sub, rate); const total = sub + tax;
  const paidTotal = paid.reduce((a, p) => a + P(p.amount), 0);
  const row = add('invoices', { id: uid('invoices', k), invoice_number: `INV-${String(data.invoices.length + 1).padStart(5, '0')}`, invoice_type: type, business_client_id: client ? uid('business_clients', client) : null, member_id: member ? uid('members', member) : null, status, issue_date: issue, due_date: due, subtotal: M(sub), tax_rate: rate.toFixed(2), tax_amount: M(tax), total_amount: M(total), amount_paid: M(paidTotal), notes, sent_at: sent ? iso(tsMs(issue, '10:00')) : null, voided_at: null, created_by_user_id: uid('users', 'owner'), created_at: iso(tsMs(issue, '09:30')), updated_at: iso(tsMs(issue, '10:00')) });
  lines.forEach((l, i) => add('invoice_items', { id: uid('invoice_items', `${k}_${i}`), invoice_id: row.id, description: l.desc, quantity: l.q, unit_price: M(l.u), line_total: M(l.lt), created_at: iso(tsMs(issue, '09:30')) }));
  for (const p of paid) {
    const amt = P(p.amount);
    const taxPart = Math.round((amt * tax) / total);
    payQueue.push({ source_type: 'INVOICE', source_id: row.id, revenue_category: type === 'BUSINESS' ? 'BUSINESS' : 'MEMBERSHIP', member_id: member ? uid('members', member) : null, business_client_id: client ? uid('business_clients', client) : null, payer_name: null, amount: p.amount, tax_amount: M(taxPart), method: p.method, status: 'SUCCEEDED', gateway_reference: p.method === 'CARD' ? 'AUTH-8841' : p.method === 'ONLINE' ? 'RZP-441902' : p.method === 'UPI' ? 'UPI-993100' : null, received_by_user_id: p.method === 'ONLINE' ? null : uid('users', 'owner'), paid_at: iso(tsMs(p.date, '15:00')), refunded_amount: '0.00', refund_reason: null, refunded_at: null, notes: p.note ?? null });
  }
  return row;
}
invoice('i1', { type: 'BUSINESS', client: 'technova', status: 'PAID', issue: d(-20), due: d(-6), rate: 18, items: [['Corporate tennis day — court hire (4 courts x 4 hrs)', 16, '800.00'], ['Refreshments package (per head)', 40, '250.00']], paid: [{ amount: '26904.00', method: 'ONLINE', date: d(-12) }], notes: 'Corporate sports day' });
invoice('i2', { type: 'BUSINESS', client: 'technova', status: 'PARTIALLY_PAID', issue: d(-5), due: d(10), rate: 18, items: [['Quarterly cricket net booking (12 sessions)', 12, '1200.00']], paid: [{ amount: '10000.00', method: 'UPI', date: d(-3), note: 'Advance payment' }] });
invoice('i3', { type: 'BUSINESS', client: 'greenfield', status: 'OVERDUE', issue: d(-45), due: d(-15), rate: 18, items: [['Team building event — full-day facility hire', 1, '35000.00']], notes: 'Reminder sent twice' });
invoice('i4', { type: 'BUSINESS', client: 'greenfield', status: 'DRAFT', issue: d(0), due: d(14), rate: 18, items: [['Padel court hire (8 sessions)', 8, '1000.00']], sent: false });
invoice('i5', { type: 'MEMBERSHIP', member: 'karan', status: 'SENT', issue: d(-2), due: d(26), rate: 18, items: [['Gold Membership renewal — 12 months', 1, '25423.73']], notes: 'Renewal for the term starting after current expiry' });

{ const v = invoice('i6', { type: 'BUSINESS', client: 'greenfield', status: 'VOID', issue: d(-30), due: d(-16), rate: 18, items: [['Team building event — full-day facility hire (duplicate)', 1, '35000.00']], notes: 'Raised twice by mistake; voided in favour of the earlier invoice' }); v.voided_at = ts(-29, '11:00'); }
// ================================================================== PAYMENTS (sorted + numbered)
payQueue.sort((a, b) => Date.parse(a.paid_at) - Date.parse(b.paid_at));
payQueue.forEach((p, i) => add('payments', { id: uid('payments', i), payment_number: `PAY-${String(i + 1).padStart(7, '0')}`, ...p, created_at: p.paid_at, updated_at: p.refunded_at ?? p.paid_at }));

// ================================================================== STAFF SHIFTS / LEAVE / PAYROLL
const shiftPattern = [['neha', 'FRONT_DESK', '06:00:00', '14:00:00'], ['arjun', 'FRONT_DESK', '14:00:00', '22:00:00'], ['pooja', 'BAR', '16:00:00', '22:00:00'], ['ramesh', 'KITCHEN', '12:00:00', '22:00:00']];
for (let off = -3; off <= 6; off++) for (const [k, area, s, e] of shiftPattern)
  add('staff_shifts', { id: uid('staff_shifts', `${k}_${off}`), staff_id: uid('staff', k), shift_date: d(off), start_time: s, end_time: e, area, notes: (off === lastFri || off === nextFri) ? 'Friday social play — extra floor cover until 22:00' : null, created_by_user_id: uid('users', 'owner'), created_at: ts(-5, '10:00'), updated_at: ts(-5, '10:00') });
const leave = (k, staff, type, s, e, reason, status, note = null) => add('leave_requests', { id: uid('leave_requests', k), staff_id: uid('staff', staff), leave_type: type, start_date: s, end_date: e, reason, status, decided_by_user_id: status === 'PENDING' ? null : uid('users', 'owner'), decided_at: status === 'PENDING' ? null : ts(-1, '10:00'), decision_note: note, created_at: ts(-4, '09:00'), updated_at: ts(-1, '10:00') });
leave('l1', 'arjun', 'CASUAL', d(10), d(11), 'Family function', 'PENDING');
leave('l2', 'pooja', 'SICK', d(-12), d(-11), 'Fever', 'APPROVED');
leave('l3', 'ramesh', 'PAID', d(7), d(9), 'Personal travel', 'REJECTED', 'Weekend tournament — need kitchen manager on site');
leave('l4', 'neha', 'CASUAL', d(20), d(20), 'Medical appointment', 'APPROVED');
const firstOfMonth = (off) => { const x = new Date(Date.parse(d(off) + 'T00:00:00Z')); x.setUTCDate(1); return x.toISOString().slice(0, 10); };
const thisMonth = firstOfMonth(0);
const prevMonth = (() => { const x = new Date(Date.parse(thisMonth + 'T00:00:00Z')); x.setUTCMonth(x.getUTCMonth() - 1); return x.toISOString().slice(0, 10); })();
for (const [k, , , sal] of staffSpecs.filter((s) => parseFloat(s[3]) > 0)) {
  add('payroll_payments', { id: uid('payroll_payments', `${k}_prev`), staff_id: uid('staff', k), pay_period: prevMonth, amount: sal, method: 'UPI', status: 'PAID', paid_on: addDays(thisMonth, 1), paid_by_user_id: uid('users', 'owner'), notes: 'Monthly salary', created_at: ts(-1, '10:00'), updated_at: ts(-1, '10:00') });
  add('payroll_payments', { id: uid('payroll_payments', `${k}_cur`), staff_id: uid('staff', k), pay_period: thisMonth, amount: sal, method: 'UPI', status: 'PENDING', paid_on: null, paid_by_user_id: null, notes: 'Due at month end', created_at: ts(0, '08:00'), updated_at: ts(0, '08:00') });
}

// ================================================================== NOTIFICATIONS
let nn = 0;
const note = (user, type, title, body, entity, entityId, read = false, at = ts(0, '09:00')) =>
  add('notifications', { id: uid('notifications', nn++), user_id: uid('users', user), type, title, body, entity_type: entity, entity_id: entityId, is_read: read, read_at: read ? at : null, created_at: at });
note('meera', 'MEMBERSHIP_EXPIRING', 'Your Silver membership expires soon', `Your membership ends on ${d(9)}. Renew at the front desk or online to keep member rates.`, 'memberships', uid('memberships', 'm_meera'));
note('karan', 'MEMBERSHIP_EXPIRING', 'Your Gold membership expires soon', `Your membership ends on ${d(28)}. A renewal invoice has been issued.`, 'memberships', uid('memberships', 'm_karan'));
note('sneha', 'MEMBERSHIP_EXPIRED', 'Your membership has expired', 'Member rates no longer apply. Renew at the front desk.', 'memberships', uid('memberships', 'm_sneha'), true, ts(-8, '08:00'));
note('aarav', 'BOOKING_CONFIRMED', 'Court booked', 'Tennis Court 1 — today 18:00.', 'court_bookings', uid('court_bookings', `b_0_18:00_T1`));
note('ananya', 'BOOKING_CONFIRMED', 'Court booked', 'Tennis Court 1 — tomorrow 07:00.', 'court_bookings', uid('court_bookings', `b_1_07:00_T1`));
note('ananya', 'BOOKING_CANCELLED', 'Booking cancelled — refund issued', 'Your ₹400 booking was refunded.', 'court_bookings', uid('court_bookings', `b_-1_18:00_B1`), true, ts(-1, '10:00'));
note('priya', 'SHOP_ORDER_UPDATE', 'Your order is out for delivery', 'Order will reach you today.', 'shop_orders', uid('shop_orders', 's6'));
note('ishaan', 'SHOP_ORDER_UPDATE', 'Your order is ready for pickup', 'Collect from the club shop.', 'shop_orders', uid('shop_orders', 's5'));
note('priya', 'ORDER_READY', 'Your bar order is ready', 'Protein Shake — Table 3.', 'bar_orders', uid('bar_orders', 'b18'));
note('owner', 'LOW_STOCK', 'Low stock: ASICS Gel-Resolution 9', 'Out of stock — reorder required.', 'products', uid('products', 'asics_shoes'));
note('owner', 'LOW_STOCK', 'Low stock: Babolat RPM Blast String', 'Only 4 left (threshold 10).', 'products', uid('products', 'string'));
note('owner', 'LOW_STOCK', 'Low stock: Wilson US Open Balls', 'Only 3 left (threshold 5).', 'products', uid('products', 'wilson_balls'));
note('owner', 'LEAVE_REQUESTED', 'Leave request from Arjun Mehta', 'Casual leave requested.', 'leave_requests', uid('leave_requests', 'l1'));
note('owner', 'NEW_ENQUIRY', 'New enquiry: Pranav Kulkarni', 'Gold membership interest.', 'enquiries', uid('enquiries', 'e_gold'));
note('neha', 'NEW_ENQUIRY', 'New enquiry: Anita Deshmukh', 'General enquiry via website.', 'enquiries', uid('enquiries', 'e_general'));
note('neha', 'NEW_ENQUIRY', 'Trial request: Siddharth Rao', 'Tennis trial requested.', 'enquiries', uid('enquiries', 'e_trial'), true, ts(-1, '20:15'));
note('ramesh', 'SHIFT_ASSIGNED', 'Shift assigned', 'Kitchen 12:00–22:00 this week.', 'staff_shifts', uid('staff_shifts', 'ramesh_0'), true, ts(-5, '10:00'));
note('sanjay', 'INVOICE_ISSUED', 'Invoice issued', 'Invoice for cricket net bookings is due soon.', 'invoices', uid('invoices', 'i2'), false, ts(-5, '10:00'));
note('sanjay', 'PAYMENT_RECEIVED', 'Payment received', '₹10,000.00 received via UPI.', 'invoices', uid('invoices', 'i2'), true, ts(-3, '15:00'));

// ================================================================== SETTINGS
const setting = (key, value, description, isPublic) => add('club_settings', { id: uid('club_settings', key), key, value, description, is_public: isPublic, updated_by_user_id: uid('users', 'owner'), created_at: T0, updated_at: T0 });
setting('club_name', 'The Champions Club', 'Club display name', true);
setting('club_tagline', 'Play. Train. Belong.', 'Website tagline', true);
setting('club_description', 'A busy neighbourhood sports club with tennis, cricket, padel and badminton courts, a gear shop and a bar & cafeteria.', 'Homepage introduction', true);
setting('club_address', 'Plot 12, Sports Enclave, Baner Road, Pune 411045', 'PLACEHOLDER address — replace with the real one', true);
setting('club_phone', '+91 20 5550 1234', 'PLACEHOLDER phone', true);
setting('club_email', 'hello@championsclub.example', 'PLACEHOLDER email', true);
setting('club_open_time', '06:00:00', 'Courts open (IST)', true);
setting('club_close_time', '22:00:00', 'Courts close (IST); last session must END by this time', true);
setting('social_play_weekday', 5, 'ISO weekday for social play (1=Mon .. 7=Sun); 5 = Friday', true);
setting('social_play_start_time', '18:00:00', 'Social play window start (IST)', true);
setting('social_play_end_time', '22:00:00', 'Social play window end (IST)', true);
setting('cancellation_cutoff_hours', 2, 'Cancel at least this many hours before start for a full refund', false);
setting('low_stock_default_threshold', 5, 'Default low_stock_threshold for new products', false);
setting('membership_expiry_warning_days', 30, 'Notify members this many days before expiry', false);
setting('delivery_fee', '50.00', 'Shop delivery fee (INR)', false);
setting('free_delivery_above', '2000.00', 'Free delivery when order value after discount is at least this (INR)', false);
setting('tax_rate_court', '18.00', 'GST % included in court prices', false);
setting('tax_rate_membership', '18.00', 'GST % included in membership prices', false);
setting('tax_rate_shop', '18.00', 'GST % included in shop prices', false);
setting('tax_rate_bar', '5.00', 'GST % included in bar & cafeteria prices', false);
setting('tax_rate_business', '18.00', 'GST % added to business invoices (tax-exclusive)', false);

// ================================================================== OUTPUT
mkdirSync(path.join(ROOT, 'mock-data'), { recursive: true });
mkdirSync(path.join(ROOT, 'database/seed'), { recursive: true });
for (const [t, rows] of Object.entries(data)) writeFileSync(path.join(ROOT, 'mock-data', t.replace(/_/g, '-') + '.json'), JSON.stringify(rows, null, 2) + '\n');

// ---- seed.sql (insert order = FK-safe)
const ORDER = ['users', 'members', 'staff', 'business_clients', 'membership_plans', 'memberships', 'enquiries', 'enquiry_follow_ups', 'quotes', 'courts', 'court_bookings', 'social_sessions', 'social_session_participants', 'products', 'shop_orders', 'shop_order_items', 'inventory_movements', 'bar_menu_items', 'bar_tables', 'bar_tabs', 'bar_orders', 'bar_order_items', 'order_status_events', 'payments', 'invoices', 'invoice_items', 'staff_shifts', 'leave_requests', 'payroll_payments', 'notifications', 'club_settings'];
if (ORDER.length !== tableIndex.length || tableIndex.some((t) => !ORDER.includes(t))) throw new Error('seed ORDER must list every table: ' + tableIndex.filter((t) => !ORDER.includes(t)));
const lit = (v, col) => {
  if (v === null) return 'NULL';
  if (col.type === 'jsonb') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (col.type === 'text[]') return `ARRAY[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]::text[]`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
let sql = `-- GENERATED by tools/gen-mock.mjs (base date ${BASE}) — DO NOT EDIT BY HAND. Source of truth: mock-data/*.json\n-- Dev login for every account: password "${PASSWORD}"\nBEGIN;\n`;
for (const t of ORDER) {
  const cols = schema.tables[t].columns;
  if (!data[t].length) continue;
  sql += `\n-- ${t} (${data[t].length})\nINSERT INTO ${t} (${cols.map((c) => c.name).join(', ')}) VALUES\n`;
  sql += data[t].map((r) => '  (' + cols.map((c) => lit(r[c.name], c)).join(', ') + ')').join(',\n') + ';\n';
}
const seqs = { seq_member_code: data.members.length, seq_employee_code: data.staff.length, seq_booking_number: data.court_bookings.length, seq_shop_order_number: data.shop_orders.length, seq_bar_order_number: data.bar_orders.length, seq_tab_number: data.bar_tabs.length, seq_payment_number: data.payments.length, seq_invoice_number: data.invoices.length, seq_quote_number: data.quotes.length };
sql += '\n-- advance human-readable number sequences past the seeded rows\n';
for (const [s, n] of Object.entries(seqs)) sql += `SELECT setval('${s}', ${n}, true);\n`;
sql += '\nCOMMIT;\n';
writeFileSync(path.join(ROOT, 'database/seed/seed.sql'), sql);
console.log(`mock-data generated for base date ${BASE} (nextFri=+${nextFri}, lastFri=${lastFri})`);
console.log(Object.entries(data).map(([t, r]) => `${t}=${r.length}`).join(' '));
