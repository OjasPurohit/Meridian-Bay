import type { RevenueCategory } from '@shared/constants/enums';
import { getOwnerOverview } from '@/api/dashboards';
import { formatMoney } from '@/lib/format';
import { Badge, DashboardShell, EmptyState, ErrorState, Loading, Panel, Stat, useLoad } from '../components/DashboardShell';
import { KITCHEN_STATUS, SHOP_STATUS } from '../status';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'members', label: 'Members' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'orders', label: 'Orders' },
  { id: 'finance', label: 'Revenue & invoices' },
];

const STREAM: Record<RevenueCategory, string> = { COURT: 'Courts', MEMBERSHIP: 'Memberships', SHOP: 'Shop', BAR: 'Bar & café', BUSINESS: 'Business invoices' };

export default function OwnerDashboard() {
  const state = useLoad(getOwnerOverview);
  const d = state.data;
  const active = d?.active_by_plan.reduce((n, p) => n + p.count, 0) ?? 0;
  const revenue = d?.revenue_month.reduce((n, r) => n + parseFloat(r.amount), 0) ?? 0;

  return (
    <DashboardShell role="OWNER_ADMIN" title="How the club is doing." intro="Members, stock, orders and money across every part of Meridian Bay." sections={SECTIONS} previewOf="Totals only — no member names or contact details.">
      {state.loading && <Loading label="Loading overview" />}
      {state.error && <ErrorState message={state.error} />}
      {d && (
        <div className="grid gap-6">
          <section id="overview" aria-label="Overview" className="grid scroll-mt-40 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Members" value={d.members_total} note={`${active} with an active plan`} />
            <Stat label="Renewals due" value={d.expiring_30d} note="Plans ending in the next 30 days" />
            <Stat label="Open kitchen orders" value={d.kitchen_open} />
            <Stat label="Outstanding invoices" value={formatMoney(d.invoices_outstanding)} note={d.invoices_overdue ? `${d.invoices_overdue} overdue` : 'Nothing overdue'} />
          </section>

          <div className="grid gap-6 lg:grid-cols-12">
            <Panel id="members" title="Members by plan" className="lg:col-span-5">
              <ul className="divide-y divide-line">
                {d.active_by_plan.map((p) => (
                  <li key={p.plan} className="flex items-baseline justify-between py-3">
                    <span className="display text-xl">{p.plan}</span>
                    <span className="font-semibold tabular-nums">{p.count}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between py-3 text-muted">
                  <span>No active plan</span>
                  <span className="font-semibold tabular-nums">{d.members_without_plan}</span>
                </li>
              </ul>
            </Panel>

            <Panel id="inventory" title="Low stock" className="lg:col-span-7" action={<Badge tone={d.low_stock.length ? 'rust' : 'green'}>{`${d.low_stock.length} of ${d.products_total} products`}</Badge>}>
              {d.low_stock.length ? (
                <ul className="divide-y divide-line">
                  {d.low_stock.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-sm tabular-nums">
                        {p.stock_quantity === 0 ? <Badge tone="rust">Out of stock</Badge> : `${p.stock_quantity} left`}
                        <span className="ml-2 text-muted">reorder at {p.low_stock_threshold}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>Everything is above its reorder level.</EmptyState>
              )}
            </Panel>
          </div>

          <div id="orders" className="grid scroll-mt-40 gap-6 lg:grid-cols-2">
            <Panel title="Shop orders">
              <ul className="divide-y divide-line">
                {d.shop_orders_by_status.map((s) => (
                  <li key={s.status} className="flex items-center justify-between py-3">
                    <Badge tone={SHOP_STATUS[s.status].tone}>{SHOP_STATUS[s.status].label}</Badge>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Kitchen orders">
              <ul className="divide-y divide-line">
                {d.kitchen_by_status.map((s) => (
                  <li key={s.status} className="flex items-center justify-between py-3">
                    <Badge tone={KITCHEN_STATUS[s.status].tone}>{KITCHEN_STATUS[s.status].label}</Badge>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel id="finance" title="Revenue this month" action={<span className="display text-2xl tabular-nums">{formatMoney(revenue)}</span>}>
            {d.revenue_month.length ? (
              <ul className="divide-y divide-line">
                {[...d.revenue_month]
                  .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
                  .map((r) => {
                    const share = revenue ? (parseFloat(r.amount) / revenue) * 100 : 0;
                    return (
                      <li key={r.category} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span>{STREAM[r.category]}</span>
                          <span className="font-semibold tabular-nums">{formatMoney(r.amount)}</span>
                        </div>
                        <div className="mt-2 h-1.5 bg-line" aria-hidden="true">
                          <div className="h-full bg-olive" style={{ width: `${share}%` }} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <EmptyState>No payments recorded this month yet.</EmptyState>
            )}
            <p className="mt-4 text-xs text-muted">Successful payments less refunds, by revenue stream (IST calendar month).</p>
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}
