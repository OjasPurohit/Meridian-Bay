/**
 * SQL for the payments ledger (R-FIN-01). Owns `payments`; READS the bills it can be made against and the derived
 * views (court_booking_totals, shop_order_totals, bar_order_totals, invoice_totals, payment_ledger).
 */
import type { PaymentSourceType } from '@shared/constants/enums';
import type { PaymentView } from '@shared/types/api';
import { query, type Tx } from '../../kernel/db';

export const pool: Tx = { query };

/** What a payment is being made against: how much is due, how much was paid, and who it belongs to. */
export interface Bill {
  source_type: PaymentSourceType;
  source_id: string;
  amount_due: string;
  amount_paid: string; // net of refunds
  gross_paid: string; // before refunds
  member_id: string | null;
  business_client_id: string | null;
  payer_name: string | null;
  /** False when the bill can no longer be paid (cancelled booking / order, invoice not SENT or void). */
  payable: boolean;
  /** For invoices: tax part of the invoice total, used to pro-rate the tax of a partial payment (R-FIN-05). */
  invoice_tax: string | null;
}

const PAID = (type: PaymentSourceType) => `(SELECT coalesce(sum(x.amount - x.refunded_amount), 0) AS net, coalesce(sum(x.amount), 0) AS gross FROM payments x WHERE x.source_type = '${type}' AND x.source_id = $1)`;

export async function loadBill(db: Tx, type: PaymentSourceType, id: string, lock = false): Promise<Bill | null> {
  const forUpdate = lock ? ' FOR UPDATE OF b' : '';
  switch (type) {
    case 'COURT_BOOKING': {
      const { rows } = await db.query<Bill>(
        `SELECT 'COURT_BOOKING' AS source_type, b.id AS source_id, (b.list_price - b.discount_amount)::text AS amount_due,
                p.net::text AS amount_paid, p.gross::text AS gross_paid, b.member_id, NULL::uuid AS business_client_id, b.guest_name AS payer_name,
                (b.cancelled_at IS NULL) AS payable, NULL::text AS invoice_tax
           FROM court_bookings b, LATERAL ${PAID('COURT_BOOKING')} p WHERE b.id = $1${forUpdate}`,
        [id],
      );
      return rows[0] ?? null;
    }
    case 'MEMBERSHIP': {
      const { rows } = await db.query<Bill>(
        `SELECT 'MEMBERSHIP' AS source_type, b.id AS source_id, b.price_paid::text AS amount_due,
                p.net::text AS amount_paid, p.gross::text AS gross_paid, b.member_id, NULL::uuid AS business_client_id, NULL AS payer_name,
                (b.cancelled_at IS NULL) AS payable, NULL::text AS invoice_tax
           FROM memberships b, LATERAL ${PAID('MEMBERSHIP')} p WHERE b.id = $1${forUpdate}`,
        [id],
      );
      return rows[0] ?? null;
    }
    case 'SHOP_ORDER': {
      const { rows } = await db.query<Bill>(
        `SELECT 'SHOP_ORDER' AS source_type, b.id AS source_id, t.total_amount::text AS amount_due,
                p.net::text AS amount_paid, p.gross::text AS gross_paid, b.member_id, NULL::uuid AS business_client_id, b.guest_name AS payer_name,
                (b.status <> 'CANCELLED') AS payable, NULL::text AS invoice_tax
           FROM shop_orders b JOIN shop_order_totals t ON t.shop_order_id = b.id, LATERAL ${PAID('SHOP_ORDER')} p WHERE b.id = $1${forUpdate}`,
        [id],
      );
      return rows[0] ?? null;
    }
    case 'BAR_ORDER': {
      const { rows } = await db.query<Bill>(
        `SELECT 'BAR_ORDER' AS source_type, b.id AS source_id, t.total_amount::text AS amount_due,
                p.net::text AS amount_paid, p.gross::text AS gross_paid, b.member_id, NULL::uuid AS business_client_id, b.guest_name AS payer_name,
                (b.status <> 'CANCELLED') AS payable, NULL::text AS invoice_tax
           FROM bar_orders b JOIN bar_order_totals t ON t.bar_order_id = b.id, LATERAL ${PAID('BAR_ORDER')} p WHERE b.id = $1${forUpdate}`,
        [id],
      );
      return rows[0] ?? null;
    }
    case 'INVOICE': {
      const { rows } = await db.query<Bill>(
        `SELECT 'INVOICE' AS source_type, b.id AS source_id, t.total_amount::text AS amount_due,
                p.net::text AS amount_paid, p.gross::text AS gross_paid, b.member_id, b.business_client_id, NULL AS payer_name,
                (b.status = 'SENT') AS payable, t.tax_amount::text AS invoice_tax
           FROM invoices b JOIN invoice_totals t ON t.invoice_id = b.id, LATERAL ${PAID('INVOICE')} p WHERE b.id = $1${forUpdate}`,
        [id],
      );
      return rows[0] ?? null;
    }
  }
}

export interface NewPayment {
  source_type: PaymentSourceType;
  source_id: string;
  member_id: string | null;
  business_client_id: string | null;
  payer_name: string | null;
  amount: string;
  tax_amount: string;
  method: string;
  gateway_reference: string | null;
  received_by_user_id: string | null;
  notes: string | null;
}

export async function insertPayment(db: Tx, p: NewPayment): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO payments (source_type, source_id, member_id, business_client_id, payer_name, amount, tax_amount, method, gateway_reference, received_by_user_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [p.source_type, p.source_id, p.member_id, p.business_client_id, p.payer_name, p.amount, p.tax_amount, p.method, p.gateway_reference, p.received_by_user_id, p.notes],
  );
  return rows[0]!.id;
}

// ------------------------------------------------------------------ reading (PaymentView)
const VIEW_SELECT = `
  SELECT p.id, p.payment_number, p.source_type, p.source_id, p.member_id, p.business_client_id, p.payer_name, p.amount, p.tax_amount, p.method,
         p.gateway_reference, p.received_by_user_id, p.paid_at, p.refunded_amount, p.refund_reason, p.refunded_at, p.notes, p.created_at, p.updated_at,
         l.revenue_category, l.status,
         coalesce(mu.full_name, bc.company_name, p.payer_name, 'Guest') AS payer_label,
         CASE p.source_type
           WHEN 'COURT_BOOKING' THEN (SELECT c.name || ' · ' || to_char(b.start_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI') FROM court_bookings b JOIN courts c ON c.id = b.court_id WHERE b.id = p.source_id)
           WHEN 'MEMBERSHIP' THEN (SELECT pl.name FROM memberships m JOIN membership_plans pl ON pl.id = m.membership_plan_id WHERE m.id = p.source_id)
           WHEN 'SHOP_ORDER' THEN (SELECT 'Shop order ' || o.order_number FROM shop_orders o WHERE o.id = p.source_id)
           WHEN 'BAR_ORDER' THEN (SELECT 'Cafe order ' || o.order_number FROM bar_orders o WHERE o.id = p.source_id)
           WHEN 'INVOICE' THEN (SELECT 'Invoice ' || i.invoice_number FROM invoices i WHERE i.id = p.source_id)
         END AS source_label,
         ru.full_name AS received_by_name
    FROM payments p
    JOIN payment_ledger l ON l.payment_id = p.id
    LEFT JOIN members m ON m.id = p.member_id
    LEFT JOIN users mu ON mu.id = m.user_id
    LEFT JOIN business_clients bc ON bc.id = p.business_client_id
    LEFT JOIN users ru ON ru.id = p.received_by_user_id`;

export async function findView(db: Tx, id: string): Promise<PaymentView | null> {
  const { rows } = await db.query<PaymentView>(`${VIEW_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface PaymentFilter {
  source_type?: string;
  revenue_category?: string;
  method?: string;
  status?: string;
  member_id?: string;
  business_client_id?: string;
  received_by_user_id?: string;
  source_id?: string;
  from?: string;
  to?: string;
}

function where(f: PaymentFilter): { sql: string; params: unknown[] } {
  const c: string[] = [];
  const params: unknown[] = [];
  const eq = (col: string, v: unknown) => {
    if (v === undefined) return;
    params.push(v);
    c.push(`${col} = $${params.length}`);
  };
  eq('p.source_type', f.source_type);
  eq('l.revenue_category', f.revenue_category);
  eq('p.method', f.method);
  eq('l.status', f.status);
  eq('p.member_id', f.member_id);
  eq('p.business_client_id', f.business_client_id);
  eq('p.received_by_user_id', f.received_by_user_id);
  eq('p.source_id', f.source_id);
  if (f.from) {
    params.push(f.from);
    c.push(`(p.paid_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}`);
  }
  if (f.to) {
    params.push(f.to);
    c.push(`(p.paid_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}`);
  }
  return { sql: c.length ? `WHERE ${c.join(' AND ')}` : '', params };
}

export async function list(db: Tx, filter: PaymentFilter, limit: number, offset: number): Promise<{ rows: PaymentView[]; total: number }> {
  const { sql, params } = where(filter);
  const total = (await db.query<{ n: number }>(`SELECT count(*) AS n FROM payments p JOIN payment_ledger l ON l.payment_id = p.id ${sql}`, params)).rows[0]!.n;
  const { rows } = await db.query<PaymentView>(`${VIEW_SELECT} ${sql} ORDER BY p.paid_at DESC, p.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return { rows, total };
}
