/**
 * Read-only reference data for the dashboards: members, courts, plans, staff, enquiries and the deterministic
 * analytics series. Real seed records come from mock-data/*.json; the club's longer history (a few hundred members,
 * six months of daily revenue) is generated with a fixed-seed PRNG so every run — and every judge's screen — is identical.
 */
import type { MembershipType } from '@shared/constants/enums';
import type { Court, Enquiry, LeaveRequest, Member, Membership, MembershipPlan, PayrollPayment, Staff, StaffShift, User } from '@shared/types/rows';
import type { MembershipStatus } from '@shared/constants/enums';
import { addDays } from '@shared/lib/time';

import courtsJson from '@mock/courts.json';
import enquiriesJson from '@mock/enquiries.json';
import leaveJson from '@mock/leave-requests.json';
import membersJson from '@mock/members.json';
import membershipsJson from '@mock/memberships.json';
import plansJson from '@mock/membership-plans.json';
import payrollJson from '@mock/payroll-payments.json';
import shiftsJson from '@mock/staff-shifts.json';
import staffJson from '@mock/staff.json';
import applicationsJson from '@mock/employee-applications.json';
import usersJson from '@mock/users.json';
import { DEMO_TODAY, type DApplication, type DCourt, type DMember, type DStaff } from './types';

const as = <T,>(v: unknown) => v as T;
const users = as<User[]>(usersJson);
const members = as<Member[]>(membersJson);
/** Membership status is derived from the dates (SQL view membership_terms), never stored. */
const termStatus = (m: Membership): MembershipStatus => (m.cancelled_at ? 'CANCELLED' : m.end_date < DEMO_TODAY ? 'EXPIRED' : m.start_date > DEMO_TODAY ? 'UPCOMING' : 'ACTIVE');
const memberships = as<Membership[]>(membershipsJson);
export const plans = as<MembershipPlan[]>(plansJson);
export const enquiriesRaw = as<Enquiry[]>(enquiriesJson);
const staffRaw = as<Staff[]>(staffJson);
const shiftsRaw = as<StaffShift[]>(shiftsJson);
const leaveRaw = as<LeaveRequest[]>(leaveJson);
const payrollRaw = as<PayrollPayment[]>(payrollJson);

/** Deactivated courts (owner only, live mode): kept out of every booking list, shown on the owner's court catalogue so they can be reactivated. */
export const inactiveCourts: DCourt[] = [];

export const courts: DCourt[] = as<Court[]>(courtsJson)
  .filter((c) => c.is_active)
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((c) => ({ id: c.id, name: c.name, sport: c.sport_type, rate: parseFloat(c.walk_in_rate_per_hour), surface: c.surface, description: c.description }));

/* ---------------------------------------------------------------- PRNG */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- members */
const PLAN_BY_TYPE = Object.fromEntries(plans.map((p) => [p.membership_type, p])) as Record<MembershipType, MembershipPlan>;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function realMember(m: Member): DMember {
  const u = users.find((x) => x.id === m.user_id)!;
  const mine = memberships.filter((x) => x.member_id === m.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const effective = mine.find((x) => termStatus(x) === 'ACTIVE' && x.start_date <= DEMO_TODAY && DEMO_TODAY <= x.end_date);
  const shown = effective ?? mine[0];
  const plan = shown ? plans.find((p) => p.id === shown.membership_plan_id)! : null;
  const status: DMember['status'] = effective ? 'ACTIVE' : shown ? (termStatus(shown) === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED') : 'NONE';
  const live = status === 'ACTIVE' && plan;
  return {
    id: m.id,
    user_id: m.user_id,
    code: m.member_code,
    name: u.full_name,
    email: u.email,
    phone: u.phone ?? '',
    joined_on: m.joined_on,
    type: plan?.membership_type ?? null,
    plan_name: plan ? plan.name.replace(/ Membership$/, '') : 'No plan',
    status,
    start_date: shown?.start_date ?? null,
    end_date: shown?.end_date ?? null,
    days_left: shown && status === 'ACTIVE' ? daysBetween(DEMO_TODAY, shown.end_date) : null,
    price_paid: shown ? parseFloat(shown.price_paid) : 0,
    court_pct: live ? parseFloat(plan.court_discount_percent) : 0,
    shop_pct: live ? parseFloat(plan.shop_discount_percent) : 0,
    bar_pct: live ? parseFloat(plan.bar_discount_percent) : 0,
    max_plays: plan?.max_plays_per_day ?? 2,
    active: u.is_active,
    address: m.address,
    synthetic: false,
  };
}

const FIRST = ['Aditya', 'Neha', 'Rahul', 'Kavya', 'Rohit', 'Isha', 'Siddharth', 'Ananya', 'Vivek', 'Pooja', 'Arnav', 'Shruti', 'Nikhil', 'Tara', 'Manav', 'Riya', 'Yash', 'Sana', 'Dev', 'Mira', 'Kunal', 'Ira', 'Varun', 'Nisha', 'Harsh', 'Divya', 'Lakshya', 'Aisha', 'Jay', 'Simran'];
const LAST = ['Sharma', 'Patel', 'Iyer', 'Gupta', 'Reddy', 'Nair', 'Mehta', 'Kulkarni', 'Singh', 'Joshi', 'Bhatt', 'Chopra', 'Menon', 'Kapoor', 'Desai', 'Pillai', 'Rao', 'Malhotra', 'Shah', 'Bose'];

function syntheticMembers(count: number): DMember[] {
  const r = rng(20261003);
  const out: DMember[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const roll = r();
    const type: MembershipType | null = roll < 0.4 ? 'SILVER' : roll < 0.7 ? 'GOLD' : roll < 0.86 ? 'JUNIOR' : null;
    const joinedAgo = Math.floor(r() * 330) + 3;
    const joined = addDays(DEMO_TODAY, -joinedAgo);
    const plan = type ? PLAN_BY_TYPE[type] : null;
    const end = plan ? addDays(joined, 364) : null;
    const expired = plan && end! < DEMO_TODAY;
    out.push({
      id: `syn-${i}`,
      user_id: `syn-u-${i}`,
      code: `CCM-${String(14 + i).padStart(5, '0')}`,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}${i}@example.com`,
      phone: `+9198${String(10_000_000 + Math.floor(r() * 89_999_999))}`,
      joined_on: joined,
      type,
      plan_name: plan ? plan.name.replace(/ Membership$/, '') : 'No plan',
      status: !plan ? 'NONE' : expired ? 'EXPIRED' : 'ACTIVE',
      start_date: plan ? joined : null,
      end_date: end,
      days_left: plan && !expired ? daysBetween(DEMO_TODAY, end!) : null,
      price_paid: plan ? parseFloat(plan.price) : 0,
      court_pct: plan && !expired ? parseFloat(plan.court_discount_percent) : 0,
      shop_pct: plan && !expired ? parseFloat(plan.shop_discount_percent) : 0,
      bar_pct: plan && !expired ? parseFloat(plan.bar_discount_percent) : 0,
      max_plays: 2,
      active: true,
      address: null,
      synthetic: true,
    });
  }
  return out;
}

export const REAL_MEMBERS: DMember[] = members.map(realMember);
export const ALL_MEMBERS: DMember[] = [...REAL_MEMBERS, ...syntheticMembers(131)];
export const memberById = (id: string | null | undefined) => (id ? ALL_MEMBERS.find((m) => m.id === id) : undefined);

/** "CCM-00001", "ccm1", "1" or a name fragment → the matching member (first hit). */
export function findMember(query: string): DMember | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const digits = q.replace(/\D/g, '');
  if (/^(ccm-?)?\d+$/.test(q) && digits) {
    const code = `ccm-${digits.padStart(5, '0')}`;
    return ALL_MEMBERS.find((m) => m.code.toLowerCase() === code);
  }
  return ALL_MEMBERS.find((m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase() === q || m.phone.replace(/\D/g, '').endsWith(digits.length >= 4 ? digits : '#'));
}

export const planCards = plans.map((p) => ({ id: p.id, type: p.membership_type, name: p.name.replace(/ Membership$/, ''), price: parseFloat(p.price), court: parseFloat(p.court_discount_percent), shop: parseFloat(p.shop_discount_percent), bar: parseFloat(p.bar_discount_percent), benefits: p.benefits, maxPlays: p.max_plays_per_day }));

/* ---------------------------------------------------------------- enquiries / staff */
export const enquiries = enquiriesRaw
  .slice()
  .sort((a, b) => b.created_at.localeCompare(a.created_at))
  .map((e) => ({ id: e.id, name: e.name, phone: e.phone, email: e.email, type: e.enquiry_type, status: (e.handled_at ? 'HANDLED' : 'NEW') as 'NEW' | 'HANDLED', message: e.message, created_at: e.created_at, sport: e.sport_type, preferred: e.preferred_start_at, booking_id: e.trial_booking_id }));

const EXTRA_STAFF = [
  { name: 'Imran Sheikh', designation: 'Head Tennis Coach', area: 'COURTS', salary: 52000, phone: '+919820000011', role: 'COACH' },
  { name: 'Sunita Rao', designation: 'Padel & Badminton Coach', area: 'COURTS', salary: 44000, phone: '+919820000012', role: 'COACH' },
  { name: 'Ganesh Pawar', designation: 'Head Groundskeeper', area: 'COURTS', salary: 30000, phone: '+919820000013', role: 'GROUNDS' },
  { name: 'Farah Khan', designation: 'Bar & Café Associate', area: 'BAR', salary: 24000, phone: '+919820000014', role: 'BAR' },
];

export const staff: DStaff[] = [
  ...staffRaw.map((s): DStaff => {
    const u = users.find((x) => x.id === s.user_id)!;
    const shift = shiftsRaw.find((x) => x.staff_id === s.id && x.shift_date === DEMO_TODAY);
    const pay = payrollRaw.filter((p) => p.staff_id === s.id).sort((a, b) => b.pay_period.localeCompare(a.pay_period))[0];
    return { id: s.id, user_id: s.user_id, name: u.full_name, email: u.email, designation: s.designation, role: u.role as string, area: u.role === 'KITCHEN_MANAGER' ? 'BAR' : u.role === 'FRONT_DESK' ? 'COURTS' : u.role === 'STORE_MANAGER' ? 'SHOP' : 'MANAGEMENT', salary: parseFloat(s.monthly_salary), phone: u.phone ?? '', shift: shift ? `${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}` : 'Off today', payroll: pay ? (pay.paid_on ? 'PAID' : 'PENDING') : 'PENDING', on_duty: !!shift && shift.start_time <= '17:15:00' && shift.end_time > '17:15:00', active: u.is_active };
  }),
  ...EXTRA_STAFF.map((s, i): DStaff => ({ id: `xs-${i}`, name: s.name, email: '', designation: s.designation, role: s.role, area: s.area, salary: s.salary, phone: s.phone, shift: i % 2 ? '14:00–22:00' : '06:00–14:00', payroll: 'PENDING', on_duty: i % 2 === 1, active: true })),
];

/** Job applications waiting for (or already decided by) the owner. Live mode refills this in place from the API. */
export const applications: DApplication[] = (applicationsJson as unknown as { id: string; full_name: string; email: string; phone: string | null; status: DApplication['status']; approved_role: string | null; applied_at: string; reviewed_at: string | null; decision_note: string | null }[])
  .map((a) => ({ id: a.id, name: a.full_name, email: a.email, phone: a.phone ?? '', status: a.status, role: a.approved_role, applied_at: a.applied_at, reviewed_at: a.reviewed_at, reviewed_by: a.reviewed_at ? 'Owner' : null, note: a.decision_note }))
  .sort((a, b) => b.applied_at.localeCompare(a.applied_at));

export const leaveRequests = leaveRaw.map((l) => ({ id: l.id, staff: staff.find((s) => s.id === l.staff_id)?.name ?? 'Staff', type: 'LEAVE', from: l.start_date, to: l.end_date, status: l.status, reason: l.reason, staff_id: l.staff_id, note: l.decision_note, submitted: l.created_at, decided_at: l.decided_at }));

/** The signed-in employee's own pay: salary now and the payments actually made (live mode only; filled by store/live.ts). */
export const myPay = { salary: 0, payroll: [] as { id: string; period: string; amount: number; method: string; paid_on: string | null }[] };

/* ---------------------------------------------------------------- analytics (deterministic, last 186 days) */
export const DAYS = 186;
export interface Daily {
  date: string;
  court: number;
  membership: number;
  shop: number;
  bar: number;
  business: number;
  payroll: number;
  utilities: number;
  stock: number;
  maintenance: number;
  marketing: number;
  bookings: number;
  cancellations: number;
  newMembers: number;
}

function buildDaily(): Daily[] {
  const r = rng(77_031);
  const out: Daily[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(DEMO_TODAY, -i);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sun
    const weekend = dow === 0 || dow === 6 ? 1.35 : dow === 5 ? 1.2 : 1;
    const trend = 0.78 + ((DAYS - i) / DAYS) * 0.4; // growing club
    const j = (n: number) => 1 + (r() - 0.5) * n;
    const bookings = Math.round(22 * weekend * trend * j(0.4));
    const court = Math.round(bookings * 780 * j(0.15));
    const joins = r() < 0.55 * trend ? 1 + (r() < 0.25 ? 1 : 0) : 0;
    const membership = joins ? Math.round(joins * (r() < 0.35 ? 30_000 : r() < 0.7 ? 15_000 : 7_500)) : 0;
    const dom = Number(date.slice(8));
    out.push({
      date,
      court,
      membership,
      shop: Math.round(10_500 * weekend * trend * j(0.7)),
      bar: Math.round(19_000 * (dow === 5 || dow === 6 ? 1.5 : 1) * trend * j(0.35)),
      business: r() < 0.09 ? Math.round(18_000 + r() * 42_000) : 0,
      payroll: dom === 1 ? 204_000 : 0,
      utilities: Math.round(1_600 * j(0.3)),
      stock: r() < 0.3 ? Math.round(8_000 + r() * 22_000) : 0,
      maintenance: r() < 0.08 ? Math.round(4_000 + r() * 14_000) : 0,
      marketing: r() < 0.12 ? Math.round(2_500 + r() * 6_000) : 0,
      bookings,
      cancellations: Math.round(bookings * (0.05 + r() * 0.06)),
      newMembers: joins,
    });
  }
  return out;
}
export const DAILY: Daily[] = buildDaily();

export const revenueOf = (d: Daily) => d.court + d.membership + d.shop + d.bar + d.business;
export const expenseOf = (d: Daily) => d.payroll + d.utilities + d.stock + d.maintenance + d.marketing;

export const sumDaily = (rows: Daily[], f: (d: Daily) => number) => rows.reduce((a, d) => a + f(d), 0);
export const lastDays = (n: number, offset = 0) => DAILY.slice(DAILY.length - n - offset, DAILY.length - offset);

export type Grain = 'DAY' | 'WEEK' | 'MONTH';
const fmtDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMon = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

/** Groups the daily series into days (last 30), ISO weeks (last 12) or calendar months (last 6). */
export function bucket(grain: Grain) {
  let groups: { label: string; rows: Daily[] }[] = [];
  if (grain === 'DAY') groups = lastDays(30).map((d) => ({ label: fmtDay.format(new Date(`${d.date}T00:00:00Z`)), rows: [d] }));
  if (grain === 'WEEK') {
    const rows = DAILY.slice(-84);
    for (let i = 0; i < 12; i++) {
      const chunk = rows.slice(i * 7, i * 7 + 7);
      groups.push({ label: fmtDay.format(new Date(`${chunk[0].date}T00:00:00Z`)), rows: chunk });
    }
  }
  if (grain === 'MONTH') {
    // rolling 30-day windows ending today, so the newest point is never a partial calendar month
    const rows = DAILY.slice(-180);
    for (let i = 0; i < 6; i++) {
      const chunk = rows.slice(i * 30, i * 30 + 30);
      groups.push({ label: fmtMon.format(new Date(`${chunk[chunk.length - 1].date}T00:00:00Z`)), rows: chunk });
    }
  }
  const pick = (f: (d: Daily) => number) => groups.map((g) => sumDaily(g.rows, f));
  return {
    labels: groups.map((g) => g.label),
    revenue: pick(revenueOf),
    expenses: pick(expenseOf),
    court: pick((d) => d.court),
    membership: pick((d) => d.membership),
    shop: pick((d) => d.shop),
    bar: pick((d) => d.bar),
    business: pick((d) => d.business),
    bookings: pick((d) => d.bookings),
    cancellations: pick((d) => d.cancellations),
    newMembers: pick((d) => d.newMembers),
  };
}

/** Members on the books at month ends (for the membership trend line). */
export function membershipTrend() {
  const months: { label: string; total: number; gold: number; silver: number; junior: number }[] = [];
  const active = ALL_MEMBERS.filter((m) => m.status === 'ACTIVE');
  for (let k = 5; k >= 0; k--) {
    const cutoff = addDays(DEMO_TODAY, -k * 30);
    const upTo = ALL_MEMBERS.filter((m) => m.joined_on <= cutoff && (m.status === 'ACTIVE' || m.status === 'EXPIRED'));
    const c = (t: MembershipType) => upTo.filter((m) => m.type === t).length;
    months.push({ label: fmtMon.format(new Date(`${cutoff}T00:00:00Z`)), total: upTo.length, gold: c('GOLD'), silver: c('SILVER'), junior: c('JUNIOR') });
  }
  months[months.length - 1].total = ALL_MEMBERS.length;
  return { months, active: active.length };
}
