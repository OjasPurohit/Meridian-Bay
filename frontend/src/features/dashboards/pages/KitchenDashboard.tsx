import type { OrderStatus } from '@shared/constants/enums';
import { getKitchenTickets, PREVIEW_NOW, type KitchenTicket } from '@/api/dashboards';
import { formatClockIst, formatDateIst } from '@/lib/format';
import { Badge, DashboardShell, EmptyState, ErrorState, Loading, Panel, useLoad } from '../components/DashboardShell';
import { KITCHEN_FLOW, KITCHEN_STATUS } from '../status';

const SECTIONS = [
  { id: 'board', label: 'Live board' },
  { id: 'history', label: 'History' },
];

const BOARD: OrderStatus[] = ['NEW', 'ACCEPTED', 'PREPARING', 'READY'];

function minutesAgo(iso: string) {
  const m = Math.round((PREVIEW_NOW.getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(0, m)} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return formatDateIst(iso);
}

function Ticket({ t }: { t: KitchenTicket }) {
  const next = KITCHEN_FLOW[KITCHEN_FLOW.indexOf(t.status) + 1];
  return (
    <li className="border border-line bg-sand p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">{t.order_number}</p>
        <p className="text-xs text-muted">{minutesAgo(t.created_at)}</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {t.table ?? 'Counter'}
        {t.tab_number ? ` · Tab ${t.tab_number}` : ''} · {t.customer}
      </p>
      <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        {t.items.map((i, n) => (
          <li key={n}>
            <span className="font-semibold tabular-nums">{i.quantity} ×</span> {i.name}
            {i.notes && <span className="block text-xs text-primary">{i.notes}</span>}
          </li>
        ))}
      </ul>
      {t.notes && <p className="mt-2 text-xs text-primary">Note: {t.notes}</p>}
      {next && (
        <button type="button" disabled className="mt-4 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-ink/20 px-4 text-sm font-semibold text-muted">
          Mark {KITCHEN_STATUS[next].label.toLowerCase()}
        </button>
      )}
    </li>
  );
}

export default function KitchenDashboard() {
  const state = useLoad(getKitchenTickets);
  const tickets = state.data ?? [];
  const history = tickets.filter((t) => t.status === 'SERVED' || t.status === 'CANCELLED');

  return (
    <DashboardShell role="KITCHEN_MANAGER" title="The kitchen board." intro="Incoming bar & café orders, what’s on each, and where it is in the line." sections={SECTIONS} previewOf="Kitchen view only — no prices, payments or staff data.">
      {state.loading && <Loading label="Loading orders" />}
      {state.error && <ErrorState message={state.error} />}
      {!state.loading && !state.error && (
        <div className="grid gap-6">
          <Panel id="board" title="Live board" action={<p className="text-xs text-muted">Status updates need the kitchen API; buttons are disabled in this preview.</p>}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {BOARD.map((s) => {
                const col = tickets.filter((t) => t.status === s);
                return (
                  <section key={s} aria-labelledby={`col-${s}`}>
                    <h3 id={`col-${s}`} className="flex items-center justify-between border-b border-line pb-2">
                      <span className="eyebrow text-olive-mid">{KITCHEN_STATUS[s].label}</span>
                      <Badge tone={KITCHEN_STATUS[s].tone}>{col.length}</Badge>
                    </h3>
                    {col.length ? (
                      <ul className="mt-3 space-y-3">
                        {col.map((t) => (
                          <Ticket key={t.id} t={t} />
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-muted">Nothing here.</p>
                    )}
                  </section>
                );
              })}
            </div>
          </Panel>

          <Panel id="history" title="Order history">
            {history.length ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/20 text-xs tracking-[0.12em] text-muted uppercase">
                      <th scope="col" className="py-2 pr-4 font-semibold">Order</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Placed</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Table</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Items</th>
                      <th scope="col" className="py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((t) => (
                      <tr key={t.id} className="border-b border-line">
                        <td className="py-3 pr-4 font-semibold">{t.order_number}</td>
                        <td className="py-3 pr-4 text-muted">
                          {formatDateIst(t.created_at)} {formatClockIst(t.created_at)}
                        </td>
                        <td className="py-3 pr-4">{t.table ?? 'Counter'}</td>
                        <td className="py-3 pr-4">{t.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</td>
                        <td className="py-3">
                          <Badge tone={KITCHEN_STATUS[t.status].tone}>{KITCHEN_STATUS[t.status].label}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>No finished orders yet.</EmptyState>
            )}
            <p className="mt-4 text-xs text-muted">Bills stay with the front desk, and the project has no ingredient or recipe records, so neither appears here. Demo orders use the seed menu.</p>
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}
