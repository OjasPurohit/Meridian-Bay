/** Invoice rules (R-INVC-01..05, R-FIN-03, R-FIN-05). Totals and payment state are derived in SQL, never stored. */
import { USER_ROLE, type InvoiceStatus } from '@shared/constants/enums';
import { INVOICE_TRANSITIONS } from '@shared/constants/rules';
import type { InvoiceDetail, InvoiceView } from '@shared/types/api';
import type { InvoicesCreateRequest, InvoicesUpdateRequest } from '@shared/types/requests.generated';
import type { AuthUser } from '../../kernel/auth';
import { withTransaction } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { SettingsService } from '../../kernel/settings';
import { offsetOf } from '../../kernel/validate';
import * as repo from './repo';
import type { InvoicesListInput } from './schema';

const notFound = () => new AppError('INVOICE_NOT_FOUND');
const NOBODY = '00000000-0000-0000-0000-000000000000';

function canSee(user: AuthUser, v: InvoiceView): boolean {
  if (user.role === USER_ROLE.OWNER_ADMIN) return true;
  if (v.status === 'DRAFT') return false;
  if (user.role === USER_ROLE.MEMBER) return v.member_id !== null && v.member_id === user.member_id;
  return false;
}

export const InvoicesService = {
  async list(user: AuthUser, input: InvoicesListInput): Promise<{ rows: InvoiceView[]; total: number }> {
    const filter: repo.InvoiceFilter = { status: input.status, payment_state: input.payment_state, invoice_type: input.invoice_type, from: input.from, to: input.to, overdue: input.overdue };
    if (user.role === USER_ROLE.OWNER_ADMIN) {
      filter.business_client_id = input.business_client_id;
      filter.member_id = input.member_id;
    } else {
      filter.hide_drafts = true;
      filter.member_id = user.member_id ?? NOBODY;
    }
    return repo.list(repo.pool, filter, input.page_size, offsetOf(input));
  },

  async get(user: AuthUser, id: string): Promise<InvoiceDetail> {
    const inv = await repo.findDetail(repo.pool, id);
    if (!inv || !canSee(user, inv)) throw notFound(); // do not reveal other people's invoices
    return inv;
  },

  async create(body: InvoicesCreateRequest): Promise<InvoiceDetail> {
    const rate = body.tax_rate ?? String(await SettingsService.get<string | number>('tax_rate_business'));
    const id = await withTransaction(async (tx) => {
      if (body.business_client_id && !(await repo.businessClientExists(tx, body.business_client_id))) throw new AppError('BUSINESS_CLIENT_NOT_FOUND');
      if (body.member_id && !(await repo.memberExists(tx, body.member_id))) throw new AppError('MEMBER_NOT_FOUND');
      const id = await repo.insertInvoice(tx, {
        business_client_id: body.business_client_id ?? null,
        member_id: body.member_id ?? null,
        issue_date: body.issue_date ?? null,
        due_date: body.due_date,
        tax_rate: Number(rate).toFixed(2),
        notes: body.notes ?? null,
        status: body.send_now ? 'SENT' : 'DRAFT',
      });
      await repo.replaceItems(tx, id, body.items);
      return id;
    });
    return (await repo.findDetail(repo.pool, id))!;
  },

  /** Only DRAFT invoices are editable (R-INVC-01). */
  async update(id: string, body: InvoicesUpdateRequest): Promise<InvoiceDetail> {
    await withTransaction(async (tx) => {
      const cur = await repo.lockStatus(tx, id);
      if (!cur) throw notFound();
      if (cur.status !== 'DRAFT') throw new AppError('INVOICE_NOT_EDITABLE');
      const changes = (['due_date', 'tax_rate', 'notes'] as const).filter((k) => body[k] !== undefined).map((k) => [k, body[k]] as [string, unknown]);
      await repo.updateInvoice(tx, id, changes);
      if (body.items) await repo.replaceItems(tx, id, body.items);
    });
    return (await repo.findDetail(repo.pool, id))!;
  },

  async send(id: string): Promise<InvoiceDetail> {
    await withTransaction(async (tx) => {
      const cur = await repo.lockStatus(tx, id);
      if (!cur) throw notFound();
      if (!INVOICE_TRANSITIONS[cur.status as InvoiceStatus].includes('SENT')) throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to: 'SENT' });
      await repo.setStatus(tx, id, 'SENT');
    });
    return (await repo.findDetail(repo.pool, id))!;
  },

  /** R-INVC-04: only when nothing has been paid. */
  async void(id: string): Promise<InvoiceDetail> {
    await withTransaction(async (tx) => {
      const cur = await repo.lockStatus(tx, id);
      if (!cur) throw notFound();
      if (!INVOICE_TRANSITIONS[cur.status as InvoiceStatus].includes('VOID')) throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to: 'VOID' });
      if (Number(cur.paid) > 0) throw new AppError('INVALID_STATUS_TRANSITION', { reason: 'An invoice with payments cannot be voided.' });
      await repo.setStatus(tx, id, 'VOID');
    });
    return (await repo.findDetail(repo.pool, id))!;
  },
};
