/**
 * SQL for staff and HR (R-HR-*, R-FIN-10). Owns `staff`, `staff_shifts`, `leave_requests`, `payroll_payments`;
 * writes the account fields of `users` (name, phone, is_active) for the staff member.
 */
import type { LeaveView, PayrollView, ShiftView, StaffView } from '@shared/types/api';
import { query, type Tx } from '../../kernel/db';

export const pool: Tx = { query };

// ------------------------------------------------------------------ staff
const STAFF_SELECT = `
  SELECT s.id, s.user_id, s.designation, s.monthly_salary, s.joined_on::text AS joined_on, s.created_at, s.updated_at,
         u.full_name, u.email, u.phone, u.role, u.is_active
    FROM staff s JOIN users u ON u.id = s.user_id`;

export async function staffById(db: Tx, id: string): Promise<StaffView | null> {
  const { rows } = await db.query<StaffView>(`${STAFF_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function staffList(db: Tx, f: { q?: string; role?: string; is_active?: boolean }): Promise<StaffView[]> {
  const c: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
    c.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR s.designation ILIKE $${params.length})`);
  }
  if (f.role) {
    params.push(f.role);
    c.push(`u.role = $${params.length}`);
  }
  if (f.is_active !== undefined) {
    params.push(f.is_active);
    c.push(`u.is_active = $${params.length}`);
  }
  const { rows } = await db.query<StaffView>(`${STAFF_SELECT} ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY lower(u.full_name), s.id`, params);
  return rows;
}

export async function insertStaffUser(db: Tx, u: { email: string; password_hash: string; role: string; full_name: string; phone: string | null }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, full_name, phone, must_change_password) VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
    [u.email, u.password_hash, u.role, u.full_name, u.phone],
  );
  return rows[0]!.id;
}

export async function insertStaff(db: Tx, s: { user_id: string; designation: string; monthly_salary: string; joined_on: string | null }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO staff (user_id, designation, monthly_salary, joined_on) VALUES ($1, $2, $3, coalesce($4::date, current_date)) RETURNING id`,
    [s.user_id, s.designation, s.monthly_salary, s.joined_on],
  );
  return rows[0]!.id;
}

export async function updateStaff(db: Tx, id: string, changes: [string, unknown][]): Promise<void> {
  const staffCols = ['designation', 'monthly_salary'];
  const userCols = ['full_name', 'phone', 'is_active'];
  const apply = async (table: 'staff' | 'users', cols: string[], where: string) => {
    const mine = changes.filter(([c]) => cols.includes(c));
    if (mine.length === 0) return;
    const set = mine.map(([c], i) => `${c} = $${i + 2}`);
    await db.query(`UPDATE ${table} SET ${set.join(', ')} WHERE ${where}`, [id, ...mine.map(([, v]) => v)]);
  };
  await apply('staff', staffCols, 'id = $1');
  await apply('users', userCols, 'id = (SELECT user_id FROM staff WHERE id = $1)');
}

// ------------------------------------------------------------------ shifts
const SHIFT_SELECT = `
  SELECT h.id, h.staff_id, h.shift_date::text AS shift_date, h.start_time, h.end_time, h.area, h.created_at, h.updated_at, u.full_name AS staff_name
    FROM staff_shifts h JOIN staff s ON s.id = h.staff_id JOIN users u ON u.id = s.user_id`;

export async function shifts(db: Tx, f: { from: string; to: string; staff_id?: string; area?: string }): Promise<ShiftView[]> {
  const params: unknown[] = [f.from, f.to];
  let extra = '';
  if (f.staff_id) {
    params.push(f.staff_id);
    extra += ` AND h.staff_id = $${params.length}`;
  }
  if (f.area) {
    params.push(f.area);
    extra += ` AND h.area = $${params.length}`;
  }
  const { rows } = await db.query<ShiftView>(`${SHIFT_SELECT} WHERE h.shift_date BETWEEN $1 AND $2${extra} ORDER BY h.shift_date, h.start_time, h.id`, params);
  return rows;
}

export async function shiftById(db: Tx, id: string): Promise<ShiftView | null> {
  const { rows } = await db.query<ShiftView>(`${SHIFT_SELECT} WHERE h.id = $1`, [id]);
  return rows[0] ?? null;
}

/** Another shift of this person that overlaps [start, end) on that date, or approved leave covering the date. */
export async function shiftConflict(db: Tx, staff_id: string, date: string, start: string, end: string, ignore_id: string | null): Promise<boolean> {
  const a = await db.query(
    `SELECT 1 FROM staff_shifts WHERE staff_id = $1 AND shift_date = $2 AND start_time < $4::time AND end_time > $3::time AND ($5::uuid IS NULL OR id <> $5)`,
    [staff_id, date, start, end, ignore_id],
  );
  if ((a.rowCount ?? 0) > 0) return true;
  const b = await db.query(`SELECT 1 FROM leave_requests WHERE staff_id = $1 AND status = 'APPROVED' AND $2::date BETWEEN start_date AND end_date`, [staff_id, date]);
  return (b.rowCount ?? 0) > 0;
}

export async function insertShift(db: Tx, s: { staff_id: string; shift_date: string; start_time: string; end_time: string; area: string }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO staff_shifts (staff_id, shift_date, start_time, end_time, area) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [s.staff_id, s.shift_date, s.start_time, s.end_time, s.area],
  );
  return rows[0]!.id;
}

export async function updateShift(db: Tx, id: string, changes: [string, unknown][]): Promise<void> {
  const ALLOWED = ['shift_date', 'start_time', 'end_time', 'area'];
  if (changes.length === 0) return;
  const set = changes.map(([c], i) => {
    if (!ALLOWED.includes(c)) throw new Error(`column ${c} is not updatable`);
    return `${c} = $${i + 2}`;
  });
  await db.query(`UPDATE staff_shifts SET ${set.join(', ')} WHERE id = $1`, [id, ...changes.map(([, v]) => v)]);
}

export async function deleteShift(db: Tx, id: string): Promise<boolean> {
  return ((await db.query('DELETE FROM staff_shifts WHERE id = $1', [id])).rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ leave
const LEAVE_SELECT = `
  SELECT l.id, l.staff_id, l.start_date::text AS start_date, l.end_date::text AS end_date, l.reason, l.status, l.decision_note, l.created_at, l.updated_at,
         u.full_name AS staff_name
    FROM leave_requests l JOIN staff s ON s.id = l.staff_id JOIN users u ON u.id = s.user_id`;

export async function leaveList(db: Tx, f: { status?: string; staff_id?: string; from?: string; to?: string }): Promise<LeaveView[]> {
  const c: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    c.push(sql.replace('?', `$${params.length}`));
  };
  if (f.status) add('l.status = ?', f.status);
  if (f.staff_id) add('l.staff_id = ?', f.staff_id);
  if (f.from) add('l.end_date >= ?', f.from);
  if (f.to) add('l.start_date <= ?', f.to);
  const { rows } = await db.query<LeaveView>(`${LEAVE_SELECT} ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY l.start_date DESC, l.id`, params);
  return rows;
}

export async function leaveById(db: Tx, id: string, lock = false): Promise<LeaveView | null> {
  const { rows } = await db.query<LeaveView>(`${LEAVE_SELECT} WHERE l.id = $1${lock ? ' FOR UPDATE OF l' : ''}`, [id]);
  return rows[0] ?? null;
}

export async function leaveOverlap(db: Tx, staff_id: string, start: string, end: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM leave_requests WHERE staff_id = $1 AND status IN ('PENDING', 'APPROVED') AND start_date <= $3::date AND end_date >= $2::date`,
    [staff_id, start, end],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function insertLeave(db: Tx, l: { staff_id: string; start_date: string; end_date: string; reason: string | null }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`INSERT INTO leave_requests (staff_id, start_date, end_date, reason) VALUES ($1, $2, $3, $4) RETURNING id`, [l.staff_id, l.start_date, l.end_date, l.reason]);
  return rows[0]!.id;
}

export async function setLeaveStatus(db: Tx, id: string, status: string, note: string | null): Promise<void> {
  await db.query('UPDATE leave_requests SET status = $2, decision_note = coalesce($3, decision_note) WHERE id = $1', [id, status, note]);
}

// ------------------------------------------------------------------ payroll
const PAYROLL_SELECT = `
  SELECT p.id, p.staff_id, p.pay_period::text AS pay_period, p.amount, p.method, p.paid_on::text AS paid_on, p.created_at, p.updated_at,
         u.full_name AS staff_name, (p.paid_on IS NOT NULL) AS is_paid
    FROM payroll_payments p JOIN staff s ON s.id = p.staff_id JOIN users u ON u.id = s.user_id`;

export async function payrollList(db: Tx, f: { staff_id?: string; pay_period?: string; paid?: boolean }): Promise<PayrollView[]> {
  const c: string[] = [];
  const params: unknown[] = [];
  if (f.staff_id) {
    params.push(f.staff_id);
    c.push(`p.staff_id = $${params.length}`);
  }
  if (f.pay_period) {
    params.push(f.pay_period);
    c.push(`p.pay_period = $${params.length}`);
  }
  if (f.paid !== undefined) c.push(f.paid ? 'p.paid_on IS NOT NULL' : 'p.paid_on IS NULL');
  const { rows } = await db.query<PayrollView>(`${PAYROLL_SELECT} ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY p.pay_period DESC, u.full_name, p.id`, params);
  return rows;
}

export async function payrollById(db: Tx, id: string, lock = false): Promise<PayrollView | null> {
  const { rows } = await db.query<PayrollView>(`${PAYROLL_SELECT} WHERE p.id = $1${lock ? ' FOR UPDATE OF p' : ''}`, [id]);
  return rows[0] ?? null;
}

export async function insertPayroll(db: Tx, p: { staff_id: string; pay_period: string; amount: string; method: string; paid_on: string | null }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO payroll_payments (staff_id, pay_period, amount, method, paid_on) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [p.staff_id, p.pay_period, p.amount, p.method, p.paid_on],
  );
  return rows[0]!.id;
}

export async function markPayrollPaid(db: Tx, id: string, method: string | null, paid_on: string | null): Promise<void> {
  await db.query(`UPDATE payroll_payments SET paid_on = coalesce($3::date, current_date), method = coalesce($2, method) WHERE id = $1`, [id, method, paid_on]);
}
