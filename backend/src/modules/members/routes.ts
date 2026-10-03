/**
 * HTTP mapping for members. Roles copy tools/api/endpoints.mjs:
 *   members.list / create  FRONT_DESK | OWNER_ADMIN      members.me  MEMBER
 *   members.get / update / history / memberships  MEMBER:own | FRONT_DESK | OWNER_ADMIN
 * `/me` is registered before `/:id`.
 */
import { Router } from 'express';
import type { MembersCreateRequest, MembersUpdateRequest } from '@shared/types/requests.generated';
import { HISTORY_EVENT_TYPE, MEMBERSHIP_STATUS, MEMBERSHIP_TYPE, PAYMENT_METHOD, USER_ROLE } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, isoDate, paginationFields, queryBool, strictObject, validateBody, validateParams, validateQuery, z, type PaginationQuery } from '../../kernel/validate';
import { MembersService } from './service';
import * as repo from './repo';

export const router = Router();
const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const staff = [requireAuth, requireRole(R.FRONT_DESK, R.OWNER_ADMIN)];
const anyMember = [requireAuth, requireRole(R.MEMBER, R.FRONT_DESK, R.OWNER_ADMIN)];
const phone = z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number: E.164 or 10 digits.');
const text = (n: number) => z.string().trim().min(1).max(n);
const dob = isoDate.refine((v) => v < new Date().toISOString().slice(0, 10), 'Must be in the past.');
const password = z.string().min(8).refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Needs a letter and a digit.').refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Max 72 bytes.');

router.get(
  '/',
  ...staff,
  validateQuery(z.object({
    q: z.string().trim().max(100).optional(),
    membership_type: enumOf(MEMBERSHIP_TYPE).optional(),
    membership_status: enumOf(MEMBERSHIP_STATUS).optional(),
    no_plan: queryBool.optional(),
    ...paginationFields,
  })),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as PaginationQuery & { q?: string; membership_type?: string; membership_status?: string; no_plan?: boolean };
    const { rows, total } = await MembersService.list({ q: q.q, membership_type: q.membership_type, membership_status: q.no_plan ? 'NONE' : q.membership_status, page: q.page, page_size: q.page_size });
    page(res, rows, { page: q.page, page_size: q.page_size, total });
  }),
);

router.post(
  '/',
  ...staff,
  validateBody(strictObject({
    full_name: text(120), email: z.string().trim().toLowerCase().email(), phone, date_of_birth: dob.optional(), address: text(500).optional(),
    emergency_contact_name: text(120).optional(), emergency_contact_phone: phone.optional(), initial_password: password.optional(),
    membership_plan_id: z.string().uuid().optional(), payment_method: enumOf(PAYMENT_METHOD).optional(),
  })),
  asyncHandler(async (req, res) => created(res, await MembersService.create(caller(req), req.body as MembersCreateRequest))),
);

router.get(
  '/me',
  requireAuth,
  requireRole(R.MEMBER),
  asyncHandler(async (req, res) => {
    const id = caller(req).member_id;
    if (!id) throw new AppError('MEMBER_NOT_FOUND');
    ok(res, await MembersService.get(caller(req), id));
  }),
);

router.get('/:id', ...anyMember, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await MembersService.get(caller(req), req.params.id!))));
router.patch(
  '/:id',
  ...anyMember,
  validateParams(idParams),
  validateBody(strictObject({
    full_name: text(120).optional(), phone: phone.optional(), date_of_birth: dob.optional(), address: text(500).optional(), emergency_contact_name: text(120).optional(),
    emergency_contact_phone: phone.optional(), photo_url: text(500).optional(), is_active: z.boolean().optional(),
  })),
  asyncHandler(async (req, res) => ok(res, await MembersService.update(caller(req), req.params.id!, req.body as MembersUpdateRequest))),
);
router.get(
  '/:id/history',
  ...anyMember,
  validateParams(idParams),
  validateQuery(z.object({ event_type: enumOf(HISTORY_EVENT_TYPE).optional(), from: isoDate.optional(), to: isoDate.optional() })),
  asyncHandler(async (req, res) => ok(res, await MembersService.history(caller(req), req.params.id!, req.query as { event_type?: string; from?: string; to?: string }))),
);
router.get('/:id/memberships', ...anyMember, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await MembersService.memberships(caller(req), req.params.id!))));

void repo;
