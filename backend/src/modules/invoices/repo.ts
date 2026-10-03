/**
 * SQL for invoices. Owns `invoices` and `invoice_items`; totals, amount paid and payment state come from the view
 * `invoice_totals` (ADR-015): nothing derived is stored.
 */
import type { InvoiceDetail, InvoiceView } from '@shared/types/api';
import type { BusinessClient, InvoiceItem, Payment } from '@shared/types/rows';
import { query, type Tx } from '../../kernel/db';

export const pool: Tx = { query };

const VIEW_SELECT = `
  SELECT i.id, i.invoice_number, i.business_client_id, i.member_id, i.status, i.issue_date::text AS issue_date, i.due_date::text AS due_date,
         i.tax_rate, i.notes, i.created_at, i.updated_at,
         t.invoice_type, t.subtotal, t.tax_amount, t.total_amount, t.amount_paid,
         (t.total_amount - t.amount_paid)::numeric(12,2) AS amount_outstanding, t.payment_state,
         coalesce(bc.company_name, mu.full_name) AS client_name
    FROM invoices i
    JOIN invoice_totals t ON t.invoice_id = i.id
    LEFT JOIN business_clients bc ON bc.id = i.business_client_id
    LEFT JOIN members m ON m.id = i.member_id
    LEFT JOIN users mu ON mu.id = m.user_id`;

export interface InvoiceFilter {
  status?: string;
  payment_state?: string;
  invoice_type?: string;
  business_client_id?: string;
  member_id?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  /** Customers never see DRAFT invoices. */
  hide_drafts?: boolean;
}

function where(f: InvoiceFilter): { sql: string; params: unknown[] } {
  const c: string[] = [];
  const params: unknown[] = [];
  const eq = (col: string, v: unknown) => {
    if (v === undefined) return;
    params.push(v);
    c.push(`${col} = $${params.length}`);
  };
  eq('i.status', f.status);
  eq('t.payment_state', f.payment_state);
  eq('t.invoice_type', f.invoice_type);
  eq('i.business_client_id', f.business_client_id);
  eq('i.member_id', f.member_id);
  if (f.from) {
    params.push(f.from);
    c.push(`i.issue_date >= $${params.length}`);
  }
  if (f.to) {
    params.push(f.to);
    c.push(`i.issue_date <= $${params.length}`);
  }
  if (f.overdue) c.push(`t.payment_state = 'OVERDUE'`);
  if (f.hide_drafts) c.push(`i.status <> 'DRAFT'`);
  return { sql: c.length ? `WHERE ${c.join(' AND ')}` : '', params };
}

export async function list(db: Tx, filter: InvoiceFilter, limit: number, offset: number): Promise<{ rows: InvoiceView[]; total: number }> {
  const { sql, params } = where(filter);
  const total = (await db.query<{ n: number }>(`SELECT count(*) AS n FROM invoices i JOIN invoice_totals t ON t.invoice_id = i.id ${sql}`, params)).rows[0]!.n;
  const { rows } = await db.query<InvoiceView>(`${VIEW_SELECT} ${sql} ORDER BY i.issue_date DESC, i.invoice_number DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return { rows, total };
}

export async function findView(db: Tx, id: string): Promise<InvoiceView | null> {
  const { rows } = await db.query<InvoiceView>(`${VIEW_SELECT} WHERE i.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findDetail(db: Tx, id: string): Promise<InvoiceDetail | null> {
  const view = await findView(db, id);
  if (!view) return null;
  const items = (await db.query<InvoiceItem>('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at, id', [id])).rows;
  const payments = (await db.query<Payment>(`SELECT * FROM payments WHERE source_type = 'INVOICE' AND source_id = $1 ORDER BY paid_at, id`, [id])).rows;
  const client = view.business_client_id ? ((await db.query<BusinessClient>('SELECT * FROM business_clients WHERE id = $1', [view.business_client_id])).rows[0] ?? null) : null;
  return { ...view, items, payments, client };
}

export async function lockStatus(db: Tx, id: string): Promise<{ status: string; paid: string } | null> {
  const { rows } = await db.query<{ status: string; paid: string }>(
    `SELECT i.status, (SELECT coalesce(sum(p.amount - p.refunded_amount), 0)::text FROM payments p WHERE p.source_type = 'INVOICE' AND p.source_id = i.id) AS paid
       FROM invoices i WHERE i.id = $1 FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

export interface NewInvoice {
  business_client_id: string | null;
  member_id: string | null;
  issue_date: string | null;
  due_date: string;
  tax_rate: string;
  notes: string | null;
  status: 'DRAFT' | 'SENT';
}

export async function insertInvoice(db: Tx, v: NewInvoice): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO invoices (business_client_id, member_id, issue_date, due_date, tax_rate, notes, status)
     VALUES ($1, $2, coalesce($3::date, current_date), $4, $5, $6, $7) RETURNING id`,
    [v.business_client_id, v.member_id, v.issue_date, v.due_date, v.tax_rate, v.notes, v.status],
  );
  return rows[0]!.id;
}

export async function replaceItems(db: Tx, id: string, items: { description: string; quantity: number; unit_price: string }[]): Promise<void> {
  await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
  for (const it of items) {
    await db.query('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES ($1, $2, $3, $4)', [id, it.description, it.quantity, it.unit_price]);
  }
}

export async function updateInvoice(db: Tx, id: string, changes: [string, unknown][]): Promise<void> {
  const ALLOWED = ['due_date', 'tax_rate', 'notes'];
  if (changes.length === 0) return;
  const set = changes.map(([col], i) => {
    if (!ALLOWED.includes(col)) throw new Error(`column ${col} is not updatable`);
    return `${col} = $${i + 2}`;
  });
  await db.query(`UPDATE invoices SET ${set.join(', ')} WHERE id = $1`, [id, ...changes.map(([, v]) => v)]);
}

export async function setStatus(db: Tx, id: string, status: 'SENT' | 'VOID'): Promise<void> {
  await db.query('UPDATE invoices SET status = $2 WHERE id = $1', [id, status]);
}

export async function businessClientExists(db: Tx, id: string): Promise<boolean> {
  return ((await db.query('SELECT 1 FROM business_clients WHERE id = $1', [id])).rowCount ?? 0) > 0;
}
export async function memberExists(db: Tx, id: string): Promise<boolean> {
  return ((await db.query('SELECT 1 FROM members WHERE id = $1', [id])).rowCount ?? 0) > 0;
}
