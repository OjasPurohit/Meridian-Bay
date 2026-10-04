/**
 * HTTP mapping for courts. courts.list / availability are PUBLIC (optional auth: staff also see which booking holds a slot);
 * create / update / block / unblock are OWNER_ADMIN. `/availability` and `/blocks/:id` come before `/:id`.
 */
import { Router } from 'express';
import { SPORT_TYPE, USER_ROLE } from '@shared/constants/enums';
import { optionalAuth, requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok } from '../../kernel/http';
import { idParams, isoDate, money, queryBool, strictObject, uuid, validateBody, validateParams, validateQuery, z } from '../../kernel/validate';
import { CourtsService } from '../bookings/service';

export const router = Router();
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const owner = [requireAuth, requireRole(USER_ROLE.OWNER_ADMIN)];
const instant = z.string().datetime({ offset: true });
const fields = {
  name: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(1000), surface: z.string().trim().min(1).max(100),
  walk_in_rate_per_hour: money, image_url: z.string().trim().min(1).max(500), sort_order: z.number().int().min(0).max(1000),
};

router.get('/', optionalAuth, validateQuery(z.object({ sport_type: enumOf(SPORT_TYPE).optional(), include_inactive: queryBool.optional() })),
  asyncHandler(async (req, res) => {
    const q = req.query as { sport_type?: never; include_inactive?: boolean };
    const staff = !!req.user && req.user.role !== USER_ROLE.MEMBER;
    if (q.include_inactive && !staff) throw new AppError('FORBIDDEN');
    ok(res, await CourtsService.list(q.sport_type, !!q.include_inactive));
  }));

router.get('/availability', optionalAuth, validateQuery(z.object({ date: isoDate, sport_type: enumOf(SPORT_TYPE).optional(), court_id: uuid.optional() })),
  asyncHandler(async (req, res) => ok(res, await CourtsService.availability(req.user, req.query as { date: string; sport_type?: never; court_id?: string }))));

router.post('/', ...owner, validateBody(strictObject({ ...fields, sport_type: enumOf(SPORT_TYPE), description: fields.description.optional(), surface: fields.surface.optional(), image_url: fields.image_url.optional(), sort_order: fields.sort_order.optional() })),
  asyncHandler(async (req, res) => created(res, await CourtsService.insert(req.body as Record<string, unknown>))));

router.delete('/blocks/:booking_id', ...owner, validateParams(strictObject({ booking_id: uuid })), asyncHandler(async (req, res) => {
  await CourtsService.unblock(req.params.booking_id!);
  ok(res, null);
}));

router.patch('/:id', ...owner, validateParams(idParams), validateBody(strictObject({ ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])), is_active: z.boolean().optional() } as never)),
  asyncHandler(async (req, res) => ok(res, await CourtsService.update(req.params.id!, req.body as Record<string, unknown>))));

router.post('/:id/blocks', ...owner, validateParams(idParams), validateBody(strictObject({ start_at: instant, end_at: instant })),
  asyncHandler(async (req, res) => created(res, await CourtsService.block(req.params.id!, (req.body as { start_at: string }).start_at, (req.body as { end_at: string }).end_at))));
