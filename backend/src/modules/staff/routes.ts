/**
 * HTTP mapping for staff / HR. Roles copy tools/api/endpoints.mjs. Static paths (/shifts, /leave-requests, /payroll)
 * are registered before /:id so they are not captured as ids.
 */
import { Router } from 'express';
import type {
  StaffCreateRequest, StaffLeaveCreateRequest, StaffLeaveDecideRequest, StaffLeaveListQuery, StaffListQuery, StaffPayrollCreateRequest,
  StaffPayrollListQuery, StaffPayrollPayRequest, StaffShiftCreateRequest, StaffShiftsQuery, StaffShiftUpdateRequest, StaffUpdateRequest,
} from '@shared/types/requests.generated';
import { APPLICATION_STATUS, LEAVE_DECISION, LEAVE_STATUS, PAYMENT_METHOD, SHIFT_AREA, USER_ROLE } from '@shared/constants/enums';
import type { ApplicationStatus, UserRole } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok } from '../../kernel/http';
import { idParams, isoDate, money, queryBool, strictObject, timeOfDay, uuid, validateBody, validateParams, validateQuery, z } from '../../kernel/validate';
import { ApplicationsService } from './applications';
import { StaffService } from './service';

export const router = Router();
const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const owner = [requireAuth, requireRole(R.OWNER_ADMIN)];
const staffRoles = [requireAuth, requireRole(R.FRONT_DESK, R.KITCHEN_MANAGER, R.STORE_MANAGER, R.OWNER_ADMIN)];
const phone = z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number.');
const password = z.string().min(8).refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Needs a letter and a digit.').refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Max 72 bytes.');
const firstOfMonth = isoDate.refine((v) => v.endsWith('-01'), 'Must be the first day of a month.');

// ---- staff
router.get('/', ...owner, validateQuery(z.object({ q: z.string().trim().max(100).optional(), role: enumOf(R).optional(), is_active: queryBool.optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.list(req.query as unknown as StaffListQuery))));
router.post('/', ...owner, validateBody(strictObject({ full_name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), phone: phone.optional(), role: enumOf(R), password, designation: z.string().trim().min(1).max(100), monthly_salary: money, joined_on: isoDate.optional() })),
  asyncHandler(async (req, res) => created(res, await StaffService.create(req.body as StaffCreateRequest))));

// ---- job applications (before /:id)
router.post('/applications', validateBody(strictObject({ full_name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254), phone, password })),
  asyncHandler(async (req, res) => created(res, await ApplicationsService.create(req.body as { full_name: string; email: string; phone: string; password: string }))));
router.get('/applications', ...owner, validateQuery(z.object({ status: enumOf(APPLICATION_STATUS).optional() })),
  asyncHandler(async (req, res) => ok(res, await ApplicationsService.list((req.query as { status?: ApplicationStatus }).status))));
router.post('/applications/:id/approve', ...owner, validateParams(idParams), validateBody(strictObject({ role: enumOf(R), designation: z.string().trim().min(1).max(100).optional(), monthly_salary: money.optional() })),
  asyncHandler(async (req, res) => ok(res, await ApplicationsService.approve(caller(req), req.params.id!, req.body as { role: UserRole; designation?: string; monthly_salary?: string }))));
router.post('/applications/:id/reject', ...owner, validateParams(idParams), validateBody(strictObject({ note: z.string().trim().min(1).max(500).optional() })),
  asyncHandler(async (req, res) => ok(res, await ApplicationsService.reject(caller(req), req.params.id!, (req.body as { note?: string }).note))));

// ---- shifts
const shiftTimes = { start_time: timeOfDay, end_time: timeOfDay };
router.get('/shifts', ...staffRoles, validateQuery(z.object({ from: isoDate, to: isoDate, staff_id: uuid.optional(), area: enumOf(SHIFT_AREA).optional() }).refine((q) => q.to >= q.from && (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 31, 'Range must be 0-31 days.')),
  asyncHandler(async (req, res) => ok(res, await StaffService.shifts(caller(req), req.query as unknown as StaffShiftsQuery))));
router.post('/shifts', ...owner, validateBody(strictObject({ staff_id: uuid, shift_date: isoDate, ...shiftTimes, area: enumOf(SHIFT_AREA) }).refine((b) => b.end_time > b.start_time, { path: ['end_time'], message: 'Must be after start_time.' })),
  asyncHandler(async (req, res) => created(res, await StaffService.shiftCreate(req.body as StaffShiftCreateRequest))));
router.patch('/shifts/:id', ...owner, validateParams(idParams), validateBody(strictObject({ shift_date: isoDate.optional(), start_time: timeOfDay.optional(), end_time: timeOfDay.optional(), area: enumOf(SHIFT_AREA).optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.shiftUpdate(req.params.id!, req.body as StaffShiftUpdateRequest))));
router.delete('/shifts/:id', ...owner, validateParams(idParams), asyncHandler(async (req, res) => {
  await StaffService.shiftDelete(req.params.id!);
  ok(res, null);
}));

// ---- leave
router.get('/leave-requests', ...staffRoles, validateQuery(z.object({ status: enumOf(LEAVE_STATUS).optional(), staff_id: uuid.optional(), from: isoDate.optional(), to: isoDate.optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.leaveList(caller(req), req.query as unknown as StaffLeaveListQuery))));
router.post('/leave-requests', requireAuth, requireRole(R.FRONT_DESK, R.KITCHEN_MANAGER, R.STORE_MANAGER), validateBody(strictObject({ start_date: isoDate, end_date: isoDate, reason: z.string().trim().min(1).max(500).optional() }).refine((b) => b.end_date >= b.start_date, { path: ['end_date'], message: 'Must be on or after start_date.' })),
  asyncHandler(async (req, res) => created(res, await StaffService.leaveCreate(caller(req), req.body as StaffLeaveCreateRequest))));
router.post('/leave-requests/:id/decision', ...owner, validateParams(idParams), validateBody(strictObject({ decision: enumOf(LEAVE_DECISION), note: z.string().trim().min(1).max(500).optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.leaveDecide(caller(req).id, req.params.id!, req.body as StaffLeaveDecideRequest))));
router.post('/leave-requests/:id/cancel', ...staffRoles, validateParams(idParams),
  asyncHandler(async (req, res) => ok(res, await StaffService.leaveCancel(caller(req), req.params.id!))));

// ---- payroll
router.get('/payroll', ...staffRoles, validateQuery(z.object({ staff_id: uuid.optional(), pay_period: firstOfMonth.optional(), paid: queryBool.optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.payrollList(caller(req), req.query as unknown as StaffPayrollListQuery))));
router.post('/payroll', ...owner, validateBody(strictObject({ staff_id: uuid, pay_period: firstOfMonth, amount: money.optional(), payment_method: enumOf(PAYMENT_METHOD), mark_paid: z.boolean().optional() })),
  asyncHandler(async (req, res) => created(res, await StaffService.payrollCreate(req.body as StaffPayrollCreateRequest))));
router.post('/payroll/:id/pay', ...owner, validateParams(idParams), validateBody(strictObject({ payment_method: enumOf(PAYMENT_METHOD).optional(), paid_on: isoDate.optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.payrollPay(req.params.id!, req.body as StaffPayrollPayRequest))));

// ---- one staff member (after the static paths)
router.get('/:id', ...staffRoles, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await StaffService.get(caller(req), req.params.id!))));
router.patch('/:id', ...owner, validateParams(idParams), validateBody(strictObject({ full_name: z.string().trim().min(2).max(120).optional(), phone: phone.optional(), designation: z.string().trim().min(1).max(100).optional(), monthly_salary: money.optional(), is_active: z.boolean().optional() })),
  asyncHandler(async (req, res) => ok(res, await StaffService.update(req.params.id!, req.body as StaffUpdateRequest))));
