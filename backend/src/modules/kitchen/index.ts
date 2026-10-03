/**
 * Kitchen board (KITCHEN_MANAGER | OWNER_ADMIN): auto-discovered by app.ts, mounted at /api/v1/kitchen.
 * The kitchen projection carries no prices and no payment data (FR-KIT-004).
 */
import { Router } from 'express';
import { ORDER_STATUS, USER_ROLE, type OrderStatus } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { asyncHandler, ok } from '../../kernel/http';
import { idParams, isoDate, strictObject, validateBody, validateParams, validateQuery, z } from '../../kernel/validate';
import { BarService } from '../bar/service';

export const router = Router();
const kitchen = [requireAuth, requireRole(USER_ROLE.KITCHEN_MANAGER, USER_ROLE.OWNER_ADMIN)];
const status = z.enum(Object.values(ORDER_STATUS) as [string, ...string[]]);
/** `?status=NEW,PREPARING` or repeated keys. */
const statusList = z.preprocess((v) => (typeof v === 'string' ? v.split(',') : v), z.array(status).optional());

router.get('/orders', ...kitchen, validateQuery(z.object({ status: statusList, date: isoDate.optional() })),
  asyncHandler(async (req, res) => ok(res, await BarService.kitchenList(req.query as { status?: OrderStatus[]; date?: string }))));
router.get('/orders/:id', ...kitchen, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await BarService.kitchenGet(req.params.id!))));
router.patch('/orders/:id/status', ...kitchen, validateParams(idParams), validateBody(strictObject({ status })),
  asyncHandler(async (req, res) => ok(res, await BarService.kitchenStatus(req.params.id!, (req.body as { status: OrderStatus }).status))));

export default { basePath: '/kitchen', router };
