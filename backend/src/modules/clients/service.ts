/**
 * Business rules + transactions for business clients (FR-INVC-001, FR-INVC-008, FR-AUTH-007; R-INVC-05).
 * No SQL here (repo.ts) and no HTTP here (routes.ts).
 */
import bcrypt from 'bcryptjs';
import type { BusinessClientDetail } from '@shared/types/api';
import { getConfig } from '../../config';
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

  /** clients.me: the client whose portal login is the caller (own-record scoping by users.id). */
  async me(user_id: string): Promise<BusinessClientDetail> {
    const client = await repo.findByUserId(repo.pool, user_id);
    if (!client) throw notFound();
    return client;
  },

  /** One transaction: [portal user] + client. A duplicate login email rolls back both (EMAIL_TAKEN). */
  async create(body: ClientsCreateRequest): Promise<BusinessClientDetail> {
    // Hash before opening the transaction: bcrypt is CPU-bound and must not hold a connection.
    const password_hash = body.create_login ? await bcrypt.hash(body.initial_password!, getConfig().bcrypt_rounds) : null;

    return withTransaction(async (tx) => {
      const user_id = password_hash
        ? await repo.insertPortalUser(tx, { email: body.email, password_hash, full_name: body.contact_name, phone: body.phone ?? null })
        : null;
      const id = await repo.insertClient(tx, {
        user_id,
        company_name: body.company_name,
        contact_name: body.contact_name,
        email: body.email,
        phone: body.phone ?? null,
        gstin: body.gstin ?? null,
        billing_address: body.billing_address ?? null,
        notes: body.notes ?? null,
      });
      const client = await repo.findById(tx, id);
      return client!;
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
