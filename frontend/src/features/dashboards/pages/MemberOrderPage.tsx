import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';

import { getMemberShopOrder, PREVIEW_MEMBER_ID } from '@/api/dashboards';
import { ActionLink } from '@/components/ui/button';
import { formatDateIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, DashboardShell, EmptyState, ErrorState, Loading, Panel, useLoad } from '../components/DashboardShell';
import { SHOP_STATUS, shopFlow } from '../status';

export default function MemberOrderPage() {
  const { orderId = '' } = useParams();
  const state = useLoad(() => getMemberShopOrder(PREVIEW_MEMBER_ID, orderId), [orderId]);
  const o = state.data;
  const flow = o ? shopFlow(o.fulfillment) : [];
  const reached = o ? flow.indexOf(o.status) : -1;

  return (
    <DashboardShell role="MEMBER" title={o ? `Order ${o.order_number}` : 'Track an order'} intro="Where your gear order is right now." previewOf="Showing an order of the fictional member Aarav Kapoor.">
      <ActionLink to="/member#shop-orders" variant="text" className="mb-6 text-sm">
        Back to my dashboard
      </ActionLink>
      {state.loading && <Loading label="Loading order" />}
      {state.error && <ErrorState message={state.error} />}
      {!state.loading && !state.error && !o && <EmptyState>This order isn’t on your account.</EmptyState>}

      {o && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Panel title="Status" className="lg:col-span-5" action={<Badge tone={SHOP_STATUS[o.status].tone}>{SHOP_STATUS[o.status].label}</Badge>}>
            {o.status === 'CANCELLED' ? (
              <p className="text-muted">
                This order was cancelled{o.cancelled_at ? ` on ${formatDateIst(o.cancelled_at)}` : ''}.{o.cancellation_reason ? ` Reason: ${o.cancellation_reason}` : ''}
              </p>
            ) : (
              <ol className="space-y-0">
                {flow.map((s, i) => {
                  const done = i <= reached;
                  return (
                    <li key={s} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < flow.length - 1 && <span className={cn('absolute top-8 left-[0.9rem] h-[calc(100%-2rem)] w-px', i < reached ? 'bg-olive' : 'bg-line')} aria-hidden="true" />}
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border', done ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk text-muted')} aria-hidden="true">
                        {done ? <Check className="size-4" /> : <span className="text-xs">{i + 1}</span>}
                      </span>
                      <div className="pt-0.5">
                        <p className={cn('font-semibold', !done && 'text-muted')}>{SHOP_STATUS[s].label}</p>
                        <p className="text-xs text-muted">
                          {i === 0 && formatDateIst(o.created_at)}
                          {s === 'COMPLETED' && o.completed_at && formatDateIst(o.completed_at)}
                          {i === reached && s !== 'COMPLETED' && i !== 0 && 'Current step'}
                        </p>
                        <span className="sr-only">{done ? 'Done' : 'Not yet'}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {o.fulfillment === 'DELIVERY' && o.delivery_address && <p className="mt-6 border-t border-line pt-4 text-sm text-muted">Delivering to {o.delivery_address}</p>}
            {o.fulfillment === 'PICKUP' && <p className="mt-6 border-t border-line pt-4 text-sm text-muted">Collect from the front desk during court hours.</p>}
          </Panel>

          <Panel title="Items" className="lg:col-span-7">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[26rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/20 text-xs tracking-[0.12em] text-muted uppercase">
                    <th scope="col" className="py-2 pr-4 font-semibold">Item</th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">Qty</th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">Price</th>
                    <th scope="col" className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id} className="border-b border-line">
                      <td className="py-3 pr-4">{i.product_name}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{i.quantity}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatMoney(i.unit_price)}</td>
                      <td className="py-3 text-right tabular-nums">{formatMoney(i.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
              {[
                ['Subtotal', o.subtotal],
                ['Member discount', parseFloat(o.discount_amount) ? `-${o.discount_amount}` : null],
                ['Delivery', parseFloat(o.delivery_fee) ? o.delivery_fee : null],
              ]
                .filter((r): r is [string, string] => r[1] !== null)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular-nums">{v.startsWith('-') ? `−${formatMoney(v.slice(1))}` : formatMoney(v)}</dd>
                  </div>
                ))}
              <div className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(o.total_amount)}</dd>
              </div>
              <p className="pt-1 text-xs text-muted">Includes GST of {formatMoney(o.tax_amount)}.</p>
            </dl>
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}
