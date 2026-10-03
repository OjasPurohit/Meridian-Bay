import type { OrderFulfillment, OrderStatus, ShopOrderStatus } from '@shared/constants/enums';
import type { DInvoice } from './store/types';

type Tone = 'green' | 'sun' | 'rust' | 'muted';

/** Customer-facing words for bar_orders.status (the kitchen lifecycle). */
export const KITCHEN_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  NEW: { label: 'Received', tone: 'sun' },
  PREPARING: { label: 'Preparing', tone: 'sun' },
  READY: { label: 'Ready', tone: 'green' },
  SERVED: { label: 'Served', tone: 'muted' },
  CANCELLED: { label: 'Cancelled', tone: 'rust' },
};

export const KITCHEN_FLOW: OrderStatus[] = ['NEW', 'PREPARING', 'READY', 'SERVED'];

export const SHOP_STATUS: Record<ShopOrderStatus, { label: string; tone: Tone }> = {
  PLACED: { label: 'Placed', tone: 'sun' },
  CONFIRMED: { label: 'Confirmed', tone: 'sun' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', tone: 'green' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'green' },
  COMPLETED: { label: 'Completed', tone: 'muted' },
  CANCELLED: { label: 'Cancelled', tone: 'rust' },
};

/** Shop order lifecycle per fulfilment (placed → ready / out for delivery → completed). */
export function shopFlow(f: OrderFulfillment): ShopOrderStatus[] {
  if (f === 'DELIVERY') return ['PLACED', 'CONFIRMED', 'OUT_FOR_DELIVERY', 'COMPLETED'];
  if (f === 'PICKUP') return ['PLACED', 'CONFIRMED', 'READY_FOR_PICKUP', 'COMPLETED'];
  return ['PLACED', 'COMPLETED'];
}

export const BOOKING_STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pending', tone: 'sun' },
  CONFIRMED: { label: 'Confirmed', tone: 'green' },
  COMPLETED: { label: 'Played', tone: 'muted' },
  CANCELLED: { label: 'Cancelled', tone: 'rust' },
};

/** UI status of an invoice: the stored lifecycle (DRAFT, SENT, VOID) plus the derived payment state. */
export const INVOICE_STATUS_LABEL: Record<DInvoice['status'], { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'muted' },
  SENT: { label: 'Due', tone: 'sun' },
  PARTIALLY_PAID: { label: 'Part paid', tone: 'sun' },
  PAID: { label: 'Paid', tone: 'green' },
  OVERDUE: { label: 'Overdue', tone: 'rust' },
  VOID: { label: 'Void', tone: 'muted' },
};
