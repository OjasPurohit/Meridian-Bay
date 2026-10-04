/**
 * Cafe orders, menu and the kitchen board (R-BAR-01..10). One order = one kitchen ticket; status is the only record of
 * progress; totals and payment state come from the view bar_order_totals. The kitchen sees no prices or payments.
 */
import { PAYMENT_METHOD, USER_ROLE, type OrderStatus, type PaymentMethod } from '@shared/constants/enums';
import { ORDER_TRANSITIONS } from '@shared/constants/rules';
import type { BarDailySummary, BarOrderDetail, KitchenOrder, MemberPosLookup } from '@shared/types/api';
import type { BarMenuItem, BarOrderItem } from '@shared/types/rows';
import type { BarOrderCreateRequest } from '@shared/types/requests.generated';
import { fromPaise, percentOf, toPaise } from '@shared/lib/money';
import { istDate } from '@shared/lib/time';
import type { AuthUser } from '../../kernel/auth';
import { query, withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { offsetOf } from '../../kernel/validate';
import * as members from '../members/repo';
import { recordPayment, refundInTx } from '../payments/service';
import { ReportsService } from '../reports/service';

const pool: Tx = { query };
const NOBODY = '00000000-0000-0000-0000-000000000000';
const isStaff = (u: AuthUser) => u.role !== USER_ROLE.MEMBER;

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.member_id, o.guest_name, o.status, o.discount_amount, o.notes, o.created_at, o.updated_at, o.table_label,
         t.subtotal, t.total_amount, t.amount_paid, t.payment_status, mu.full_name AS member_name, m.member_code
    FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id
    LEFT JOIN members m ON m.id = o.member_id LEFT JOIN users mu ON mu.id = m.user_id`;

async function attachItems(db: Tx, orders: Omit<BarOrderDetail, 'items'>[]): Promise<BarOrderDetail[]> {
  if (orders.length === 0) return [];
  const items = (await db.query<BarOrderItem>('SELECT * FROM bar_order_items WHERE bar_order_id = ANY($1) ORDER BY created_at, id', [orders.map((o) => o.id)])).rows;
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.bar_order_id === o.id) }));
}

export async function barOrderDetail(db: Tx, id: string): Promise<BarOrderDetail | null> {
  const { rows } = await db.query<Omit<BarOrderDetail, 'items'>>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] ? (await attachItems(db, rows))[0]! : null;
}

async function kitchenView(db: Tx, orders: { id: string; order_number: string; status: OrderStatus; table_label: string | null; member_name: string | null; guest_name: string | null; notes: string | null; created_at: string }[]): Promise<KitchenOrder[]> {
  if (orders.length === 0) return [];
  const items = (await db.query<BarOrderItem>('SELECT * FROM bar_order_items WHERE bar_order_id = ANY($1) ORDER BY created_at, id', [orders.map((o) => o.id)])).rows;
  return orders.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    table_label: o.table_label,
    customer_label: o.member_name ?? o.guest_name ?? o.table_label ?? 'Guest',
    notes: o.notes,
    created_at: o.created_at,
    minutes_waiting: Math.max(0, Math.floor((Date.now() - Date.parse(o.created_at)) / 60_000)),
    items: items.filter((i) => i.bar_order_id === o.id).map((i) => ({ item_name: i.item_name, quantity: i.quantity, notes: i.notes })),
  }));
}

export const BarService = {
  async menu(user: AuthUser | undefined, q: { category?: string; include_unavailable?: boolean }): Promise<BarMenuItem[]> {
    if (q.include_unavailable && !(user && isStaff(user))) throw new AppError('FORBIDDEN');
    const c: string[] = [];
    const params: unknown[] = [];
    if (!q.include_unavailable) c.push('is_available');
    if (q.category) {
      params.push(q.category);
      c.push(`category = $${params.length}`);
    }
    return (await query<BarMenuItem>(`SELECT * FROM bar_menu_items ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY sort_order, name`, params)).rows;
  },

  async menuCreate(b: Record<string, unknown>): Promise<BarMenuItem> {
    const cols = Object.keys(b);
    return (await query<BarMenuItem>(`INSERT INTO bar_menu_items (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, cols.map((k) => b[k]))).rows[0]!;
  },

  async menuUpdate(id: string, b: Record<string, unknown>): Promise<BarMenuItem> {
    const cols = Object.keys(b).filter((k) => b[k] !== undefined);
    const rows = cols.length
      ? (await query<BarMenuItem>(`UPDATE bar_menu_items SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...cols.map((k) => b[k])])).rows
      : (await query<BarMenuItem>('SELECT * FROM bar_menu_items WHERE id = $1', [id])).rows;
    if (!rows[0]) throw new AppError('MENU_ITEM_NOT_FOUND');
    return rows[0];
  },

  /** Kitchen stock: +/- on the quantity on hand; the CHECK keeps it from going below zero. */
  async menuStock(id: string, change: number): Promise<BarMenuItem> {
    const { rows } = await query<BarMenuItem>('UPDATE bar_menu_items SET stock_quantity = stock_quantity + $2 WHERE id = $1 AND stock_quantity + $2 >= 0 RETURNING *', [id, change]);
    if (!rows[0]) {
      const exists = (await query('SELECT 1 FROM bar_menu_items WHERE id = $1', [id])).rowCount;
      throw exists ? new AppError('VALIDATION_ERROR', { fields: { quantity_change: 'Stock cannot go below zero.' } }) : new AppError('MENU_ITEM_NOT_FOUND');
    }
    return rows[0];
  },

  async orderCreate(user: AuthUser, body: BarOrderCreateRequest): Promise<BarOrderDetail> {
    const member_id = user.role === USER_ROLE.MEMBER ? (user.member_id ?? null) : (body.member_id ?? null);
    if (user.role === USER_ROLE.MEMBER && (body.member_id || body.guest_name || body.payment_method)) throw new AppError('FORBIDDEN');
    // R-BAR-03: a member, a named guest or a table label (at least one)
    if (!member_id && !body.guest_name && !body.table_label) throw new AppError('VALIDATION_ERROR', { fields: { table_label: 'Give a member, a guest name or a table.' } });
    const method: PaymentMethod | undefined = body.payment_method;
    if (method === PAYMENT_METHOD.ONLINE && user.role !== USER_ROLE.OWNER_ADMIN) throw new AppError('FORBIDDEN');
    const id = await withTransaction(async (tx) => {
      if (member_id && !(await members.summaryById(tx, member_id))) throw new AppError('MEMBER_NOT_FOUND');
      const lines: { item: BarMenuItem; qty: number; notes: string | null }[] = [];
      let subtotal = 0;
      for (const l of body.items) {
        const item = (await tx.query<BarMenuItem>('SELECT * FROM bar_menu_items WHERE id = $1', [l.bar_menu_item_id])).rows[0];
        if (!item) throw new AppError('MENU_ITEM_NOT_FOUND', { bar_menu_item_id: l.bar_menu_item_id });
        if (!item.is_available) throw new AppError('MENU_ITEM_UNAVAILABLE', { name: item.name });
        // stock comes off the menu item atomically; zero rows = not enough left
        const taken = await tx.query('UPDATE bar_menu_items SET stock_quantity = stock_quantity - $2 WHERE id = $1 AND stock_quantity >= $2', [item.id, l.quantity]);
        if (!taken.rowCount) throw new AppError('OUT_OF_STOCK', { items: [{ bar_menu_item_id: item.id, name: item.name, requested: l.quantity, available: item.stock_quantity }] });
        lines.push({ item, qty: l.quantity, notes: l.notes ?? null });
        subtotal += toPaise(item.price) * l.quantity;
      }
      const plan = member_id ? await members.effectivePlan(tx, member_id) : null; // R-BAR-01
      const discount = plan ? percentOf(subtotal, Number(plan.bar_discount_percent)) : 0;
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO bar_orders (member_id, guest_name, table_label, discount_amount, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [member_id, member_id ? null : (body.guest_name ?? null), body.table_label ?? null, fromPaise(discount), body.notes ?? null],
      );
      const id = rows[0]!.id;
      for (const l of lines) await tx.query('INSERT INTO bar_order_items (bar_order_id, bar_menu_item_id, item_name, unit_price, quantity, notes) VALUES ($1, $2, $3, $4, $5, $6)', [id, l.item.id, l.item.name, l.item.price, l.qty, l.notes]);
      if (method) await recordPayment(tx, { source_type: 'BAR_ORDER', source_id: id, method, received_by_user_id: user.id });
      return id;
    });
    return (await barOrderDetail(pool, id))!;
  },

  /** Till lookup (kitchen, desk, owner): who is this customer and what café discount do they get. Never the member list. */
  async memberLookup(q: string): Promise<MemberPosLookup[]> {
    const text = q.trim();
    const digits = text.replace(/\D/g, '');
    const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const { rows } = await query<{ id: string }>(
      `SELECT m.id FROM members m JOIN users u ON u.id = m.user_id
        WHERE u.is_active AND (
              upper(m.member_code) = upper($1) OR lower(u.email) = lower($1)
           OR ($2 <> '' AND length($2) >= 6 AND regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') LIKE '%' || $2)
           OR (length($1) >= 3 AND u.full_name ILIKE $3))
        ORDER BY u.full_name LIMIT 5`,
      [text, digits, like],
    );
    const out: MemberPosLookup[] = [];
    for (const r of rows) {
      const m = await members.summaryById(pool, r.id);
      if (!m) continue;
      const plan = await members.effectivePlan(pool, r.id);
      out.push({ member_id: m.id, member_code: m.member_code, full_name: m.full_name, membership_status: plan ? 'ACTIVE' : 'NONE', plan_name: plan?.name ?? null, membership_type: plan?.membership_type ?? null, bar_discount_percent: plan?.bar_discount_percent ?? '0.00' });
    }
    return out;
  },

  async orderList(user: AuthUser, q: { status?: string; payment_status?: string; table_label?: string; member_id?: string; from?: string; to?: string; page: number; page_size: number }) {
    const c: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      c.push(sql.replace('?', `$${params.length}`));
    };
    if (q.status) add('o.status = ?', q.status);
    if (q.payment_status) add('t.payment_status = ?', q.payment_status);
    if (q.table_label) add('o.table_label = ?', q.table_label);
    if (q.from) add(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ?`, q.from);
    if (q.to) add(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ?`, q.to);
    if (user.role === USER_ROLE.MEMBER) add('o.member_id = ?', user.member_id ?? NOBODY);
    else if (q.member_id) add('o.member_id = ?', q.member_id);
    const where = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id ${where}`, params)).rows[0]!.n;
    const { rows } = await query<Omit<BarOrderDetail, 'items'>>(`${ORDER_SELECT} ${where} ORDER BY o.created_at DESC, o.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.page_size, offsetOf(q)]);
    return { rows: await attachItems(pool, rows), total };
  },

  async orderGet(user: AuthUser, id: string): Promise<BarOrderDetail> {
    const o = await barOrderDetail(pool, id);
    if (!o || (user.role === USER_ROLE.MEMBER && o.member_id !== user.member_id)) throw new AppError('ORDER_NOT_FOUND');
    return o;
  },

  /** R-BAR-08: only while NEW; a paid order is refunded. */
  async orderCancel(id: string): Promise<BarOrderDetail> {
    await withTransaction((tx) => setStatus(tx, id, 'CANCELLED'));
    return (await barOrderDetail(pool, id))!;
  },

  async dailySummary(date?: string): Promise<BarDailySummary> {
    const d = date ?? istDate(new Date());
    return (await ReportsService.bar({ from: d, to: d }))[0]!;
  },

  // ---- kitchen
  async kitchenList(q: { status?: OrderStatus[]; date?: string }): Promise<KitchenOrder[]> {
    const statuses = q.status?.length ? q.status : (['NEW', 'PREPARING', 'READY'] as OrderStatus[]);
    const date = q.date ?? istDate(new Date());
    // Open orders are always shown; a finished status is limited to the chosen day.
    const { rows } = await query<{ id: string; order_number: string; status: OrderStatus; table_label: string | null; member_name: string | null; guest_name: string | null; notes: string | null; created_at: string }>(
      `SELECT o.id, o.order_number, o.status, o.table_label, mu.full_name AS member_name, o.guest_name, o.notes, o.created_at
         FROM bar_orders o LEFT JOIN members m ON m.id = o.member_id LEFT JOIN users mu ON mu.id = m.user_id
        WHERE o.status = ANY($1) AND (o.status IN ('NEW', 'PREPARING', 'READY') OR (o.created_at AT TIME ZONE 'Asia/Kolkata')::date = $2) ORDER BY o.created_at, o.id`,
      [statuses, date],
    );
    return kitchenView(pool, rows);
  },

  async kitchenGet(id: string): Promise<KitchenOrder> {
    const { rows } = await query<{ id: string; order_number: string; status: OrderStatus; table_label: string | null; member_name: string | null; guest_name: string | null; notes: string | null; created_at: string }>(
      `SELECT o.id, o.order_number, o.status, o.table_label, mu.full_name AS member_name, o.guest_name, o.notes, o.created_at
         FROM bar_orders o LEFT JOIN members m ON m.id = o.member_id LEFT JOIN users mu ON mu.id = m.user_id WHERE o.id = $1`,
      [id],
    );
    if (!rows[0]) throw new AppError('ORDER_NOT_FOUND');
    return (await kitchenView(pool, rows))[0]!;
  },

  async kitchenStatus(id: string, to: OrderStatus): Promise<KitchenOrder> {
    await withTransaction((tx) => setStatus(tx, id, to));
    return this.kitchenGet(id);
  },
};

/** R-BAR-07 transitions; cancelling refunds whatever was paid (R-BAR-08). */
async function setStatus(tx: Tx, id: string, to: OrderStatus): Promise<void> {
  const cur = (await tx.query<{ status: OrderStatus }>('SELECT status FROM bar_orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!cur) throw new AppError('ORDER_NOT_FOUND');
  if (!ORDER_TRANSITIONS[cur.status].includes(to)) throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to });
  await tx.query('UPDATE bar_orders SET status = $2 WHERE id = $1', [id, to]);
  if (to === 'CANCELLED') {
    await tx.query('UPDATE bar_menu_items m SET stock_quantity = m.stock_quantity + i.quantity FROM bar_order_items i WHERE i.bar_order_id = $1 AND i.bar_menu_item_id = m.id', [id]);
    const pays = (await tx.query<{ id: string; amount: string; refunded_amount: string }>(`SELECT id, amount, refunded_amount FROM payments WHERE source_type = 'BAR_ORDER' AND source_id = $1`, [id])).rows;
    for (const p of pays) {
      const left = toPaise(p.amount) - toPaise(p.refunded_amount);
      if (left > 0) await refundInTx(tx, p.id, fromPaise(left), 'Order cancelled');
    }
  }
}
