import { useState } from 'react';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';

import { istDate } from '@shared/lib/time';
import { formatClockIst, formatRupees } from '@/lib/format';
import { courtById, useDemo } from '../../store/demoStore';
import { downloadCsv, PERIOD_LABEL, PERIOD_DAYS, periodTotals, rowsBetween, type Period } from '../../store/selectors';
import { ALL_MEMBERS } from '../../store/staticData';
import { TaxesToReport } from '../../components/TaxesToReport';
import { btn, Card, PageHeader, PageSkeleton, Segmented, usePageReady, useToast } from '../../ui/kit';
import { DEMO_TODAY } from '../../store/types';
import { addDays } from '@shared/lib/time';

const rupee = (n: number) => formatRupees(Math.round(n));

export default function OwnerReports() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('MONTH');
  const { cur } = periodTotals(period);
  const from = addDays(DEMO_TODAY, -(PERIOD_DAYS[period] - 1));
  const rows = rowsBetween(from, DEMO_TODAY);
  if (!ready) return <PageSkeleton rows={2} />;

  const done = (name: string) => toast(`${name} downloaded`);
  const REPORTS = [
    { title: 'Revenue & profit/loss', body: 'Daily revenue by source, expenses and net result.', headline: `${rupee(cur.revenue)} revenue · ${rupee(cur.profit)} ${cur.profit >= 0 ? 'profit' : 'loss'}`, run: () => { downloadCsv(`revenue-${period.toLowerCase()}.csv`, ['Date', 'Courts', 'Memberships', 'Store', 'Kitchen & bar', 'Business', 'Revenue', 'Expenses', 'Profit'], rows.map((d) => [d.date, d.court, d.membership, d.shop, d.bar, d.business, d.court + d.membership + d.shop + d.bar + d.business, d.payroll + d.utilities + d.stock + d.maintenance + d.marketing, d.court + d.membership + d.shop + d.bar + d.business - (d.payroll + d.utilities + d.stock + d.maintenance + d.marketing)])); done('Revenue report'); } },
    { title: 'Members & memberships', body: 'Directory with plan, status, expiry and contact.', headline: `${ALL_MEMBERS.filter((m) => m.status === 'ACTIVE').length} active of ${ALL_MEMBERS.length} members`, run: () => { downloadCsv('members.csv', ['Member no.', 'Name', 'Plan', 'Status', 'Expires', 'Phone', 'Email', 'Joined'], ALL_MEMBERS.map((m) => [m.code, m.name, m.plan_name, m.status, m.end_date ?? '', m.phone, m.email, m.joined_on])); done('Members report'); } },
    { title: 'Court bookings', body: 'Every booking with customer, court, time, status and payment.', headline: `${s.bookings.filter((b) => b.status !== 'CANCELLED').length} live bookings in the schedule`, run: () => { downloadCsv('bookings.csv', ['Booking', 'Customer', 'Phone', 'Court', 'Date', 'Start', 'Status', 'Payment', 'Amount'], s.bookings.map((b) => [b.number, b.name, b.phone ?? '', courtById(b.court_id)?.name ?? '', istDate(b.start_at), formatClockIst(b.start_at), b.status, b.pay, b.amount_due])); done('Bookings report'); } },
    { title: 'Store sales', body: 'Orders with items, fulfilment, discount and total.', headline: `${s.shopOrders.length} orders · ${rupee(s.shopOrders.reduce((a, o) => a + o.total, 0))}`, run: () => { downloadCsv('store-orders.csv', ['Order', 'Date', 'Customer', 'Items', 'Fulfilment', 'Status', 'Discount', 'Total'], s.shopOrders.map((o) => [o.number, istDate(o.created_at), o.customer, o.lines.map((l) => `${l.qty}x ${l.name}`).join('; '), o.fulfillment, o.status, o.discount, o.total])); done('Store report'); } },
    { title: 'Kitchen & bar sales', body: 'Orders with table, items, discount and payment.', headline: `${s.kOrders.length} orders · ${rupee(s.kOrders.filter((o) => o.status !== 'CANCELLED').reduce((a, o) => a + o.total, 0))}`, run: () => { downloadCsv('kitchen-orders.csv', ['Order', 'Date', 'Customer', 'Table', 'Items', 'Status', 'Payment', 'Total'], s.kOrders.map((o) => [o.number, istDate(o.created_at), o.customer, o.table ?? '', o.lines.map((l) => `${l.qty}x ${l.name}`).join('; '), o.status, o.pay, o.total])); done('Kitchen report'); } },
    { title: 'Payments ledger & tax', body: 'All payments with method; GST collected per source.', headline: `${s.payments.length} payments · GST ≈ ${rupee(s.payments.reduce((a, p) => a + (p.category === 'BAR' ? (p.amount * 5) / 105 : (p.amount * 18) / 118), 0))}`, run: () => { downloadCsv('payments.csv', ['Payment', 'Date', 'Payer', 'Source', 'Method', 'Status', 'Amount', 'GST included'], s.payments.map((p) => [p.number, istDate(p.at), p.payer, p.category, p.method, p.status, p.amount, (p.category === 'BAR' ? (p.amount * 5) / 105 : (p.amount * 18) / 118).toFixed(2)])); done('Payments report'); } },
  ];

  return (
    <>
      <PageHeader eyebrow="Reports" title="Download the numbers">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'TODAY', label: 'Today' }, { value: 'WEEK', label: '7 days' }, { value: 'MONTH', label: '30 days' }]} />
      </PageHeader>
      <p className="-mt-3 mb-6 text-muted">Revenue report covers <span className="font-semibold text-ink">{PERIOD_LABEL[period].toLowerCase()}</span>. CSV files open in Excel or Google Sheets — ready to share with partners or your accountant.</p>
      <TaxesToReport />
      <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {REPORTS.map((r, i) => (
          <li key={r.title} style={{ ['--d' as string]: `${i * 55}ms` }} className="anim-rise">
            <Card lift className="flex h-full flex-col p-6">
              <span className="grid size-11 place-items-center rounded-full bg-olive/10 text-olive">{i % 2 ? <FileSpreadsheet className="size-5" /> : <BarChart3 className="size-5" />}</span>
              <p className="display mt-4 text-2xl">{r.title}</p>
              <p className="mt-1 text-sm text-muted">{r.body}</p>
              <p className="mt-4 text-sm font-semibold">{r.headline}</p>
              <button type="button" className={`${btn.primary} mt-auto w-full`} onClick={r.run}><Download className="size-4" /> Download CSV</button>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
