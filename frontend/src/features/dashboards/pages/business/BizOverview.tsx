import { useMemo, useState } from 'react';
import { Banknote, Percent, Receipt, ShoppingCart, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

import { formatRupees } from '@/lib/format';
import { useDemoIdentity } from '../../layout/useIdentity';
import { useDemo } from '../../store/demoStore';
import { bizBuckets, bizWindow, type BizGrain } from '../../store/bizSelectors';
import { delta } from '../../store/selectors';
import { AreaChart, C, Donut, HBars, Legend, rupeeCompact } from '../../ui/charts';
import { Card, DataTable, Kpi, PageHeader, PageSkeleton, Pill, Section, Segmented, usePageReady, type Column } from '../../ui/kit';
import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import type { BizTx } from '../../store/types';

const TYPE_TONE = { SALE: 'green', PURCHASE: 'sun', EXPENSE: 'rust' } as const;

export function BizTxTable({ rows, limit }: { rows: BizTx[]; limit?: number }) {
  const cols: Column<BizTx>[] = [
    { key: 'ref', header: 'Ref', hide: 'lg', cell: (t) => <span className="font-mono text-xs text-muted">{t.ref}</span> },
    { key: 'd', header: 'Date', hide: 'sm', cell: (t) => <span className="text-muted">{formatDateIst(t.at).replace(/, \d{4}$/, '')} {formatClockIst(t.at)}</span> },
    { key: 'p', header: 'Party / description', cell: (t) => <div><p className="font-semibold">{t.party}</p><p className="text-xs text-muted">{t.description}</p></div> },
    { key: 't', header: 'Type', cell: (t) => <Pill tone={TYPE_TONE[t.type]}>{t.type.toLowerCase()}</Pill> },
    { key: 's', header: 'Status', hide: 'md', cell: (t) => <Pill tone={t.status === 'PAID' ? 'green' : 'sun'}>{t.status.toLowerCase()}</Pill> },
    { key: 'a', header: 'Amount', align: 'right', cell: (t) => <span className={t.type === 'SALE' ? 'font-semibold text-olive' : 'font-semibold'}>{t.type === 'SALE' ? '+' : '−'} {formatMoney(t.amount).replace(/\.00$/, '')}</span> },
  ];
  return <DataTable columns={cols} rows={limit ? rows.slice(0, limit) : rows} rowKey={(t) => t.id} dense />;
}

export default function BizOverview() {
  const ready = usePageReady();
  const s = useDemo();
  const { client } = useDemoIdentity('BUSINESS_CLIENT');
  const [grain, setGrain] = useState<BizGrain>('MONTH');
  const cur = useMemo(() => bizWindow(s.bizTx, 30), [s.bizTx]);
  const prev = useMemo(() => bizWindow(s.bizTx, 30, 30), [s.bizTx]);
  const series = useMemo(() => bizBuckets(s.bizTx, grain), [s.bizTx, grain]);
  const spark = useMemo(() => bizBuckets(s.bizTx, 'WEEK'), [s.bizTx]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of cur.rows) if (t.type === 'SALE') m.set(t.party, (m.get(t.party) ?? 0) + t.amount);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));
  }, [cur.rows]);
  const spend = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of cur.rows) if (t.type !== 'SALE') m.set(t.type === 'PURCHASE' ? 'Stock purchases' : t.description, (m.get(t.type === 'PURCHASE' ? 'Stock purchases' : t.description) ?? 0) + t.amount);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value], i) => ({ label, value, color: [C.olive, C.terracotta, C.sun, C.moss, C.sky][i] }));
  }, [cur.rows]);

  if (!ready) return <PageSkeleton rows={2} />;
  const margin = cur.revenue ? (cur.profit / cur.revenue) * 100 : 0;
  const aov = cur.sales ? cur.revenue / cur.sales : 0;

  return (
    <>
      <PageHeader eyebrow={client?.company_name ?? 'Business'} title="Business overview">
        <Pill tone="muted">Last 30 days vs previous 30</Pill>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Wallet} label="Revenue" value={cur.revenue} format={(n) => formatRupees(Math.round(n))} delta={delta(cur.revenue, prev.revenue)} spark={spark.revenue} delay={0} />
        <Kpi icon={ShoppingCart} label="Sales" value={cur.sales} delta={delta(cur.sales, prev.sales)} note="orders" spark={spark.sales} delay={70} />
        <Kpi icon={Receipt} label="Expenses" value={cur.outgo} format={(n) => formatRupees(Math.round(n))} delta={delta(cur.outgo, prev.outgo)} goodWhen="down" note="purchases + costs" spark={spark.outgo} delay={140} />
        <Kpi tone={cur.profit >= 0 ? 'sun' : 'rust'} icon={cur.profit >= 0 ? TrendingUp : TrendingDown} label={cur.profit >= 0 ? 'Profit' : 'Loss'} value={Math.abs(cur.profit)} format={(n) => formatRupees(Math.round(n))} delta={delta(cur.profit, prev.profit)} spark={spark.profit} delay={210} />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi icon={Percent} label="Profit margin" value={margin} format={(n) => `${n.toFixed(1)}%`} note="of revenue" delay={0} />
        <Kpi icon={Banknote} label="Avg. order value" value={aov} format={(n) => formatRupees(Math.round(n))} delay={70} />
        <Kpi icon={Wallet} label="Receivables" value={cur.receivable} format={(n) => formatRupees(Math.round(n))} note="sales awaiting payment" delay={140} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Section eyebrow="Trend" title="Revenue vs expenses" action={<Segmented size="sm" value={grain} onChange={setGrain} options={[{ value: 'WEEK', label: 'Weekly' }, { value: 'MONTH', label: 'Monthly' }]} />}>
          <Legend items={[{ name: 'Revenue', color: C.olive }, { name: 'Expenses', color: C.terracotta }]} />
          <div className="mt-3"><AreaChart key={grain} labels={series.labels} fmt={rupeeCompact} series={[{ name: 'Revenue', color: C.olive, data: series.revenue }, { name: 'Expenses', color: C.terracotta, data: series.outgo }]} /></div>
        </Section>
        <Section eyebrow="Where it goes" title="Spend breakdown" delay={80}>{spend.length ? <Donut slices={spend} fmt={(n) => formatRupees(Math.round(n))} sub="spent · 30 days" /> : <p className="text-sm text-muted">No spend recorded.</p>}</Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Section eyebrow="Profit & loss" title={grain === 'MONTH' ? 'Monthly result' : 'Weekly result'} delay={100}>
          <AreaChart key={`p-${grain}`} labels={series.labels} series={[{ name: 'Profit / loss', color: C.sun, data: series.profit }]} height={230} />
          <p className="mt-2 text-xs text-muted">Revenue − purchases − operating expenses.</p>
        </Section>
        <Section eyebrow="Customers" title="Top customers · 30 days" delay={140}>
          <HBars rows={byCustomer} fmt={(n) => formatRupees(Math.round(n))} />
        </Section>
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow text-olive-mid">Latest</p><h2 className="display text-2xl">Recent transactions</h2></div></div>
        <BizTxTable rows={s.bizTx} limit={9} />
      </Card>
    </>
  );
}
