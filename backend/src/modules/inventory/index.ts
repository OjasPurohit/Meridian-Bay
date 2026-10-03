/**
 * Inventory (stock levels): auto-discovered by app.ts, mounted at /api/v1/inventory. Roles copy tools/api/endpoints.mjs:
 * list / lowStock FRONT_DESK | OWNER_ADMIN, adjust OWNER_ADMIN. There is no stock ledger (ADR-016).
 */
import { Router } from 'express';
import { PRODUCT_CATEGORY, USER_ROLE } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { asyncHandler, ok } from '../../kernel/http';
import { queryBool, strictObject, uuid, validateBody, validateQuery, z } from '../../kernel/validate';
import { ShopService } from '../shop/service';

export const router = Router();
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const staff = [requireAuth, requireRole(USER_ROLE.FRONT_DESK, USER_ROLE.OWNER_ADMIN)];
const listQuery = z.object({ category: enumOf(PRODUCT_CATEGORY).optional(), low_stock_only: queryBool.optional(), q: z.string().trim().max(100).optional() });

router.get('/', ...staff, validateQuery(listQuery), asyncHandler(async (req, res) => ok(res, await ShopService.inventory(req.query as never))));
router.get('/low-stock', ...staff, asyncHandler(async (_req, res) => ok(res, await ShopService.inventory({ low_stock_only: true }))));
router.post('/adjustments', requireAuth, requireRole(USER_ROLE.OWNER_ADMIN), validateBody(strictObject({ product_id: uuid, quantity_change: z.number().int().refine((n) => n !== 0, 'Must not be zero.') })),
  asyncHandler(async (req, res) => ok(res, await ShopService.adjust((req.body as { product_id: string }).product_id, (req.body as { quantity_change: number }).quantity_change))));

export default { basePath: '/inventory', router };
