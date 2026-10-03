import { useMemo, useState } from 'react';

import { formatRupees } from '@/lib/format';
import { periodTotals } from '../../store/selectors';
import { bucket, membershipTrend, type Grain } from '../../store/staticData';
import { AreaChart, BarChart, C, Donut, HBars, Legend } from '../../ui/charts';
import { PageHeader, PageSkeleton, Section, Segmented, usePageReady } from '../../ui/kit';

const rupee = (n: number) => formatRupees(Math.round(n));
const GRAIN_LABEL: Record<Grain, string> = { DAY: 'Last 30 days', WEEK: 'Last 12 weeks', MONTH: 'Last 6 months' };

export default function OwnerAnalytics() {
  const ready = usePageReady();
  const [grain, setGrain] = useState<Grain>('WEEK');
  const b = useMemo(() => bucket(grain), [grain]);
  const trend = useMemo(() => membershipTrend(), []);
  const { cur } = periodTotals('MONTH');
  if (!ready) return <PageSkeleton rows={3} />;

  return (
    <>
      <PageHeader eyebrow="Analytics" title="Performance, in detail">
        <Segmented value={grain} onChange={setGrain} options={[{ value: 'DAY', label: 'Daily' }, { value: 'WEEK', label: 'Weekly' }, { value: 'MONTH', label: 'Monthly' }]} />
      </PageHeader>
      <p className="-mt-3 mb-6 text-sm text-muted">{GRAIN_LABEL[grain]} · hover any chart for exact figures.</p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section eyebrow="Revenue" title="Revenue by source" className="xl:col-span-2">
          <Legend items={[{ name: 'Courts', color: C.olive }, { name: 'Memberships', color: C.terracotta }, { name: 'Store', color: C.sun }, { name: 'Kitchen & bar', color: C.moss }, { name: 'Business', color: C.sky }]} />
          <div className="mt-3"><BarChart key={grain} stacked labels={b.labels} fmtFull={rupee} series={[{ name: 'Courts', color: C.olive, data: b.court }, { name: 'Memberships', color: C.terracotta, data: b.membership }, { name: 'Store', color: C.sun, data: b.shop }, { name: 'Kitchen & bar', color: C.moss, data: b.bar }, { name: 'Business', color: C.sky, data: b.business }]} height={280} /></div>
        </Section>

        <Section eyebrow="Profit & loss" title="Revenue vs expenses" delay={60}>
          <Legend items={[{ name: 'Revenue', color: C.olive }, { name: 'Expenses', color: C.terracotta }]} />
          <div className="mt-3"><AreaChart key={grain} labels={b.labels} fmtFull={rupee} series={[{ name: 'Revenue', color: C.olive, data: b.revenue }, { name: 'Expenses', color: C.terracotta, data: b.expenses }]} /></div>
        </Section>

        <Section eyebrow="Profit & loss" title="Net result" delay={120}>
          <AreaChart key={grain} labels={b.labels} fmtFull={rupee} series={[{ name: 'Profit / loss', color: C.sun, data: b.revenue.map((r, i) => r - b.expenses[i]) }]} />
          <p className="mt-2 text-xs text-muted">Payroll lands on the 1st of each month, so monthly bars dip early in the month.</p>
        </Section>

        <Section eyebrow="Courts" title="Booking activity" delay={60}>
          <Legend items={[{ name: 'Bookings', color: C.olive }, { name: 'Cancellations', color: C.terracotta }]} />
          <div className="mt-3"><BarChart key={grain} labels={b.labels} fmt={(n) => String(Math.round(n))} series={[{ name: 'Bookings', color: C.olive, data: b.bookings }, { name: 'Cancellations', color: C.terracotta, data: b.cancellations }]} /></div>
        </Section>

        <Section eyebrow="Members" title="Membership trend" delay={120}>
          <Legend items={[{ name: 'Gold', color: C.sun }, { name: 'Silver', color: C.moss }, { name: 'Junior', color: C.terracotta }, { name: 'All members', color: C.olive }]} />
          <div className="mt-3"><AreaChart labels={trend.months.map((m) => m.label)} fmt={(n) => String(Math.round(n))} fill={false} series={[{ name: 'All members', color: C.olive, data: trend.months.map((m) => m.total) }, { name: 'Gold', color: C.sun, data: trend.months.map((m) => m.gold) }, { name: 'Silver', color: C.moss, data: trend.months.map((m) => m.silver) }, { name: 'Junior', color: C.terracotta, data: trend.months.map((m) => m.junior) }]} /></div>
        </Section>

        <Section eyebrow="Store" title="Store sales" delay={60}>
          <AreaChart key={grain} labels={b.labels} fmtFull={rupee} series={[{ name: 'Store sales', color: C.sun, data: b.shop }]} height={220} />
        </Section>

        <Section eyebrow="Kitchen" title="Kitchen & bar sales" delay={120}>
          <AreaChart key={grain} labels={b.labels} fmtFull={rupee} series={[{ name: 'Kitchen & bar', color: C.moss, data: b.bar }]} height={220} />
        </Section>

        <Section eyebrow="Last 30 days" title="Revenue mix" delay={60}>
          <Donut slices={[{ label: 'Courts', value: cur.court, color: C.olive }, { label: 'Memberships', value: cur.membership, color: C.terracotta }, { label: 'Store', value: cur.shop, color: C.sun }, { label: 'Kitchen & bar', value: cur.bar, color: C.moss }, { label: 'Business', value: cur.business, color: C.sky }]} fmt={rupee} sub="30-day revenue" />
        </Section>

        <Section eyebrow="Ranking" title="What earns the most" delay={120}>
          <HBars fmt={rupee} rows={[{ label: 'Court bookings', value: cur.court }, { label: 'Kitchen & bar', value: cur.bar }, { label: 'Memberships', value: cur.membership }, { label: 'Store', value: cur.shop }, { label: 'Business invoices', value: cur.business }].sort((a, c) => c.value - a.value)} />
        </Section>
      </div>
    </>
  );
}
