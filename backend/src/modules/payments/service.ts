/**
 * Payments (R-FIN-01 … R-FIN-11, ADR-009, ADR-011). One ledger table; everything that takes money goes through
 * recordPayment(), which other modules (memberships, bookings, shop, cafe) reuse inside their own transaction.
 * Payment *status* of a bill is never stored: the *_totals views derive it from these rows.
 */
import { randomBytes } from 'node:crypto';
import { PAYMENT_METHOD, USER_ROLE, type PaymentMethod, type PaymentSourceType, type UserRole } from '@shared/constants/enums';
import type { AuthUser } from '../../kernel/auth';
import { advisoryLock, withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { SettingsService } from '../../kernel/settings';
import { offsetOf } from '../../kernel/validate';
import { fromPaise, taxInclusive, toPaise } from '@shared/lib/money';
import type { PaymentView } from '@shared/types/api';
import type { PaymentsCreateRequest, PaymentsRefundRequest } from '@shared/types/requests.generated';
import * as repo from './repo';
import type { PaymentsListInput } from './schema';

/** R-FIN-11: which payment methods each role may use. */
const METHODS_BY_ROLE: Record<UserRole, readonly PaymentMethod[]> = {
  MEMBER: [PAYMENT_METHOD.ONLINE],
  BUSINESS_CLIENT: [PAYMENT_METHOD.ONLINE],
  FRONT_DESK: [PAYMENT_METHOD.CASH, PAYMENT_METHOD.CARD, PAYMENT_METHOD.UPI],
  KITCHEN_MANAGER: [PAYMENT_METHOD.CASH, PAYMENT_METHOD.CARD, PAYMENT_METHOD.UPI],
  OWNER_ADMIN: [PAYMENT_METHOD.CASH, PAYMENT_METHOD.CARD, PAYMENT_METHOD.UPI, PAYMENT_METHOD.ONLINE],
};

const TAX_SETTING = {
  COURT_BOOKING: 'tax_rate_court',
  MEMBERSHIP: 'tax_rate_membership',
  SHOP_ORDER: 'tax_rate_shop',
  BAR_ORDER: 'tax_rate_bar',
} as const;

/** Mock gateway (ADR-011): an online payment always succeeds and gets a reference. */
const mockGatewayReference = () => `MOCK-${randomBytes(5).toString('hex').toUpperCase()}`;

export interface RecordPaymentInput {
  source_type: PaymentSourceType;
  source_id: string;
  /** Default: everything still due. */
  amount?: string;
  method: PaymentMethod;
  gateway_reference?: string | null;
  notes?: string | null;
  /** users.id of the staff member taking the money, null for online payments. */
  received_by_user_id: string | null;
  /** When set, the bill must belong to this member / business client (own-record rule). */
  require_member_id?: string;
  require_business_client_id?: string;
}

/** Records one payment on a bill. Runs inside the caller's transaction and locks the bill. */
export async function recordPayment(tx: Tx, input: RecordPaymentInput): Promise<string> {
  await advisoryLock(tx, `pay:${input.source_id}`);
  const bill = await repo.loadBill(tx, input.source_type, input.source_id, true);
  if (!bill) throw new AppError(input.source_type === 'INVOICE' ? 'INVOICE_NOT_FOUND' : 'NOT_FOUND', { source_type: input.source_type, source_id: input.source_id });
  if (input.require_member_id && bill.member_id !== input.require_member_id) throw new AppError('FORBIDDEN');
  if (input.require_business_client_id && bill.business_client_id !== input.require_business_client_id) throw new AppError('FORBIDDEN');
  if (!bill.payable) throw new AppError('INVALID_STATUS_TRANSITION', { reason: 'This item can no longer be paid.' });

  const due = toPaise(bill.amount_due);
  const paid = toPaise(bill.amount_paid);
  const remaining = due - paid;
  if (due === 0 || remaining <= 0) throw new AppError('ALREADY_PAID');

  const amount = input.amount === undefined ? remaining : toPaise(input.amount);
  if (amount <= 0) throw new AppError('PAYMENT_AMOUNT_MISMATCH', { amount_due: fromPaise(remaining) });
  if (input.source_type === 'INVOICE') {
    if (amount > remaining) throw new AppError('PAYMENT_AMOUNT_MISMATCH', { amount_due: fromPaise(remaining) }); // R-FIN-04: partial is fine, overpaying is not
  } else if (amount !== remaining) {
    throw new AppError('PAYMENT_AMOUNT_MISMATCH', { amount_due: fromPaise(remaining) }); // R-FIN-04
  }

  let tax: number;
  if (input.source_type === 'INVOICE') {
    tax = due === 0 ? 0 : Math.round((amount * toPaise(bill.invoice_tax ?? '0')) / due); // R-FIN-05: pro-rated invoice tax
  } else {
    const rate = Number(await SettingsService.get<string | number>(TAX_SETTING[input.source_type]));
    tax = taxInclusive(amount, rate); // R-FIN-02
  }

  return repo.insertPayment(tx, {
    source_type: input.source_type,
    source_id: input.source_id,
    member_id: bill.member_id,
    business_client_id: bill.business_client_id,
    payer_name: bill.payer_name,
    amount: fromPaise(amount),
    tax_amount: fromPaise(tax),
    method: input.method,
    gateway_reference: input.gateway_reference ?? (input.method === PAYMENT_METHOD.ONLINE ? mockGatewayReference() : null),
    received_by_user_id: input.received_by_user_id,
    notes: input.notes ?? null,
  });
}

/** R-FIN-06: records a refund on the original payment (never a new negative row). Used by manual refunds and cancellations. */
export async function refundInTx(tx: Tx, payment_id: string, amount: string, reason: string): Promise<void> {
  const { rows } = await tx.query<{ amount: string; refunded_amount: string }>('SELECT amount, refunded_amount FROM payments WHERE id = $1 FOR UPDATE', [payment_id]);
  const cur = rows[0];
  if (!cur) throw new AppError('PAYMENT_NOT_FOUND');
  const room = toPaise(cur.amount) - toPaise(cur.refunded_amount);
  const asked = toPaise(amount);
  if (asked <= 0 || asked > room) throw new AppError('REFUND_EXCEEDS_PAYMENT', { refundable: fromPaise(room) });
  await tx.query('UPDATE payments SET refunded_amount = refunded_amount + $2, refund_reason = $3, refunded_at = now() WHERE id = $1', [payment_id, amount, reason]);
}

export const PaymentsService = {
  async create(user: AuthUser, body: PaymentsCreateRequest): Promise<PaymentView> {
    if (!METHODS_BY_ROLE[user.role].includes(body.payment_method)) {
      throw new AppError('FORBIDDEN', { reason: `Role ${user.role} may not take ${body.payment_method} payments.` });
    }
    // The kitchen screen takes cash/card/UPI for cafe orders only (extension for the built kitchen POS).
    if (user.role === USER_ROLE.KITCHEN_MANAGER && body.source_type !== 'BAR_ORDER') throw new AppError('FORBIDDEN');
    const staff = user.role === USER_ROLE.FRONT_DESK || user.role === USER_ROLE.OWNER_ADMIN || user.role === USER_ROLE.KITCHEN_MANAGER;
    const id = await withTransaction((tx) =>
      recordPayment(tx, {
        source_type: body.source_type,
        source_id: body.source_id,
        amount: body.amount,
        method: body.payment_method,
        gateway_reference: body.gateway_reference,
        notes: body.notes,
        received_by_user_id: staff ? user.id : null,
        require_member_id: user.role === USER_ROLE.MEMBER ? user.member_id : undefined,
        require_business_client_id: user.role === USER_ROLE.BUSINESS_CLIENT ? user.business_client_id : undefined,
      }),
    );
    return (await repo.findView(repo.pool, id))!;
  },

  async list(user: AuthUser, input: PaymentsListInput): Promise<{ rows: PaymentView[]; total: number }> {
    const filter: repo.PaymentFilter = { source_type: input.source_type, revenue_category: input.revenue_category, method: input.method, status: input.status, from: input.from, to: input.to };
    if (user.role === USER_ROLE.OWNER_ADMIN) {
      filter.member_id = input.member_id;
      filter.business_client_id = input.business_client_id;
    } else if (user.role === USER_ROLE.MEMBER) filter.member_id = user.member_id ?? '00000000-0000-0000-0000-000000000000';
    else if (user.role === USER_ROLE.BUSINESS_CLIENT) filter.business_client_id = user.business_client_id ?? '00000000-0000-0000-0000-000000000000';
    else filter.received_by_user_id = user.id; // FRONT_DESK: own (the payments they took)
    return repo.list(repo.pool, filter, input.page_size, offsetOf(input));
  },

  async get(user: AuthUser, id: string): Promise<PaymentView> {
    const p = await repo.findView(repo.pool, id);
    const own =
      user.role === USER_ROLE.OWNER_ADMIN ||
      (user.role === USER_ROLE.MEMBER && p?.member_id === user.member_id) ||
      (user.role === USER_ROLE.BUSINESS_CLIENT && p?.business_client_id === user.business_client_id) ||
      (user.role !== USER_ROLE.MEMBER && user.role !== USER_ROLE.BUSINESS_CLIENT && p?.received_by_user_id === user.id);
    if (!p || !own) throw new AppError('PAYMENT_NOT_FOUND'); // do not reveal other people's payments
    return p;
  },

  /** R-FIN-06: manual refund, OWNER_ADMIN only (route-level), recorded on the original payment. */
  async refund(id: string, body: PaymentsRefundRequest): Promise<PaymentView> {
    await withTransaction((tx) => refundInTx(tx, id, body.amount, body.reason));
    return (await repo.findView(repo.pool, id))!;
  },
};
