/**
 * HTTP mapping for the shop. Roles copy tools/api/endpoints.mjs:
 *   products / product  PUBLIC    productCreate / productUpdate / productDelete  OWNER_ADMIN
 *   orderCreate  MEMBER | FRONT_DESK | OWNER_ADMIN    orderList / orderGet / orderCancel  MEMBER:own | FRONT_DESK | OWNER_ADMIN
 *   orderStatus  FRONT_DESK | OWNER_ADMIN
 */
import { Router } from 'express';
import type { ShopOrderCreateRequest, ShopOrderStatusRequest } from '@shared/types/requests.generated';
import { ORDER_FULFILLMENT, PAYMENT_METHOD, PRODUCT_CATEGORY, SHOP_ORDER_STATUS, USER_ROLE } from '@shared/constants/enums';
import { optionalAuth, requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, isoDate, money, paginationFields, queryBool, strictObject, uuid, validateBody, validateParams, validateQuery, z, type PaginationQuery } from '../../kernel/validate';
import { ShopService } from './service';

export const router = Router();
const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const owner = [requireAuth, requireRole(R.OWNER_ADMIN)];
const buyers = [requireAuth, requireRole(R.MEMBER, R.FRONT_DESK, R.OWNER_ADMIN)];
const staff = [requireAuth, requireRole(R.FRONT_DESK, R.OWNER_ADMIN)];
const text = (n: number) => z.string().trim().min(1).max(n);
const productFields = { name: text(200), category: enumOf(PRODUCT_CATEGORY), brand: text(100), description: text(2000), price: money, image_url: text(500), low_stock_threshold: z.number().int().min(0).max(100000) };

router.get('/products', optionalAuth, validateQuery(z.object({ category: enumOf(PRODUCT_CATEGORY).optional(), q: z.string().trim().max(100).optional(), in_stock: queryBool.optional(), include_inactive: queryBool.optional() })),
  asyncHandler(async (req, res) => ok(res, await ShopService.products(req.user, req.query as never))));
router.post('/products', ...owner, validateBody(strictObject({ sku: text(50), ...productFields, brand: productFields.brand.optional(), description: productFields.description.optional(), image_url: productFields.image_url.optional(), low_stock_threshold: productFields.low_stock_threshold.optional(), initial_stock: z.number().int().min(0).max(1000000).optional() })),
  asyncHandler(async (req, res) => created(res, await ShopService.productCreate(req.body as never))));
router.get('/products/:id', optionalAuth, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await ShopService.product(req.user, req.params.id!))));
router.patch('/products/:id', ...owner, validateParams(idParams), validateBody(strictObject({ ...Object.fromEntries(Object.entries(productFields).map(([k, v]) => [k, v.optional()])), is_active: z.boolean().optional() } as never)),
  asyncHandler(async (req, res) => ok(res, await ShopService.productUpdate(req.params.id!, req.body as Record<string, unknown>))));
router.delete('/products/:id', ...owner, validateParams(idParams), asyncHandler(async (req, res) => {
  await ShopService.productDelete(req.params.id!);
  ok(res, null);
}));

router.post('/orders', ...buyers, validateBody(strictObject({
  items: z.array(strictObject({ product_id: uuid, quantity: z.number().int().min(1).max(1000) })).min(1).max(50), fulfillment: enumOf(ORDER_FULFILLMENT), delivery_address: text(500).optional(),
  member_id: uuid.optional(), guest_name: text(120).optional(), guest_phone: z.string().trim().regex(/^\+?\d{10,15}$/).optional(), payment_method: enumOf(PAYMENT_METHOD).optional(),
})), asyncHandler(async (req, res) => created(res, await ShopService.orderCreate(caller(req), req.body as ShopOrderCreateRequest))));
router.get('/orders', ...buyers, validateQuery(z.object({ status: enumOf(SHOP_ORDER_STATUS).optional(), fulfillment: enumOf(ORDER_FULFILLMENT).optional(), member_id: uuid.optional(), from: isoDate.optional(), to: isoDate.optional(), ...paginationFields })),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as PaginationQuery & Parameters<typeof ShopService.orderList>[1];
    const { rows, total } = await ShopService.orderList(caller(req), q);
    page(res, rows, { page: q.page, page_size: q.page_size, total });
  }));
router.get('/orders/:id', ...buyers, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await ShopService.orderGet(caller(req), req.params.id!))));
router.patch('/orders/:id/status', ...staff, validateParams(idParams), validateBody(strictObject({ status: enumOf(SHOP_ORDER_STATUS) })),
  asyncHandler(async (req, res) => ok(res, await ShopService.orderStatus(req.params.id!, (req.body as ShopOrderStatusRequest).status))));
router.post('/orders/:id/cancel', ...buyers, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await ShopService.orderCancel(caller(req), req.params.id!))));
