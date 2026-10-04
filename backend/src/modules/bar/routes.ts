/**
 * HTTP mapping for the cafe. Roles copy tools/api/endpoints.mjs, with one extension for the built kitchen screens:
 * MEMBER may order for themselves (kitchen screen), KITCHEN_MANAGER may also create, list and cancel cafe orders and edit the menu (the kitchen POS), alongside FRONT_DESK
 * and OWNER_ADMIN. menu is PUBLIC.
 */
import { Router } from 'express';
import type { BarOrderCreateRequest } from '@shared/types/requests.generated';
import { MENU_CATEGORY, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, USER_ROLE } from '@shared/constants/enums';
import { optionalAuth, requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, isoDate, money, paginationFields, queryBool, strictObject, uuid, validateBody, validateParams, validateQuery, z, type PaginationQuery } from '../../kernel/validate';
import { BarService } from './service';

export const router = Router();
const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const text = (n: number) => z.string().trim().min(1).max(n);
const counter = [requireAuth, requireRole(R.FRONT_DESK, R.KITCHEN_MANAGER, R.OWNER_ADMIN)];
const readers = [requireAuth, requireRole(R.MEMBER, R.FRONT_DESK, R.KITCHEN_MANAGER, R.OWNER_ADMIN)];
const menuFields = { name: text(120), category: enumOf(MENU_CATEGORY), description: text(1000), price: money, sort_order: z.number().int().min(0).max(1000) };

router.get('/menu', optionalAuth, validateQuery(z.object({ category: enumOf(MENU_CATEGORY).optional(), include_unavailable: queryBool.optional() })),
  asyncHandler(async (req, res) => ok(res, await BarService.menu(req.user, req.query as never))));
router.post('/menu-items', ...counter, validateBody(strictObject({ ...menuFields, description: menuFields.description.optional(), sort_order: menuFields.sort_order.optional() })),
  asyncHandler(async (req, res) => created(res, await BarService.menuCreate(req.body as Record<string, unknown>))));
router.patch('/menu-items/:id', ...counter, validateParams(idParams), validateBody(strictObject({ ...Object.fromEntries(Object.entries(menuFields).map(([k, v]) => [k, v.optional()])), is_available: z.boolean().optional() } as never)),
  asyncHandler(async (req, res) => ok(res, await BarService.menuUpdate(req.params.id!, req.body as Record<string, unknown>))));

router.post('/menu-items/:id/stock-adjustments', requireAuth, requireRole(R.KITCHEN_MANAGER, R.OWNER_ADMIN), validateParams(idParams), validateBody(strictObject({ quantity_change: z.number().int().refine((n) => n !== 0, 'Must not be zero.') })),
  asyncHandler(async (req, res) => ok(res, await BarService.menuStock(req.params.id!, (req.body as { quantity_change: number }).quantity_change))));

router.get('/member-lookup', ...counter, validateQuery(z.object({ q: z.string().trim().min(2).max(60) })),
  asyncHandler(async (req, res) => ok(res, await BarService.memberLookup((req.query as { q: string }).q))));
router.post('/orders', requireAuth, requireRole(R.MEMBER, R.FRONT_DESK, R.KITCHEN_MANAGER, R.OWNER_ADMIN), validateBody(strictObject({
  table_label: text(60).optional(), member_id: uuid.optional(), guest_name: text(120).optional(), notes: text(500).optional(), payment_method: enumOf(PAYMENT_METHOD).optional(),
  items: z.array(strictObject({ bar_menu_item_id: uuid, quantity: z.number().int().min(1).max(100), notes: text(300).optional() })).min(1).max(50),
})), asyncHandler(async (req, res) => created(res, await BarService.orderCreate(caller(req), req.body as BarOrderCreateRequest))));
router.get('/orders', ...readers, validateQuery(z.object({ status: enumOf(ORDER_STATUS).optional(), payment_status: enumOf(PAYMENT_STATUS).optional(), table_label: text(60).optional(), member_id: uuid.optional(), from: isoDate.optional(), to: isoDate.optional(), ...paginationFields })),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as PaginationQuery & Parameters<typeof BarService.orderList>[1];
    const { rows, total } = await BarService.orderList(caller(req), q);
    page(res, rows, { page: q.page, page_size: q.page_size, total });
  }));
router.get('/orders/:id', ...readers, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await BarService.orderGet(caller(req), req.params.id!))));
router.post('/orders/:id/cancel', ...counter, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await BarService.orderCancel(req.params.id!))));
router.get('/daily-summary', ...counter, validateQuery(z.object({ date: isoDate.optional() })), asyncHandler(async (req, res) => ok(res, await BarService.dailySummary((req.query as { date?: string }).date))));
