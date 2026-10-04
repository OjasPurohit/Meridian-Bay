/**
 * HTTP mapping for invoices. Roles copy tools/api/endpoints.mjs:
 *   invoices.list / get  MEMBER:own | OWNER_ADMIN
 *   invoices.create / update / send / void  OWNER_ADMIN
 */
import { Router } from 'express';
import type { InvoicesCreateRequest, InvoicesUpdateRequest } from '@shared/types/requests.generated';
import { USER_ROLE } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, validateBody, validateParams, validateQuery } from '../../kernel/validate';
import { createInvoiceBody, listInvoicesQuery, updateInvoiceBody, type InvoicesListInput } from './schema';
import { InvoicesService } from './service';

export const router = Router();

const R = USER_ROLE;
const caller = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user;
};
const ownerOnly = [requireAuth, requireRole(R.OWNER_ADMIN)];
const customers = [requireAuth, requireRole(R.MEMBER, R.OWNER_ADMIN)];

router.get(
  '/',
  ...customers,
  validateQuery(listInvoicesQuery),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as InvoicesListInput;
    const { rows, total } = await InvoicesService.list(caller(req), q);
    page(res, rows, { page: q.page, page_size: q.page_size, total });
  }),
);
router.post('/', ...ownerOnly, validateBody(createInvoiceBody), asyncHandler(async (req, res) => created(res, await InvoicesService.create(req.body as InvoicesCreateRequest))));
router.get('/:id', ...customers, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await InvoicesService.get(caller(req), req.params.id!))));
router.patch('/:id', ...ownerOnly, validateParams(idParams), validateBody(updateInvoiceBody), asyncHandler(async (req, res) => ok(res, await InvoicesService.update(req.params.id!, req.body as InvoicesUpdateRequest))));
router.post('/:id/send', ...ownerOnly, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await InvoicesService.send(req.params.id!))));
router.post('/:id/void', ...ownerOnly, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await InvoicesService.void(req.params.id!))));
