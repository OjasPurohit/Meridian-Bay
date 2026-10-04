/**
 * SQL for the clients module (hand-written, parameterised). Owns `business_clients`.
 * The contract (clients.create / clients.list) also lists `users` and `invoices` as tables touched:
 *   - invoices: read-only aggregation for the BusinessClientDetail totals.
 * Every function takes a `Tx`, so the service decides whether it runs on the pool or inside a transaction.
 */
import type { BusinessClientDetail } from '@shared/types/api';
import { query, type Tx } from '../../kernel/db';

/** Non-transactional handle: statements run on the pool. */
export const pool: Tx = { query };

/**
 * Totals definition (the contract names the fields but not the arithmetic):
 *  - "issued" invoices = status SENT (DRAFT and VOID are excluded); amounts come from the view invoice_totals;
 *  - invoice_count / total_invoiced / total_paid are over issued invoices;
 *  - total_outstanding = R-FIN-08: SUM(total_amount - amount_paid) over issued invoices not yet PAID.
 * Money is cast to numeric(12,2) so it serialises as a 2-decimal string even when there are no invoices.
 */
const DETAIL_SELECT = `
  SELECT c.id, c.company_name, c.contact_name, c.email, c.phone, c.gstin, c.billing_address, c.notes,
         c.is_active, c.created_at, c.updated_at,
         t.invoice_count, t.total_invoiced, t.total_paid, t.total_outstanding
    FROM business_clients c
    LEFT JOIN LATERAL (
      SELECT count(*)                                                                                   AS invoice_count,
             COALESCE(sum(x.total_amount), 0)::numeric(12,2)                                            AS total_invoiced,
             COALESCE(sum(x.amount_paid), 0)::numeric(12,2)                                             AS total_paid,
             COALESCE(sum(x.total_amount - x.amount_paid)
                      FILTER (WHERE x.payment_state <> 'PAID'), 0)::numeric(12,2) AS total_outstanding
        FROM invoices i
        JOIN invoice_totals x ON x.invoice_id = i.id
       WHERE i.business_client_id = c.id AND i.status = 'SENT'
    ) t ON true`;

export async function findById(db: Tx, id: string): Promise<BusinessClientDetail | null> {
  const { rows } = await db.query<BusinessClientDetail>(`${DETAIL_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

export interface ClientFilter {
  q?: string;
  is_active?: boolean;
}

/** Escape LIKE wildcards so "50%" searches for the literal text. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

function whereClause(filter: ClientFilter): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.q) {
    params.push(`%${escapeLike(filter.q)}%`);
    const p = `$${params.length}`;
    conditions.push(`(c.company_name ILIKE ${p} OR c.contact_name ILIKE ${p} OR c.email ILIKE ${p} OR c.phone ILIKE ${p} OR c.gstin ILIKE ${p})`);
  }
  if (filter.is_active !== undefined) {
    params.push(filter.is_active);
    conditions.push(`c.is_active = $${params.length}`);
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

/** Fixed sort (API_CONTRACT §1: no client-controlled sort): company name, then id for a stable page order. */
export async function list(db: Tx, filter: ClientFilter, limit: number, offset: number): Promise<{ rows: BusinessClientDetail[]; total: number }> {
  const { sql, params } = whereClause(filter);
  const total = (await db.query<{ n: number }>(`SELECT count(*) AS n FROM business_clients c ${sql}`, params)).rows[0]!.n;
  const { rows } = await db.query<BusinessClientDetail>(
    `${DETAIL_SELECT} ${sql} ORDER BY lower(c.company_name), c.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return { rows, total };
}

export interface NewClient {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  gstin: string | null;
  billing_address: string | null;
  notes: string | null;
}

export async function insertClient(db: Tx, c: NewClient): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO business_clients (company_name, contact_name, email, phone, gstin, billing_address, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [c.company_name, c.contact_name, c.email, c.phone, c.gstin, c.billing_address, c.notes],
  );
  return rows[0]!.id;
}

/** Columns a PATCH may touch. `updated_at` is maintained by the table trigger. */
export const UPDATABLE_COLUMNS = ['company_name', 'contact_name', 'email', 'phone', 'gstin', 'billing_address', 'notes', 'is_active'] as const;
export type UpdatableColumn = (typeof UPDATABLE_COLUMNS)[number];

/** Returns false when no row has this id. Column names come from the fixed whitelist above, never from the request. */
export async function updateClient(db: Tx, id: string, changes: [UpdatableColumn, unknown][]): Promise<boolean> {
  const assignments = changes.map(([column], i) => {
    if (!UPDATABLE_COLUMNS.includes(column)) throw new Error(`column ${column} is not updatable`);
    return `${column} = $${i + 2}`;
  });
  const result = await db.query(`UPDATE business_clients SET ${assignments.join(', ')} WHERE id = $1`, [id, ...changes.map(([, v]) => v)]);
  return (result.rowCount ?? 0) > 0;
}
