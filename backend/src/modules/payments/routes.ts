/**
 * HTTP mapping for payments. Roles copy tools/api/endpoints.mjs:
 *   payments.create  MEMBER:own | BUSINESS_CLIENT:own | FRONT_DESK | OWNER_ADMIN
 *   payments.list / get  MEMBER:own | BUSINESS_CLIENT:own | FRONT_DESK:own | OWNER_ADMIN
 *   payments.refund  OWNER_ADMIN
 */
import { Router } from 'express';
import type { PaymentsCreateRequest, PaymentsRefundRequest } from '@shared/types/requests.generated';
import { USER_ROLE } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, validateBody, validateParams, validateQuery } from '../../kernel/validate';
import { createPaymentBody, listPaymentsQuery, refundBody, type PaymentsListInput } from './schema';
import { PaymentsService } from './service';

export const router = Router();

const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};

router.post(
  '/',
  requireAuth,
  requireRole(R.MEMBER, R.BUSINESS_CLIENT, R.FRONT_DESK, R.KITCHEN_MANAGER, R.OWNER_ADMIN),
  validateBody(createPaymentBody),
  asyncHandler(async (req, res) => created(res, await PaymentsService.create(caller(req), req.body as PaymentsCreateRequest))),
);

router.get(
  '/',
  requireAuth,
  requireRole(R.MEMBER, R.BUSINESS_CLIENT, R.FRONT_DESK, R.KITCHEN_MANAGER, R.OWNER_ADMIN),
  validateQuery(listPaymentsQuery),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as PaymentsListInput;
    const { rows, total } = await PaymentsService.list(caller(req), q);
    page(res, rows, { page: q.page, page_size: q.page_size, total });
  }),
);

router.get(
  '/:id',
  requireAuth,
  requireRole(R.MEMBER, R.BUSINESS_CLIENT, R.FRONT_DESK, R.KITCHEN_MANAGER, R.OWNER_ADMIN),
  validateParams(idParams),
  asyncHandler(async (req, res) => ok(res, await PaymentsService.get(caller(req), req.params.id!))),
);

router.post(
  '/:id/refund',
  requireAuth,
  requireRole(R.OWNER_ADMIN),
  validateParams(idParams),
  validateBody(refundBody),
  asyncHandler(async (req, res) => ok(res, await PaymentsService.refund(req.params.id!, req.body as PaymentsRefundRequest))),
);
