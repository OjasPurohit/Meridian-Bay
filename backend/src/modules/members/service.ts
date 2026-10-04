/**
 * Members and memberships (R-MEM-01..11). Status is derived by SQL views from dates; a plan change or renewal always
 * inserts a new `memberships` row (the table is the history). Payments go through the payments ledger.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PAYMENT_METHOD, USER_ROLE, type PaymentMethod } from '@shared/constants/enums';
import type { MemberDetail, MemberHistoryEvent, MemberSummary, MembershipPurchaseResult, MembershipView } from '@shared/types/api';
import type { MembershipPlan, Payment } from '@shared/types/rows';
import type {
  MembersCreateRequest, MembersUpdateRequest, MembershipsChangePlanRequest, MembershipsPurchaseRequest,
} from '@shared/types/requests.generated';
import { addDays, istDate, termEndDate } from '@shared/lib/time';
import { getConfig } from '../../config';
import { invalidateUserCache, type AuthUser } from '../../kernel/auth';
import { withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { SettingsService } from '../../kernel/settings';
import { offsetOf } from '../../kernel/validate';
import { recordPayment } from '../payments/service';
import * as repo from './repo';

const today = () => istDate(new Date());
const isStaff = (u: AuthUser) => u.role !== USER_ROLE.MEMBER;

function ageOn(dob: string, date: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = date.split('-').map(Number) as [number, number, number];
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

async function withPlans(rows: repo.MembershipRow[]): Promise<MembershipView[]> {
  const plans = new Map((await repo.listPlans(repo.pool, false)).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, plan: plans.get(r.membership_plan_id)! }));
}

/** Creates the new term + its payment inside the caller's transaction (R-MEM-03/06/07). */
export async function buyMembership(
  tx: Tx,
  o: { member_id: string; plan_id: string; method: PaymentMethod; received_by_user_id: string | null; start_date?: string; gateway_reference?: string },
): Promise<{ membership_id: string; payment_id: string }> {
  const plan = await repo.planById(tx, o.plan_id);
  if (!plan || !plan.is_active) throw new AppError('MEMBERSHIP_PLAN_NOT_FOUND');
  const member = await repo.summaryById(tx, o.member_id);
  if (!member) throw new AppError('MEMBER_NOT_FOUND');

  // Early renewal: the new term starts the day after the current one ends, only inside the warning window.
  const current = (await repo.membershipsOf(tx, o.member_id)).filter((m) => m.status === 'ACTIVE' || m.status === 'UPCOMING').sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
  let start = o.start_date ?? today();
  if (current) {
    const window = Number(await SettingsService.get<number>('membership_expiry_warning_days'));
    if (current.status === 'UPCOMING' || current.end_date > addDays(today(), window)) throw new AppError('MEMBERSHIP_ALREADY_ACTIVE');
    start = addDays(current.end_date, 1);
  }
  if (plan.max_age !== null) {
    if (!member.date_of_birth) throw new AppError('JUNIOR_AGE_INVALID', { reason: 'Date of birth is required for a junior plan.' });
    if (ageOn(member.date_of_birth, start) > plan.max_age) throw new AppError('JUNIOR_AGE_INVALID');
  }
  const membership_id = await repo.insertMembership(tx, { member_id: o.member_id, membership_plan_id: plan.id, start_date: start, end_date: termEndDate(start, plan.duration_months), price_paid: plan.price });
  const payment_id = await recordPayment(tx, { source_type: 'MEMBERSHIP', source_id: membership_id, method: o.method, received_by_user_id: o.received_by_user_id, gateway_reference: o.gateway_reference });
  return { membership_id, payment_id };
}

function checkMethod(user: AuthUser, method: PaymentMethod): void {
  const ok = user.role === USER_ROLE.MEMBER ? method === PAYMENT_METHOD.ONLINE : user.role === USER_ROLE.OWNER_ADMIN || method !== PAYMENT_METHOD.ONLINE;
  if (!ok) throw new AppError('FORBIDDEN', { reason: `Role ${user.role} may not take ${method} payments.` });
}

export const MembersService = {
  list: async (q: repo.MemberFilter & { page: number; page_size: number }) => repo.list(repo.pool, q, q.page_size, offsetOf(q)),

  async get(user: AuthUser, id: string): Promise<MemberDetail> {
    if (!isStaff(user) && user.member_id !== id) throw new AppError('MEMBER_NOT_FOUND'); // own record only
    const m = await repo.detailById(repo.pool, id);
    if (!m) throw new AppError('MEMBER_NOT_FOUND');
    return m;
  },

  async create(user: AuthUser, body: MembersCreateRequest): Promise<MemberDetail> {
    const password = body.initial_password ?? `Cc${randomBytes(5).toString('hex')}9`;
    const password_hash = await bcrypt.hash(password, getConfig().bcrypt_rounds);
    if (body.membership_plan_id && !body.payment_method) throw new AppError('VALIDATION_ERROR', { fields: { payment_method: 'Required when buying a plan.' } });
    if (body.payment_method) checkMethod(user, body.payment_method);
    const id = await withTransaction(async (tx) => {
      const user_id = await repo.insertMemberUser(tx, { email: body.email, password_hash, full_name: body.full_name, phone: body.phone, must_change_password: true });
      const id = await repo.insertMember(tx, { user_id, date_of_birth: body.date_of_birth ?? null, address: body.address ?? null, emergency_contact_name: body.emergency_contact_name ?? null, emergency_contact_phone: body.emergency_contact_phone ?? null });
      if (body.membership_plan_id) await buyMembership(tx, { member_id: id, plan_id: body.membership_plan_id, method: body.payment_method!, received_by_user_id: user.id });
      return id;
    });
    return (await repo.detailById(repo.pool, id))!;
  },

  async update(user: AuthUser, id: string, body: MembersUpdateRequest): Promise<MemberDetail> {
    if (!isStaff(user) && user.member_id !== id) throw new AppError('MEMBER_NOT_FOUND');
    if (body.is_active !== undefined && user.role !== USER_ROLE.OWNER_ADMIN) throw new AppError('FORBIDDEN');
    const entries = Object.entries(body).filter(([, v]) => v !== undefined) as [string, unknown][];
    const user_id = await withTransaction(async (tx) => {
      const m = await repo.summaryById(tx, id);
      if (!m) throw new AppError('MEMBER_NOT_FOUND');
      await repo.updateMember(tx, id, entries.filter(([c]) => (repo.MEMBER_UPDATABLE as readonly string[]).includes(c)));
      await repo.updateUserOfMember(tx, id, entries.filter(([c]) => (repo.USER_UPDATABLE as readonly string[]).includes(c)));
      if (body.is_active !== undefined) await tx.query('UPDATE users SET is_active = $2 WHERE id = $1', [m.user_id, body.is_active]);
      return m.user_id;
    });
    invalidateUserCache(user_id);
    return (await repo.detailById(repo.pool, id))!;
  },

  /** Everything the member did, newest first (bookings, memberships, orders, payments). */
  async history(user: AuthUser, id: string, q: { event_type?: string; from?: string; to?: string }): Promise<MemberHistoryEvent[]> {
    if (!isStaff(user) && user.member_id !== id) throw new AppError('MEMBER_NOT_FOUND');
    if (!(await repo.summaryById(repo.pool, id))) throw new AppError('MEMBER_NOT_FOUND');
    const { rows } = await repo.pool.query<MemberHistoryEvent>(
      `SELECT * FROM (
         SELECT 'BOOKING' AS event_type, b.start_at AS occurred_at, c.name || ' booking' AS title, t.status::text AS status, t.amount_due::text AS amount, 'court_bookings' AS entity_type, b.id AS entity_id
           FROM court_bookings b JOIN courts c ON c.id = b.court_id JOIN court_booking_totals t ON t.court_booking_id = b.id WHERE b.member_id = $1
         UNION ALL
         SELECT 'MEMBERSHIP', m.created_at, pl.name || ' purchased', m.status::text, m.price_paid::text, 'memberships', m.id
           FROM membership_terms m JOIN membership_plans pl ON pl.id = m.membership_plan_id WHERE m.member_id = $1
         UNION ALL
         SELECT 'SHOP_ORDER', o.created_at, 'Shop order ' || o.order_number, o.status::text, t.total_amount::text, 'shop_orders', o.id
           FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id WHERE o.member_id = $1
         UNION ALL
         SELECT 'BAR_ORDER', o.created_at, 'Cafe order ' || o.order_number, o.status::text, t.total_amount::text, 'bar_orders', o.id
           FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id WHERE o.member_id = $1
         UNION ALL
         SELECT 'PAYMENT', p.paid_at, 'Payment ' || p.payment_number, l.status::text, p.amount::text, 'payments', p.id
           FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE p.member_id = $1
       ) h WHERE ($2::text IS NULL OR h.event_type = $2) AND ($3::date IS NULL OR (h.occurred_at AT TIME ZONE 'Asia/Kolkata')::date >= $3) AND ($4::date IS NULL OR (h.occurred_at AT TIME ZONE 'Asia/Kolkata')::date <= $4)
       ORDER BY occurred_at DESC LIMIT 200`,
      [id, q.event_type ?? null, q.from ?? null, q.to ?? null],
    );
    return rows;
  },

  async memberships(user: AuthUser, id: string): Promise<MembershipView[]> {
    if (!isStaff(user) && user.member_id !== id) throw new AppError('MEMBER_NOT_FOUND');
    return withPlans(await repo.membershipsOf(repo.pool, id));
  },
};

export const MembershipsService = {
  plans: (include_inactive: boolean) => repo.listPlans(repo.pool, !include_inactive),

  async planCreate(body: Record<string, unknown>): Promise<MembershipPlan> {
    const cols = Object.keys(body);
    const { rows } = await repo.pool.query<MembershipPlan>(`INSERT INTO membership_plans (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, cols.map((c) => body[c]));
    return rows[0]!;
  },

  async planUpdate(id: string, body: Record<string, unknown>): Promise<MembershipPlan> {
    const cols = Object.keys(body).filter((c) => body[c] !== undefined);
    if (cols.length === 0) {
      const p = await repo.planById(repo.pool, id);
      if (!p) throw new AppError('MEMBERSHIP_PLAN_NOT_FOUND');
      return p;
    }
    const { rows } = await repo.pool.query<MembershipPlan>(`UPDATE membership_plans SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...cols.map((c) => body[c])]);
    if (!rows[0]) throw new AppError('MEMBERSHIP_PLAN_NOT_FOUND');
    return rows[0];
  },

  async purchase(user: AuthUser, body: MembershipsPurchaseRequest): Promise<MembershipPurchaseResult> {
    checkMethod(user, body.payment_method);
    const member_id = user.role === USER_ROLE.MEMBER ? user.member_id : body.member_id;
    if (!member_id) throw new AppError('VALIDATION_ERROR', { fields: { member_id: 'Required.' } });
    const ids = await withTransaction((tx) =>
      buyMembership(tx, { member_id, plan_id: body.membership_plan_id, method: body.payment_method, received_by_user_id: isStaff(user) ? user.id : null, gateway_reference: body.gateway_reference }),
    );
    return this.result(ids);
  },

  async changePlan(user: AuthUser, id: string, body: MembershipsChangePlanRequest): Promise<MembershipPurchaseResult> {
    checkMethod(user, body.payment_method);
    const ids = await withTransaction(async (tx) => {
      const cur = await repo.membershipById(tx, id);
      if (!cur) throw new AppError('MEMBERSHIP_NOT_FOUND');
      if (cur.status !== 'ACTIVE') throw new AppError('INVALID_STATUS_TRANSITION', { reason: 'Only an active membership can be changed.' });
      // R-MEM-08: the old term ends yesterday, the new one starts today at full price.
      await tx.query('UPDATE memberships SET end_date = $2 WHERE id = $1', [id, addDays(today(), -1)]);
      return buyMembership(tx, { member_id: cur.member_id, plan_id: body.new_membership_plan_id, method: body.payment_method, received_by_user_id: user.id });
    });
    return this.result(ids);
  },

  async cancel(id: string, reason: string): Promise<MembershipView> {
    const done = await withTransaction((tx) => repo.cancelMembership(tx, id, reason));
    const m = await repo.membershipById(repo.pool, id);
    if (!m) throw new AppError('MEMBERSHIP_NOT_FOUND');
    if (!done) throw new AppError('INVALID_STATUS_TRANSITION', { reason: 'Already cancelled.' });
    return (await withPlans([m]))[0]!;
  },

  async expiring(days?: number): Promise<MembershipView[]> {
    const d = days ?? Number(await SettingsService.get<number>('membership_expiry_warning_days'));
    return withPlans(await repo.listExpiring(repo.pool, d));
  },

  async result(ids: { membership_id: string; payment_id: string }): Promise<MembershipPurchaseResult> {
    const m = (await withPlans([(await repo.membershipById(repo.pool, ids.membership_id))!]))[0]!;
    const payment = (await repo.pool.query<Payment>('SELECT * FROM payments WHERE id = $1', [ids.payment_id])).rows[0] ?? null;
    return { membership: m, payment };
  },
};

export type { MemberSummary };
