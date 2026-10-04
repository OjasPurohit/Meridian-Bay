/** Staff and HR rules (R-HR-01..03, R-FIN-10). Own-record scoping for FRONT_DESK / KITCHEN_MANAGER happens here. */
import bcrypt from 'bcryptjs';
import { USER_ROLE } from '@shared/constants/enums';
import { LEAVE_TRANSITIONS } from '@shared/constants/rules';
import type { LeaveStatus } from '@shared/constants/enums';
import type { LeaveView, PayrollView, ShiftView, StaffView } from '@shared/types/api';
import type {
  StaffCreateRequest, StaffLeaveCreateRequest, StaffLeaveDecideRequest, StaffLeaveListQuery, StaffPayrollCreateRequest, StaffPayrollListQuery,
  StaffPayrollPayRequest, StaffShiftCreateRequest, StaffShiftsQuery, StaffShiftUpdateRequest, StaffUpdateRequest, StaffListQuery,
} from '@shared/types/requests.generated';
import { getConfig } from '../../config';
import { invalidateUserCache, type AuthUser } from '../../kernel/auth';
import { withTransaction } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import * as repo from './repo';

const isOwner = (u: AuthUser) => u.role === USER_ROLE.OWNER_ADMIN;
const NOBODY = '00000000-0000-0000-0000-000000000000';
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export const StaffService = {
  list: (q: StaffListQuery) => repo.staffList(repo.pool, q),

  async get(user: AuthUser, id: string): Promise<StaffView> {
    if (!isOwner(user) && user.staff_id !== id) throw new AppError('STAFF_NOT_FOUND'); // own record only
    const s = await repo.staffById(repo.pool, id);
    if (!s) throw new AppError('STAFF_NOT_FOUND');
    return s;
  },

  async create(body: StaffCreateRequest): Promise<StaffView> {
    if (body.role === USER_ROLE.MEMBER) throw new AppError('VALIDATION_ERROR', { fields: { role: 'Must be FRONT_DESK, KITCHEN_MANAGER, STORE_MANAGER or OWNER_ADMIN.' } });
    const password_hash = await bcrypt.hash(body.password, getConfig().bcrypt_rounds);
    const id = await withTransaction(async (tx) => {
      const user_id = await repo.insertStaffUser(tx, { email: body.email, password_hash, role: body.role, full_name: body.full_name, phone: body.phone ?? null });
      return repo.insertStaff(tx, { user_id, designation: body.designation, monthly_salary: body.monthly_salary, joined_on: body.joined_on ?? null });
    });
    return (await repo.staffById(repo.pool, id))!;
  },

  async update(id: string, body: StaffUpdateRequest): Promise<StaffView> {
    const changes = Object.entries(body).filter(([, v]) => v !== undefined) as [string, unknown][];
    const user_id = await withTransaction(async (tx) => {
      const s = await repo.staffById(tx, id);
      if (!s) throw new AppError('STAFF_NOT_FOUND');
      await repo.updateStaff(tx, id, changes);
      return s.user_id;
    });
    invalidateUserCache(user_id); // R-HR-03: deactivation bites immediately
    return (await repo.staffById(repo.pool, id))!;
  },

  // ---- shifts
  shifts(user: AuthUser, q: StaffShiftsQuery): Promise<ShiftView[]> {
    const staff_id = user.role === USER_ROLE.KITCHEN_MANAGER || user.role === USER_ROLE.STORE_MANAGER ? (user.staff_id ?? NOBODY) : q.staff_id;
    return repo.shifts(repo.pool, { from: q.from, to: q.to, staff_id, area: q.area });
  },

  async shiftCreate(body: StaffShiftCreateRequest): Promise<ShiftView> {
    const id = await withTransaction(async (tx) => {
      if (!(await repo.staffById(tx, body.staff_id))) throw new AppError('STAFF_NOT_FOUND');
      if (await repo.shiftConflict(tx, body.staff_id, body.shift_date, body.start_time, body.end_time, null)) throw new AppError('SHIFT_OVERLAP');
      return repo.insertShift(tx, body);
    });
    return (await repo.shiftById(repo.pool, id))!;
  },

  async shiftUpdate(id: string, body: StaffShiftUpdateRequest): Promise<ShiftView> {
    await withTransaction(async (tx) => {
      const cur = await repo.shiftById(tx, id);
      if (!cur) throw new AppError('SHIFT_NOT_FOUND');
      const next = { shift_date: body.shift_date ?? cur.shift_date, start_time: body.start_time ?? cur.start_time, end_time: body.end_time ?? cur.end_time };
      if (next.end_time <= next.start_time) throw new AppError('VALIDATION_ERROR', { fields: { end_time: 'Must be after start_time.' } });
      if (await repo.shiftConflict(tx, cur.staff_id, next.shift_date, next.start_time, next.end_time, id)) throw new AppError('SHIFT_OVERLAP');
      await repo.updateShift(tx, id, Object.entries(body).filter(([, v]) => v !== undefined) as [string, unknown][]);
    });
    return (await repo.shiftById(repo.pool, id))!;
  },

  async shiftDelete(id: string): Promise<void> {
    if (!(await repo.deleteShift(repo.pool, id))) throw new AppError('SHIFT_NOT_FOUND');
  },

  // ---- leave
  leaveList(user: AuthUser, q: StaffLeaveListQuery): Promise<LeaveView[]> {
    return repo.leaveList(repo.pool, { status: q.status, from: q.from, to: q.to, staff_id: isOwner(user) ? q.staff_id : (user.staff_id ?? NOBODY) });
  },

  async leaveCreate(user: AuthUser, body: StaffLeaveCreateRequest): Promise<LeaveView> {
    if (!user.staff_id) throw new AppError('FORBIDDEN');
    const staff_id = user.staff_id;
    const id = await withTransaction(async (tx) => {
      if (await repo.leaveOverlap(tx, staff_id, body.start_date, body.end_date)) throw new AppError('LEAVE_OVERLAP');
      return repo.insertLeave(tx, { staff_id, start_date: body.start_date, end_date: body.end_date, reason: body.reason ?? null });
    });
    return (await repo.leaveById(repo.pool, id))!;
  },

  async leaveDecide(owner_user_id: string, id: string, body: StaffLeaveDecideRequest): Promise<LeaveView> {
    if (body.decision === 'REJECT' && !body.note?.trim()) throw new AppError('VALIDATION_ERROR', { fields: { note: 'Required when rejecting.' } });
    const to: LeaveStatus = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await withTransaction(async (tx) => {
      const cur = await repo.leaveById(tx, id, true);
      if (!cur) throw new AppError('LEAVE_NOT_FOUND');
      if (!LEAVE_TRANSITIONS[cur.status].includes(to)) throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to });
      await repo.setLeaveStatus(tx, id, to, body.note ?? null, owner_user_id);
    });
    return (await repo.leaveById(repo.pool, id))!;
  },

  async leaveCancel(user: AuthUser, id: string): Promise<LeaveView> {
    await withTransaction(async (tx) => {
      const cur = await repo.leaveById(tx, id, true);
      if (!cur || (!isOwner(user) && cur.staff_id !== user.staff_id)) throw new AppError('LEAVE_NOT_FOUND');
      if (!LEAVE_TRANSITIONS[cur.status].includes('CANCELLED')) throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to: 'CANCELLED' });
      await repo.setLeaveStatus(tx, id, 'CANCELLED', null);
    });
    return (await repo.leaveById(repo.pool, id))!;
  },

  // ---- payroll
  payrollList(user: AuthUser, q: StaffPayrollListQuery): Promise<PayrollView[]> {
    return repo.payrollList(repo.pool, { pay_period: q.pay_period, paid: q.paid, staff_id: isOwner(user) ? q.staff_id : (user.staff_id ?? NOBODY) });
  },

  async payrollCreate(body: StaffPayrollCreateRequest): Promise<PayrollView> {
    if (body.pay_period.slice(8) !== '01') throw new AppError('VALIDATION_ERROR', { fields: { pay_period: 'Must be the first day of a month.' } });
    const id = await withTransaction(async (tx) => {
      const s = await repo.staffById(tx, body.staff_id);
      if (!s) throw new AppError('STAFF_NOT_FOUND');
      return repo.insertPayroll(tx, { staff_id: s.id, pay_period: body.pay_period, amount: body.amount ?? s.monthly_salary, method: body.payment_method, paid_on: body.mark_paid ? today() : null });
    });
    return (await repo.payrollById(repo.pool, id))!;
  },

  async payrollPay(id: string, body: StaffPayrollPayRequest): Promise<PayrollView> {
    await withTransaction(async (tx) => {
      const cur = await repo.payrollById(tx, id, true);
      if (!cur) throw new AppError('NOT_FOUND');
      if (cur.is_paid) throw new AppError('ALREADY_PAID');
      await repo.markPayrollPaid(tx, id, body.payment_method ?? null, body.paid_on ?? null);
    });
    return (await repo.payrollById(repo.pool, id))!;
  },
};
