import { getBusinessDashboard, PREVIEW_BUSINESS_CLIENT_ID } from '@/api/dashboards';
import { formatDateIst, formatMoney } from '@/lib/format';
import { Badge, DashboardShell, EmptyState, ErrorState, Loading, Panel, Stat, useLoad } from '../components/DashboardShell';
import { INVOICE_STATUS_LABEL } from '../status';

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
];

const sum = (xs: string[]) => xs.reduce((n, x) => n + parseFloat(x), 0);

export default function BusinessDashboard() {
  const state = useLoad(() => getBusinessDashboard(PREVIEW_BUSINESS_CLIENT_ID));
  const d = state.data;
  const live = d?.invoices.filter((i) => i.status !== 'VOID') ?? [];
  const invoiced = sum(live.map((i) => i.total_amount));
  const paid = sum(live.map((i) => i.amount_paid));
  const outstanding = sum(live.map((i) => i.outstanding));
  const overdue = live.filter((i) => i.status === 'OVERDUE');

  return (
    <DashboardShell role="BUSINESS_CLIENT" title={d ? d.company_name : 'Your account.'} intro="Invoices from Meridian Bay, what’s been paid and what’s still due." sections={SECTIONS} previewOf="Showing the fictional company TechNova Solutions.">
      {state.loading && <Loading label="Loading your account" />}
      {state.error && <ErrorState message={state.error} />}
      {!state.loading && !state.error && !d && <EmptyState>No business account is linked to this login.</EmptyState>}

      {d && (
        <div className="grid gap-6">
          <section id="summary" aria-label="Summary" className="grid scroll-mt-40 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Invoiced" value={formatMoney(invoiced)} note={`${live.length} invoices`} />
            <Stat label="Paid" value={formatMoney(paid)} />
            <Stat label="Outstanding" value={formatMoney(outstanding)} note={overdue.length ? `${overdue.length} overdue` : 'Nothing overdue'} />
            <Stat label="Average invoice" value={live.length ? formatMoney(invoiced / live.length) : '—'} />
          </section>

          <Panel id="invoices" title="Invoices">
            {live.length ? (
              <ul className="divide-y divide-line">
                {d.invoices.map((i) => {
                  const s = INVOICE_STATUS_LABEL[i.status];
                  return (
                    <li key={i.id}>
                      <details className="group py-1">
                        <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 py-2 [&::-webkit-details-marker]:hidden">
                          <span>
                            <span className="block font-semibold">{i.invoice_number}</span>
                            <span className="text-sm text-muted">
                              Issued {formatDateIst(i.issue_date)} · due {formatDateIst(i.due_date)}
                            </span>
                          </span>
                          <span className="text-right">
                            <Badge tone={s.tone}>{s.label}</Badge>
                            <span className="mt-1 block text-sm tabular-nums">{formatMoney(i.total_amount)}</span>
                          </span>
                        </summary>
                        <div className="pb-4">
                          <table className="w-full text-left text-sm">
                            <caption className="sr-only">Line items for {i.invoice_number}</caption>
                            <tbody>
                              {i.items.map((x) => (
                                <tr key={x.id} className="border-t border-line">
                                  <td className="py-2 pr-4">{x.description}</td>
                                  <td className="py-2 pr-4 text-right text-muted tabular-nums">
                                    {x.quantity} × {formatMoney(x.unit_price)}
                                  </td>
                                  <td className="py-2 text-right tabular-nums">{formatMoney(x.line_total)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-line text-muted">
                                <td className="py-2 pr-4" colSpan={2}>
                                  GST {parseFloat(i.tax_rate)}%
                                </td>
                                <td className="py-2 text-right tabular-nums">{formatMoney(i.tax_amount)}</td>
                              </tr>
                              <tr className="border-t border-line font-semibold">
                                <td className="py-2 pr-4" colSpan={2}>
                                  Still due
                                </td>
                                <td className="py-2 text-right tabular-nums">{formatMoney(i.outstanding)}</td>
                              </tr>
                            </tbody>
                          </table>
                          {parseFloat(i.outstanding) > 0 && (
                            <button type="button" disabled className="mt-4 inline-flex min-h-11 cursor-not-allowed items-center rounded-full border border-ink/20 px-5 text-sm font-semibold text-muted">
                              Pay online
                            </button>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No invoices yet.</EmptyState>
            )}
            <p className="mt-4 text-xs text-muted">Online payment needs the payments API and is disabled in this preview.</p>
          </Panel>

          <Panel id="payments" title="Payment history">
            {d.payments.length ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/20 text-xs tracking-[0.12em] text-muted uppercase">
                      <th scope="col" className="py-2 pr-4 font-semibold">Receipt</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Date</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Method</th>
                      <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.payments.map((p) => (
                      <tr key={p.id} className="border-b border-line">
                        <td className="py-3 pr-4 font-semibold">{p.payment_number}</td>
                        <td className="py-3 pr-4 text-muted">{formatDateIst(p.paid_at)}</td>
                        <td className="py-3 pr-4">{p.method === 'UPI' ? 'UPI' : p.method.charAt(0) + p.method.slice(1).toLowerCase()}</td>
                        <td className="py-3 text-right tabular-nums">{formatMoney(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>No payments recorded yet.</EmptyState>
            )}
          </Panel>

          <p className="text-sm text-muted">
            In this project a business client is a company the club invoices (corporate days, regular bookings). Stock, deliveries, stock losses and dealer records aren’t part of this account, so they aren’t shown.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
