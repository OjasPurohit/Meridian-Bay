/**
 * HTTP mapping for business clients: route -> validate -> service. Roles copy tools/api/endpoints.mjs:
 *   clients.list / create / get / update  OWNER_ADMIN
 */
import { Router } from 'express';
import type { ClientsCreateRequest } from '@shared/types/requests.generated';
import { USER_ROLE } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { asyncHandler, created, ok, page } from '../../kernel/http';
import { idParams, validateBody, validateParams, validateQuery } from '../../kernel/validate';
import { createClientBody, listClientsQuery, updateClientBody, type ClientsListInput, type ClientsUpdateInput } from './schema';
import { ClientsService } from './service';

export const router = Router();

const ownerOnly = [requireAuth, requireRole(USER_ROLE.OWNER_ADMIN)];

// clients.list
router.get(
  '/',
  ...ownerOnly,
  validateQuery(listClientsQuery),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as ClientsListInput;
    const { rows, total } = await ClientsService.list(query);
    page(res, rows, { page: query.page, page_size: query.page_size, total });
  }),
);

// clients.create
router.post(
  '/',
  ...ownerOnly,
  validateBody(createClientBody),
  asyncHandler(async (req, res) => {
    created(res, await ClientsService.create(req.body as ClientsCreateRequest));
  }),
);

// clients.get
router.get(
  '/:id',
  ...ownerOnly,
  validateParams(idParams),
  asyncHandler(async (req, res) => {
    ok(res, await ClientsService.get(req.params.id!));
  }),
);

// clients.update
router.patch(
  '/:id',
  ...ownerOnly,
  validateParams(idParams),
  validateBody(updateClientBody),
  asyncHandler(async (req, res) => {
    ok(res, await ClientsService.update(req.params.id!, req.body as ClientsUpdateInput));
  }),
);
