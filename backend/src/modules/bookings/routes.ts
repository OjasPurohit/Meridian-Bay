/**
 * HTTP mapping for court bookings. Roles copy tools/api/endpoints.mjs:
 *   bookings.price / create  MEMBER | FRONT_DESK | OWNER_ADMIN
 *   bookings.list / get / cancel  MEMBER:own | FRONT_DESK | OWNER_ADMIN
 */
import { Router } from 'express';
import type { BookingsCreateRequest } from '@shared/types/requests.generated';
import { BOOKING_STATUS, BOOKING_TYPE, PAYMENT_METHOD, USER_ROLE } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, isoDate, paginationFields, queryBool, strictObject, uuid, validateBody, validateParams, validateQuery, z, type PaginationQuery } from '../../kernel/validate';
import { BookingsService } from './service';

export const router = Router();
const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const roles = [requireAuth, requireRole(R.MEMBER, R.FRONT_DESK, R.OWNER_ADMIN)];
const instant = z.string().datetime({ offset: true });

router.get('/price', ...roles, validateQuery(z.object({ court_id: uuid, start_at: instant, member_id: uuid.optional() })),
  asyncHandler(async (req, res) => ok(res, await BookingsService.price(caller(req), req.query as { court_id: string; start_at: string; member_id?: string }))));

router.post('/', ...roles, validateBody(strictObject({
  court_id: uuid, start_at: instant, member_id: uuid.optional(), guest_name: z.string().trim().min(1).max(120).optional(),
  guest_phone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number.').optional(), payment_method: enumOf(PAYMENT_METHOD).optional(),
})), asyncHandler(async (req, res) => created(res, await BookingsService.create(caller(req), req.body as BookingsCreateRequest))));

router.get('/', ...roles, validateQuery(z.object({
  from: isoDate.optional(), to: isoDate.optional(), court_id: uuid.optional(), member_id: uuid.optional(), status: enumOf(BOOKING_STATUS).optional(),
  booking_type: enumOf(BOOKING_TYPE).optional(), upcoming: queryBool.optional(), ...paginationFields,
})), asyncHandler(async (req, res) => {
  const q = req.query as unknown as PaginationQuery & Parameters<typeof BookingsService.list>[1];
  const { rows, total } = await BookingsService.list(caller(req), q);
  page(res, rows, { page: q.page, page_size: q.page_size, total });
}));

router.get('/:id', ...roles, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await BookingsService.get(caller(req), req.params.id!))));
router.post('/:id/cancel', ...roles, validateParams(idParams), validateBody(strictObject({ refund: z.boolean().optional() })),
  asyncHandler(async (req, res) => ok(res, await BookingsService.cancel(caller(req), req.params.id!, (req.body as { refund?: boolean }).refund))));
