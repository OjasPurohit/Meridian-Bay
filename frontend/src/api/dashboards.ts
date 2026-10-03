/**
 * Member order tracking. Preview mode reads mock-data (derived the way the SQL views derive it, see
 * features/dashboards/store/derive.ts); with a backend configured it asks GET /shop/orders/:id, which only
 * returns the caller's own orders.
 */
import type { OrderFulfillment, ShopOrderStatus } from '@shared/constants/enums';
import type { ShopOrderDetail } from '@shared/types/api';
import { mockRows } from '@/features/dashboards/store/derive';
import { apiRequest, isBackendConfigured } from './client';

/** Fictional seed identity used for the member preview. */
export const PREVIEW_MEMBER_ID = '02000000-0000-4000-8000-000000000001';

export interface MemberShopOrderDetail {
  id: string;
  order_number: string;
  status: ShopOrderStatus;
  fulfillment: OrderFulfillment;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  delivery_address: string | null;
  discount_amount: string;
  delivery_fee: string;
  subtotal: string;
  total_amount: string;
  tax_amount: string;
  items: { id: string; product_name: string; unit_price: string; quantity: number; line_total: string }[];
}

const GST_PERCENT = 18;
const money = (x: number) => (Math.round(x * 100) / 100).toFixed(2);

function present(o: ShopOrderDetail): MemberShopOrderDetail {
  const total = parseFloat(o.total_amount);
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    fulfillment: o.fulfillment,
    created_at: o.created_at,
    completed_at: o.status === 'COMPLETED' ? o.updated_at : null,
    cancelled_at: o.status === 'CANCELLED' ? o.updated_at : null,
    cancellation_reason: null,
    delivery_address: o.delivery_address,
    discount_amount: o.discount_amount,
    delivery_fee: o.delivery_fee,
    subtotal: o.subtotal,
    total_amount: o.total_amount,
    tax_amount: money((total * GST_PERCENT) / (100 + GST_PERCENT)),
    items: o.items.map((i) => ({ id: i.id, product_name: i.product_name, unit_price: i.unit_price, quantity: i.quantity, line_total: money(parseFloat(i.unit_price) * i.quantity) })),
  };
}

/** Ownership check: null unless the order belongs to this member. */
export async function getMemberShopOrder(memberId: string, orderId: string): Promise<MemberShopOrderDetail | null> {
  if (isBackendConfigured) {
    try {
      return present(await apiRequest<ShopOrderDetail>('GET', `/shop/orders/${orderId}`));
    } catch {
      return null;
    }
  }
  const o = mockRows().shopOrders.find((x) => x.id === orderId && x.member_id === memberId);
  return o ? present(o as unknown as ShopOrderDetail) : null;
}
