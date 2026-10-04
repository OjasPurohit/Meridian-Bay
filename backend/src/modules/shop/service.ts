/**
 * Shop and inventory (R-SHOP-01..09). One shelf: counter and online orders decrement the same products.stock_quantity,
 * atomically per line. Totals and payment state come from the view shop_order_totals.
 */
import { ORDER_FULFILLMENT, PAYMENT_METHOD, USER_ROLE, type PaymentMethod, type ShopOrderStatus } from '@shared/constants/enums';
import { SHOP_ORDER_TRANSITIONS } from '@shared/constants/rules';
import type { InventoryItem, ProductView, ShopOrderDetail } from '@shared/types/api';
import type { Product, ShopOrderItem } from '@shared/types/rows';
import type { ShopOrderCreateRequest } from '@shared/types/requests.generated';
import { fromPaise, percentOf, toPaise } from '@shared/lib/money';
import type { AuthUser } from '../../kernel/auth';
import { query, withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { SettingsService } from '../../kernel/settings';
import { offsetOf } from '../../kernel/validate';
import * as members from '../members/repo';
import { recordPayment, refundInTx } from '../payments/service';

const pool: Tx = { query };
const isStaff = (u: AuthUser | undefined) => !!u && u.role !== USER_ROLE.MEMBER;
const NOBODY = '00000000-0000-0000-0000-000000000000';

const stockStatus = (p: { stock_quantity: number; low_stock_threshold: number }): ProductView['stock_status'] =>
  p.stock_quantity <= 0 ? 'OUT_OF_STOCK' : p.stock_quantity <= p.low_stock_threshold ? 'LOW_STOCK' : 'IN_STOCK';

async function view(p: Product, user: AuthUser | undefined, pct: number): Promise<ProductView> {
  const v: ProductView = { id: p.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, description: p.description, price: p.price, image_url: p.image_url, stock_status: stockStatus(p) };
  if (pct > 0) v.member_price = fromPaise(toPaise(p.price) - percentOf(toPaise(p.price), pct));
  if (user && (user.role === USER_ROLE.FRONT_DESK || user.role === USER_ROLE.OWNER_ADMIN || user.role === USER_ROLE.KITCHEN_MANAGER || user.role === USER_ROLE.STORE_MANAGER)) {
    v.stock_quantity = p.stock_quantity;
    v.low_stock_threshold = p.low_stock_threshold;
    v.is_active = p.is_active;
  }
  return v;
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.fulfillment, o.status, o.member_id, o.guest_name, o.guest_phone, o.delivery_address, o.discount_amount, o.delivery_fee,
         o.created_at, o.updated_at, t.subtotal, t.total_amount, t.amount_paid, t.payment_status, mu.full_name AS member_name, m.member_code
    FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id
    LEFT JOIN members m ON m.id = o.member_id LEFT JOIN users mu ON mu.id = m.user_id`;

async function attachItems(db: Tx, orders: Omit<ShopOrderDetail, 'items'>[]): Promise<ShopOrderDetail[]> {
  if (orders.length === 0) return [];
  const items = (await db.query<ShopOrderItem>('SELECT * FROM shop_order_items WHERE shop_order_id = ANY($1) ORDER BY created_at, id', [orders.map((o) => o.id)])).rows;
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.shop_order_id === o.id) }));
}

export async function orderDetail(db: Tx, id: string): Promise<ShopOrderDetail | null> {
  const { rows } = await db.query<Omit<ShopOrderDetail, 'items'>>(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] ? (await attachItems(db, rows))[0]! : null;
}

export const ShopService = {
  async products(user: AuthUser | undefined, q: { category?: string; q?: string; in_stock?: boolean; include_inactive?: boolean }): Promise<ProductView[]> {
    if (q.include_inactive && user?.role !== USER_ROLE.OWNER_ADMIN) throw new AppError('FORBIDDEN');
    const c: string[] = [];
    const params: unknown[] = [];
    if (!q.include_inactive) c.push('is_active');
    if (q.category) {
      params.push(q.category);
      c.push(`category = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
      c.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length} OR brand ILIKE $${params.length})`);
    }
    if (q.in_stock) c.push('stock_quantity > 0');
    const rows = (await query<Product>(`SELECT * FROM products ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY category, name`, params)).rows;
    const plan = user?.role === USER_ROLE.MEMBER && user.member_id ? await members.effectivePlan(pool, user.member_id) : null;
    return Promise.all(rows.map((p) => view(p, user, plan ? Number(plan.shop_discount_percent) : 0)));
  },

  async product(user: AuthUser | undefined, id: string): Promise<ProductView> {
    const p = (await query<Product>('SELECT * FROM products WHERE id = $1', [id])).rows[0];
    if (!p || (!p.is_active && user?.role !== USER_ROLE.OWNER_ADMIN)) throw new AppError('PRODUCT_NOT_FOUND');
    const plan = user?.role === USER_ROLE.MEMBER && user.member_id ? await members.effectivePlan(pool, user.member_id) : null;
    return view(p, user, plan ? Number(plan.shop_discount_percent) : 0);
  },

  async productCreate(b: { sku: string; name: string; category: string; brand?: string; description?: string; price: string; image_url?: string; initial_stock?: number; low_stock_threshold?: number }): Promise<ProductView> {
    const threshold = b.low_stock_threshold ?? Number(await SettingsService.get<number>('low_stock_default_threshold'));
    const { rows } = await query<Product>(
      `INSERT INTO products (sku, name, category, brand, description, price, image_url, stock_quantity, low_stock_threshold) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [b.sku, b.name, b.category, b.brand ?? null, b.description ?? null, b.price, b.image_url ?? null, b.initial_stock ?? 0, threshold],
    );
    return view(rows[0]!, { id: '', role: USER_ROLE.OWNER_ADMIN }, 0);
  },

  /** R-SHOP-09: stock is never changed here. */
  async productUpdate(id: string, b: Record<string, unknown>): Promise<ProductView> {
    const cols = Object.keys(b).filter((k) => b[k] !== undefined);
    const rows = cols.length
      ? (await query<Product>(`UPDATE products SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...cols.map((k) => b[k])])).rows
      : (await query<Product>('SELECT * FROM products WHERE id = $1', [id])).rows;
    if (!rows[0]) throw new AppError('PRODUCT_NOT_FOUND');
    return view(rows[0], { id: '', role: USER_ROLE.OWNER_ADMIN }, 0);
  },

  /** Products are never deleted: DELETE deactivates (R-SHOP-09). */
  async productDelete(id: string): Promise<void> {
    const r = await query('UPDATE products SET is_active = false WHERE id = $1', [id]);
    if ((r.rowCount ?? 0) === 0) throw new AppError('PRODUCT_NOT_FOUND');
  },

  async orderCreate(user: AuthUser, body: ShopOrderCreateRequest): Promise<ShopOrderDetail> {
    const staff = isStaff(user);
    const member_id = user.role === USER_ROLE.MEMBER ? (user.member_id ?? null) : (body.member_id ?? null);
    if (user.role === USER_ROLE.MEMBER && (body.guest_name || body.member_id)) throw new AppError('FORBIDDEN');
    if (user.role === USER_ROLE.MEMBER && body.fulfillment === ORDER_FULFILLMENT.IN_STORE) throw new AppError('FORBIDDEN');
    if (staff && body.fulfillment !== ORDER_FULFILLMENT.IN_STORE && !member_id) throw new AppError('VALIDATION_ERROR', { fields: { member_id: 'Online orders belong to a member.' } });
    if (!member_id && !body.guest_name) throw new AppError('VALIDATION_ERROR', { fields: { guest_name: 'Required when no member is given.' } });
    if (body.fulfillment === ORDER_FULFILLMENT.DELIVERY && !body.delivery_address?.trim()) throw new AppError('DELIVERY_ADDRESS_REQUIRED');
    // R-SHOP-06: member orders are paid ONLINE, counter sales at once by CASH/CARD/UPI
    let method: PaymentMethod | undefined = body.payment_method;
    if (user.role === USER_ROLE.MEMBER) method = PAYMENT_METHOD.ONLINE;
    else if (body.fulfillment === ORDER_FULFILLMENT.IN_STORE && !method) throw new AppError('VALIDATION_ERROR', { fields: { payment_method: 'Required for counter sales.' } });
    if (staff && method === PAYMENT_METHOD.ONLINE && user.role !== USER_ROLE.OWNER_ADMIN) throw new AppError('FORBIDDEN');

    const merged = new Map<string, number>();
    for (const i of body.items) merged.set(i.product_id, (merged.get(i.product_id) ?? 0) + i.quantity);

    const id = await withTransaction(async (tx) => {
      if (member_id && !(await members.summaryById(tx, member_id))) throw new AppError('MEMBER_NOT_FOUND');
      let subtotal = 0;
      const lines: { product: Product; qty: number }[] = [];
      for (const [pid, qty] of [...merged].sort(([a], [b]) => a.localeCompare(b))) {
        // R-SHOP-02: atomic stock decrement; zero rows means missing, inactive or not enough stock
        const { rows } = await tx.query<Product>('UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1 AND stock_quantity >= $2 AND is_active RETURNING *', [pid, qty]);
        if (!rows[0]) {
          const exists = (await tx.query('SELECT 1 FROM products WHERE id = $1', [pid])).rowCount;
          throw new AppError(exists ? 'OUT_OF_STOCK' : 'PRODUCT_NOT_FOUND', { product_id: pid });
        }
        lines.push({ product: rows[0], qty });
        subtotal += toPaise(rows[0].price) * qty;
      }
      const plan = member_id ? await members.effectivePlan(tx, member_id) : null;
      const discount = plan ? percentOf(subtotal, Number(plan.shop_discount_percent)) : 0;
      let delivery = 0;
      if (body.fulfillment === ORDER_FULFILLMENT.DELIVERY) {
        const free = toPaise(await SettingsService.get<string>('free_delivery_above'));
        delivery = subtotal - discount >= free ? 0 : toPaise(await SettingsService.get<string>('delivery_fee'));
      }
      const inStore = body.fulfillment === ORDER_FULFILLMENT.IN_STORE;
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO shop_orders (fulfillment, status, member_id, guest_name, guest_phone, delivery_address, discount_amount, delivery_fee)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [body.fulfillment, inStore ? 'COMPLETED' : 'PLACED', member_id, member_id ? null : body.guest_name, member_id ? null : (body.guest_phone ?? null), body.fulfillment === 'DELIVERY' ? body.delivery_address : null, fromPaise(discount), fromPaise(delivery)],
      );
      const id = rows[0]!.id;
      for (const l of lines) {
        await tx.query('INSERT INTO shop_order_items (shop_order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, $5)', [id, l.product.id, l.product.name, l.product.price, l.qty]);
      }
      if (method) await recordPayment(tx, { source_type: 'SHOP_ORDER', source_id: id, method, received_by_user_id: staff ? user.id : null });
      return id;
    });
    return (await orderDetail(pool, id))!;
  },

  async orderList(user: AuthUser, q: { status?: string; fulfillment?: string; member_id?: string; from?: string; to?: string; page: number; page_size: number }) {
    const c: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      c.push(sql.replace('?', `$${params.length}`));
    };
    if (q.status) add('o.status = ?', q.status);
    if (q.fulfillment) add('o.fulfillment = ?', q.fulfillment);
    if (q.from) add(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ?`, q.from);
    if (q.to) add(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ?`, q.to);
    if (user.role === USER_ROLE.MEMBER) add('o.member_id = ?', user.member_id ?? NOBODY);
    else if (q.member_id) add('o.member_id = ?', q.member_id);
    const where = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM shop_orders o ${where}`, params)).rows[0]!.n;
    const { rows } = await query<Omit<ShopOrderDetail, 'items'>>(`${ORDER_SELECT} ${where} ORDER BY o.created_at DESC, o.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.page_size, offsetOf(q)]);
    return { rows: await attachItems(pool, rows), total };
  },

  async orderGet(user: AuthUser, id: string): Promise<ShopOrderDetail> {
    const o = await orderDetail(pool, id);
    if (!o || (user.role === USER_ROLE.MEMBER && o.member_id !== user.member_id)) throw new AppError('ORDER_NOT_FOUND');
    return o;
  },

  /** R-SHOP-07: only transitions in SHOP_ORDER_TRANSITIONS, and pickup / delivery states only for their fulfilment. */
  async orderStatus(id: string, to: ShopOrderStatus): Promise<ShopOrderDetail> {
    await withTransaction(async (tx) => {
      const cur = (await tx.query<{ status: ShopOrderStatus; fulfillment: string }>('SELECT status, fulfillment FROM shop_orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw new AppError('ORDER_NOT_FOUND');
      if (to === 'CANCELLED') return cancelInTx(tx, id, cur.status);
      const wrongKind = (to === 'READY_FOR_PICKUP' && cur.fulfillment !== 'PICKUP') || (to === 'OUT_FOR_DELIVERY' && cur.fulfillment !== 'DELIVERY');
      if (wrongKind || !SHOP_ORDER_TRANSITIONS[cur.status].includes(to)) throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to });
      await tx.query('UPDATE shop_orders SET status = $2 WHERE id = $1', [id, to]);
    });
    return (await orderDetail(pool, id))!;
  },

  /** R-SHOP-08: member only while PLACED, staff until COMPLETED; stock returns, payment is refunded in full. */
  async orderCancel(user: AuthUser, id: string): Promise<ShopOrderDetail> {
    await withTransaction(async (tx) => {
      const cur = (await tx.query<{ status: ShopOrderStatus; member_id: string | null }>('SELECT status, member_id FROM shop_orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur || (user.role === USER_ROLE.MEMBER && cur.member_id !== user.member_id)) throw new AppError('ORDER_NOT_FOUND');
      if (user.role === USER_ROLE.MEMBER && cur.status !== 'PLACED') throw new AppError('INVALID_STATUS_TRANSITION', { from: cur.status, to: 'CANCELLED' });
      await cancelInTx(tx, id, cur.status);
    });
    return (await orderDetail(pool, id))!;
  },

  // ---- inventory
  async inventory(q: { category?: string; low_stock_only?: boolean; q?: string }): Promise<InventoryItem[]> {
    const c = ['is_active'];
    const params: unknown[] = [];
    if (q.category) {
      params.push(q.category);
      c.push(`category = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
      c.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length})`);
    }
    if (q.low_stock_only) c.push('stock_quantity <= low_stock_threshold');
    const rows = (await query<Product>(`SELECT * FROM products WHERE ${c.join(' AND ')} ORDER BY stock_quantity, name`, params)).rows;
    return rows.map((p) => ({ product_id: p.id, sku: p.sku, name: p.name, category: p.category, stock_quantity: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, stock_status: stockStatus(p), is_active: p.is_active }));
  },

  async adjust(product_id: string, change: number): Promise<InventoryItem> {
    const { rows } = await query<Product>('UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1 AND stock_quantity + $2 >= 0 RETURNING *', [product_id, change]);
    if (!rows[0]) {
      const exists = (await query('SELECT 1 FROM products WHERE id = $1', [product_id])).rowCount;
      throw exists ? new AppError('VALIDATION_ERROR', { fields: { quantity_change: 'Stock cannot go below zero.' } }) : new AppError('PRODUCT_NOT_FOUND');
    }
    const p = rows[0];
    return { product_id: p.id, sku: p.sku, name: p.name, category: p.category, stock_quantity: p.stock_quantity, low_stock_threshold: p.low_stock_threshold, stock_status: stockStatus(p), is_active: p.is_active };
  },
};

async function cancelInTx(tx: Tx, id: string, from: ShopOrderStatus): Promise<void> {
  if (!SHOP_ORDER_TRANSITIONS[from].includes('CANCELLED')) throw new AppError('INVALID_STATUS_TRANSITION', { from, to: 'CANCELLED' });
  await tx.query('UPDATE shop_orders SET status = $2 WHERE id = $1', [id, 'CANCELLED']);
  await tx.query('UPDATE products p SET stock_quantity = p.stock_quantity + i.quantity FROM shop_order_items i WHERE i.shop_order_id = $1 AND i.product_id = p.id', [id]);
  const pays = (await tx.query<{ id: string; amount: string; refunded_amount: string }>(`SELECT id, amount, refunded_amount FROM payments WHERE source_type = 'SHOP_ORDER' AND source_id = $1`, [id])).rows;
  for (const p of pays) {
    const left = toPaise(p.amount) - toPaise(p.refunded_amount);
    if (left > 0) await refundInTx(tx, p.id, fromPaise(left), 'Order cancelled');
  }
}
