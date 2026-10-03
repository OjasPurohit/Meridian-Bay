/**
 * HTTP mapping for membership plans and memberships. Roles copy tools/api/endpoints.mjs:
 *   plans (list)  PUBLIC    planCreate / planUpdate / cancel  OWNER_ADMIN
 *   purchase  MEMBER:own | FRONT_DESK | OWNER_ADMIN    changePlan / expiring  FRONT_DESK | OWNER_ADMIN
 * Static paths (/plans, /expiring) come before /:id.
 */
import { Router } from 'express';
import type { MembershipsChangePlanRequest, MembershipsPurchaseRequest } from '@shared/types/requests.generated';
import { MEMBERSHIP_TYPE, PAYMENT_METHOD, USER_ROLE } from '@shared/constants/enums';
import { optionalAuth, requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok } from '../../kernel/http';
import { idParams, money, percent, queryBool, queryInt, strictObject, uuid, validateBody, validateParams, validateQuery, z } from '../../kernel/validate';
import { MembershipsService } from '../members/service';

export const router = Router();
const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const owner = [requireAuth, requireRole(R.OWNER_ADMIN)];
const staff = [requireAuth, requireRole(R.FRONT_DESK, R.OWNER_ADMIN)];

router.get(
  '/plans',
  optionalAuth,
  validateQuery(z.object({ include_inactive: queryBool.optional() })),
  asyncHandler(async (req, res) => {
    const wantsAll = (req.query as { include_inactive?: boolean }).include_inactive === true;
    if (wantsAll && req.user?.role !== R.OWNER_ADMIN) throw new AppError('FORBIDDEN');
    ok(res, await MembershipsService.plans(wantsAll));
  }),
);

const planFields = {
  name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(1000), price: money, court_discount_percent: percent, shop_discount_percent: percent,
  bar_discount_percent: percent, max_plays_per_day: z.number().int().min(1).max(20), benefits: z.array(z.string().trim().min(1).max(200)).max(20), sort_order: z.number().int().min(0).max(1000),
};
router.post(
  '/plans',
  ...owner,
  validateBody(strictObject({ membership_type: enumOf(MEMBERSHIP_TYPE), duration_months: z.number().int().min(1).max(120), max_age: z.number().int().min(1).max(120).optional(), ...Object.fromEntries(Object.entries(planFields).map(([k, v]) => [k, k === 'name' || k === 'price' ? v : v.optional()])) } as never)),
  asyncHandler(async (req, res) => created(res, await MembershipsService.planCreate(req.body as Record<string, unknown>))),
);
router.patch(
  '/plans/:id',
  ...owner,
  validateParams(idParams),
  validateBody(strictObject({ ...Object.fromEntries(Object.entries(planFields).map(([k, v]) => [k, v.optional()])), is_active: z.boolean().optional() } as never)),
  asyncHandler(async (req, res) => ok(res, await MembershipsService.planUpdate(req.params.id!, req.body as Record<string, unknown>))),
);

router.get('/expiring', ...staff, validateQuery(z.object({ days: queryInt.pipe(z.number().int().min(1).max(365)).optional() })),
  asyncHandler(async (req, res) => ok(res, await MembershipsService.expiring((req.query as { days?: number }).days))));

router.post(
  '/',
  requireAuth,
  requireRole(R.MEMBER, R.FRONT_DESK, R.OWNER_ADMIN),
  validateBody(strictObject({ member_id: uuid.optional(), membership_plan_id: uuid, payment_method: enumOf(PAYMENT_METHOD), gateway_reference: z.string().trim().min(1).max(100).optional() })),
  asyncHandler(async (req, res) => created(res, await MembershipsService.purchase(caller(req), req.body as MembershipsPurchaseRequest))),
);
router.post('/:id/change-plan', ...staff, validateParams(idParams), validateBody(strictObject({ new_membership_plan_id: uuid, payment_method: enumOf(PAYMENT_METHOD) })),
  asyncHandler(async (req, res) => ok(res, await MembershipsService.changePlan(caller(req), req.params.id!, req.body as MembershipsChangePlanRequest))));
router.post('/:id/cancel', ...owner, validateParams(idParams), validateBody(strictObject({ reason: z.string().trim().min(1).max(500) })),
  asyncHandler(async (req, res) => ok(res, await MembershipsService.cancel(req.params.id!, (req.body as { reason: string }).reason))));
