/** zod schemas for the payments module; each mirrors a generated type in shared/types/requests.generated.ts. */
import { PAYMENT_METHOD, PAYMENT_SOURCE_TYPE, PAYMENT_TXN_STATUS, REVENUE_CATEGORY } from '@shared/constants/enums';
import type { PaymentsCreateRequest, PaymentsListQuery, PaymentsRefundRequest } from '@shared/types/requests.generated';
import { isoDate, money, paginationFields, strictObject, uuid, z, type PaginationQuery, type Schema } from '../../kernel/validate';

const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;

export const createPaymentBody: Schema<PaymentsCreateRequest> = strictObject({
  source_type: enumOf(PAYMENT_SOURCE_TYPE),
  source_id: uuid,
  amount: money.optional(),
  payment_method: enumOf(PAYMENT_METHOD),
  gateway_reference: z.string().trim().min(1).max(100).optional(),
  notes: z.string().trim().min(1).max(500).optional(),
});

export type PaymentsListInput = PaymentsListQuery & PaginationQuery;

export const listPaymentsQuery: Schema<PaymentsListInput> = z.object({
  source_type: enumOf(PAYMENT_SOURCE_TYPE).optional(),
  revenue_category: enumOf(REVENUE_CATEGORY).optional(),
  method: enumOf(PAYMENT_METHOD).optional(),
  status: enumOf(PAYMENT_TXN_STATUS).optional(),
  member_id: uuid.optional(),
  business_client_id: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  ...paginationFields,
});

export const refundBody: Schema<PaymentsRefundRequest> = strictObject({ amount: money, reason: z.string().trim().min(1).max(500) });
