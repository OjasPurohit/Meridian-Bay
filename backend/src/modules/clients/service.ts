/**
 * Business rules + transactions for business clients (FR-INVC-001; R-INVC-05).
 * No SQL here (repo.ts) and no HTTP here (routes.ts).
 */
import type { BusinessClientDetail } from '@shared/types/api';
import { withTransaction } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { offsetOf } from '../../kernel/validate';
import * as repo from './repo';
import type { ClientsListInput, ClientsUpdateInput } from './schema';
import type { ClientsCreateRequest } from '@shared/types/requests.generated';

const notFound = () => new AppError('BUSINESS_CLIENT_NOT_FOUND');

export const ClientsService = {
  async list(input: ClientsListInput): Promise<{ rows: BusinessClientDetail[]; total: number }> {
    return repo.list(repo.pool, { q: input.q || undefined, is_active: input.is_active }, input.page_size, offsetOf(input));
  },

  async get(id: string): Promise<BusinessClientDetail> {
    const client = await repo.findById(repo.pool, id);
    if (!client) throw notFound();
    return client;
  },

  async create(body: ClientsCreateRequest): Promise<BusinessClientDetail> {
    return withTransaction(async (tx) => {
      const id = await repo.insertClient(tx, {
        company_name: body.company_name,
        contact_name: body.contact_name,
        email: body.email,
        phone: body.phone ?? null,
        gstin: body.gstin ?? null,
        billing_address: body.billing_address ?? null,
        notes: body.notes ?? null,
      });
      return (await repo.findById(tx, id))!;
    });
  },

  /** PATCH: only the keys present change (null clears a nullable field). `{}` is a valid no-op. */
  async update(id: string, patch: ClientsUpdateInput): Promise<BusinessClientDetail> {
    const changes = (Object.entries(patch) as [repo.UpdatableColumn, unknown][]).filter(([, value]) => value !== undefined);
    return withTransaction(async (tx) => {
      if (changes.length > 0 && !(await repo.updateClient(tx, id, changes))) throw notFound();
      const client = await repo.findById(tx, id);
      if (!client) throw notFound();
      return client;
    });
  },
};
