/**
 * SQL for members and memberships (hand-written, parameterised). Owns `members` and `memberships`; reads `users`,
 * `membership_plans` and the derived views `membership_terms` / `member_membership_status` (membership status is
 * never stored: ADR-015). Every function takes a `Tx` so the service decides pool vs transaction.
 */
import type { MemberDetail, MemberSummary, MembershipView } from '@shared/types/api';
import type { MembershipPlan } from '@shared/types/rows';
import { query, type Tx } from '../../kernel/db';

/** A membership + derived status, without its plan (the service attaches the plan). */
export type MembershipRow = Omit<MembershipView, 'plan'>;

export const pool: Tx = { query };

const SUMMARY_SELECT = `
  SELECT m.id, m.user_id, m.member_code, u.full_name, u.email, u.phone, m.date_of_birth::text AS date_of_birth, m.photo_url,
         m.joined_on::text AS joined_on, u.is_active,
         CASE WHEN s.membership_id IS NULL THEN NULL ELSE json_build_object(
           'membership_id', s.membership_id, 'membership_plan_id', s.membership_plan_id, 'membership_type', s.membership_type,
           'plan_name', p.name, 'status', s.membership_status, 'start_date', s.start_date::text, 'end_date', s.end_date::text,
           'days_remaining', coalesce(s.days_remaining, 0)) END AS active_membership
    FROM members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN member_membership_status s ON s.member_id = m.id
    LEFT JOIN membership_plans p ON p.id = s.membership_plan_id`;

export async function summaryById(db: Tx, id: string): Promise<MemberSummary | null> {
  const { rows } = await db.query<MemberSummary>(`${SUMMARY_SELECT} WHERE m.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function summaryByUserId(db: Tx, user_id: string): Promise<MemberSummary | null> {
  const { rows } = await db.query<MemberSummary>(`${SUMMARY_SELECT} WHERE m.user_id = $1`, [user_id]);
  return rows[0] ?? null;
}

export interface MemberFilter {
  q?: string;
  /** 'ACTIVE' | 'EXPIRED' | 'NONE' on the derived membership status. */
  membership_status?: string;
  membership_type?: string;
  is_active?: boolean;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

function where(filter: MemberFilter): { sql: string; params: unknown[] } {
  const c: string[] = [];
  const params: unknown[] = [];
  if (filter.q) {
    params.push(`%${escapeLike(filter.q)}%`);
    const p = `$${params.length}`;
    c.push(`(u.full_name ILIKE ${p} OR u.email ILIKE ${p} OR u.phone ILIKE ${p} OR m.member_code ILIKE ${p})`);
  }
  if (filter.is_active !== undefined) {
    params.push(filter.is_active);
    c.push(`u.is_active = $${params.length}`);
  }
  if (filter.membership_type) {
    params.push(filter.membership_type);
    c.push(`s.membership_type = $${params.length}`);
  }
  if (filter.membership_status === 'NONE') c.push('s.membership_id IS NULL');
  else if (filter.membership_status) {
    params.push(filter.membership_status);
    c.push(`s.membership_status = $${params.length}`);
  }
  return { sql: c.length ? `WHERE ${c.join(' AND ')}` : '', params };
}

export async function list(db: Tx, filter: MemberFilter, limit: number, offset: number): Promise<{ rows: MemberSummary[]; total: number }> {
  const { sql, params } = where(filter);
  const total = (
    await db.query<{ n: number }>(
      `SELECT count(*) AS n FROM members m JOIN users u ON u.id = m.user_id LEFT JOIN member_membership_status s ON s.member_id = m.id ${sql}`,
      params,
    )
  ).rows[0]!.n;
  const { rows } = await db.query<MemberSummary>(`${SUMMARY_SELECT} ${sql} ORDER BY lower(u.full_name), m.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return { rows, total };
}

export async function detailById(db: Tx, id: string): Promise<MemberDetail | null> {
  const summary = await summaryById(db, id);
  if (!summary) return null;
  const extra = (
    await db.query<{ address: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null }>(
      'SELECT address, emergency_contact_name, emergency_contact_phone FROM members WHERE id = $1',
      [id],
    )
  ).rows[0]!;
  const plan = summary.active_membership
    ? ((await db.query<MembershipPlan>('SELECT * FROM membership_plans WHERE id = $1', [summary.active_membership.membership_plan_id])).rows[0] ?? null)
    : null;
  const used = (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM court_bookings
        WHERE member_id = $1 AND booking_type = 'REGULAR' AND cancelled_at IS NULL
          AND (start_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
      [id],
    )
  ).rows[0]!.n;
  return { ...summary, ...extra, plan, plays_used_today: used, plays_allowed_per_day: plan?.max_plays_per_day ?? 2 };
}

export const MEMBER_UPDATABLE = ['date_of_birth', 'address', 'emergency_contact_name', 'emergency_contact_phone', 'photo_url'] as const;
export const USER_UPDATABLE = ['full_name', 'phone'] as const;

export async function updateMember(db: Tx, id: string, changes: [string, unknown][]): Promise<void> {
  if (changes.length === 0) return;
  const set = changes.map(([col], i) => {
    if (!(MEMBER_UPDATABLE as readonly string[]).includes(col)) throw new Error(`column ${col} is not updatable`);
    return `${col} = $${i + 2}`;
  });
  await db.query(`UPDATE members SET ${set.join(', ')} WHERE id = $1`, [id, ...changes.map(([, v]) => v)]);
}

export async function updateUserOfMember(db: Tx, member_id: string, changes: [string, unknown][]): Promise<void> {
  if (changes.length === 0) return;
  const set = changes.map(([col], i) => {
    if (!(USER_UPDATABLE as readonly string[]).includes(col)) throw new Error(`column ${col} is not updatable`);
    return `${col} = $${i + 2}`;
  });
  await db.query(`UPDATE users SET ${set.join(', ')} WHERE id = (SELECT user_id FROM members WHERE id = $1)`, [member_id, ...changes.map(([, v]) => v)]);
}

export async function insertMemberUser(db: Tx, u: { email: string; password_hash: string; full_name: string; phone: string | null; must_change_password: boolean }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, full_name, phone, must_change_password) VALUES ($1, $2, 'MEMBER', $3, $4, $5) RETURNING id`,
    [u.email, u.password_hash, u.full_name, u.phone, u.must_change_password],
  );
  return rows[0]!.id;
}

export async function insertMember(db: Tx, m: { user_id: string; date_of_birth: string | null; address: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO members (user_id, date_of_birth, address, emergency_contact_name, emergency_contact_phone) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [m.user_id, m.date_of_birth, m.address, m.emergency_contact_name, m.emergency_contact_phone],
  );
  return rows[0]!.id;
}

// ------------------------------------------------------------------ memberships
const MEMBERSHIP_SELECT = `
  SELECT t.id, t.member_id, t.membership_plan_id, t.start_date::text AS start_date, t.end_date::text AS end_date, t.price_paid,
         t.cancelled_at, t.cancellation_reason, t.created_at, t.updated_at, t.status,
         u.full_name AS member_name, m.member_code
    FROM membership_terms t
    JOIN members m ON m.id = t.member_id
    JOIN users u ON u.id = m.user_id`;

export async function membershipsOf(db: Tx, member_id: string): Promise<MembershipRow[]> {
  const { rows } = await db.query<MembershipRow>(`${MEMBERSHIP_SELECT} WHERE t.member_id = $1 ORDER BY t.start_date DESC, t.created_at DESC`, [member_id]);
  return rows;
}

export async function membershipById(db: Tx, id: string): Promise<MembershipRow | null> {
  const { rows } = await db.query<MembershipRow>(`${MEMBERSHIP_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listExpiring(db: Tx, within_days: number): Promise<MembershipRow[]> {
  const { rows } = await db.query<MembershipRow>(
    `${MEMBERSHIP_SELECT} WHERE t.status = 'ACTIVE' AND t.end_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date + $1::int ORDER BY t.end_date, t.id`,
    [within_days],
  );
  return rows;
}

export async function planById(db: Tx, id: string): Promise<MembershipPlan | null> {
  const { rows } = await db.query<MembershipPlan>('SELECT * FROM membership_plans WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function listPlans(db: Tx, only_active: boolean): Promise<MembershipPlan[]> {
  const { rows } = await db.query<MembershipPlan>(`SELECT * FROM membership_plans ${only_active ? 'WHERE is_active' : ''} ORDER BY sort_order, id`);
  return rows;
}

export async function insertMembership(db: Tx, m: { member_id: string; membership_plan_id: string; start_date: string; end_date: string; price_paid: string }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO memberships (member_id, membership_plan_id, start_date, end_date, price_paid) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [m.member_id, m.membership_plan_id, m.start_date, m.end_date, m.price_paid],
  );
  return rows[0]!.id;
}

export async function cancelMembership(db: Tx, id: string, reason: string | null): Promise<boolean> {
  const r = await db.query(`UPDATE memberships SET cancelled_at = now(), cancellation_reason = $2 WHERE id = $1 AND cancelled_at IS NULL`, [id, reason]);
  return (r.rowCount ?? 0) > 0;
}

/** The plan whose benefits apply to this member today, or null (R-MEM-04/05: no effective term = walk-in treatment). */
export async function effectivePlan(db: Tx, member_id: string): Promise<MembershipPlan | null> {
  const { rows } = await db.query<MembershipPlan>(
    `SELECT p.* FROM membership_terms t JOIN membership_plans p ON p.id = t.membership_plan_id WHERE t.member_id = $1 AND t.status = 'ACTIVE' ORDER BY t.end_date DESC LIMIT 1`,
    [member_id],
  );
  return rows[0] ?? null;
}
