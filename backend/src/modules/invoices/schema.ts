/** zod schemas for the invoices module; each mirrors a generated type in shared/types/requests.generated.ts. */
import { INVOICE_PAYMENT_STATE, INVOICE_STATUS, INVOICE_TYPE } from '@shared/constants/enums';
import type { InvoicesCreateRequest, InvoicesListQuery, InvoicesUpdateRequest } from '@shared/types/requests.generated';
import { isoDate, money, paginationFields, percent, queryBool, strictObject, uuid, z, type PaginationQuery, type Schema } from '../../kernel/validate';

const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;

const line = strictObject({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(100000),
  unit_price: money,
});
const lines = z.array(line).min(1, 'At least one line is required.').max(100);

export const createInvoiceBody: Schema<InvoicesCreateRequest> = strictObject({
  business_client_id: uuid.optional(),
  member_id: uuid.optional(),
  issue_date: isoDate.optional(),
  due_date: isoDate,
  items: lines,
  tax_rate: percent.optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
  send_now: z.boolean().optional(),
}).superRefine((b, ctx) => {
  if ((b.business_client_id === undefined) === (b.member_id === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['business_client_id'], message: 'Give exactly one of business_client_id or member_id.' });
  }
  if (b.issue_date !== undefined && b.due_date < b.issue_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['due_date'], message: 'Must be on or after the issue date.' });
  }
});

export const updateInvoiceBody: Schema<InvoicesUpdateRequest> = strictObject({
  due_date: isoDate.optional(),
  items: lines.optional(),
  tax_rate: percent.optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
});

export type InvoicesListInput = InvoicesListQuery & PaginationQuery;

export const listInvoicesQuery: Schema<InvoicesListInput> = z.object({
  status: enumOf(INVOICE_STATUS).optional(),
  payment_state: enumOf(INVOICE_PAYMENT_STATE).optional(),
  invoice_type: enumOf(INVOICE_TYPE).optional(),
  business_client_id: uuid.optional(),
  member_id: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  overdue: queryBool.optional(),
  ...paginationFields,
});
