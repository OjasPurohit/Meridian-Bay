import { useMemo, useState } from 'react';
import { ChefHat, Coins, Receipt, UtensilsCrossed } from 'lucide-react';

import { formatRupees } from '@/lib/format';
import { dayOf, useDemo } from '../../store/demoStore';
import { periodTotals } from '../../store/selectors';
import { DEMO_TODAY } from '../../store/types';
import { AreaChart, C, HBars } from '../../ui/charts';
import { Kpi, PageHeader, PageSkeleton, Section, Segmented, usePageReady } from '../../ui/kit';
import { bucket } from '../../store/staticData';
import { OrderBoard } from '../kitchen/KitchenOrders';
import { OrderHistoryTable } from '../kitchen/KitchenHistory';
import { MenuManager } from '../kitchen/KitchenProducts';
import { StockTable } from '../kitchen/KitchenStock';

const rupee = (n: number) => formatRupees(Math.round(n));

export default function OwnerKitchen() {
  const ready = usePageReady();
  const s = useDemo();
  const [tab, setTab] = useState<'live' | 'history' | 'menu' | 'stock'>('live');
  const { cur } = periodTotals('MONTH');
  const series = useMemo(() => bucket('WEEK'), []);
  const top = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of s.kOrders) if (o.status !== 'CANCELLED') for (const l of o.lines) m.set(l.name, (m.get(l.name) ?? 0) + l.qty);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
  }, [s.kOrders]);
  const today = s.kOrders.filter((o) => o.status !== 'CANCELLED' && dayOf(o.created_at) === DEMO_TODAY);
  const avg = today.length ? today.reduce((a, o) => a + o.total, 0) / today.length : 0;
  if (!ready) return <PageSkeleton rows={2} />;

  return (
    <>
      <PageHeader eyebrow="Kitchen & bar" title="Kitchen performance" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Coins} label="Kitchen & bar revenue · 30 d" value={cur.bar} format={rupee} />
        <Kpi icon={ChefHat} label="Orders today" value={today.length} note={`${s.kOrders.filter((o) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length} in progress`} delay={70} />
        <Kpi icon={Receipt} label="Average ticket" value={avg} format={rupee} note="today" delay={140} />
        <Kpi icon={UtensilsCrossed} label="Menu items" value={s.menu.length} note={`${s.menu.filter((m) => m.available).length} available`} delay={210} />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Section eyebrow="Trend" title="Weekly kitchen & bar sales"><AreaChart labels={series.labels} fmtFull={rupee} series={[{ name: 'Kitchen & bar', color: C.moss, data: series.bar }]} height={220} /></Section>
        <Section eyebrow="Popular" title="Top sellers" delay={80}><HBars rows={top} color={C.terracotta} fmt={(n) => `${n} sold`} /></Section>
      </div>
      <Section eyebrow="Operate" title="Kitchen" action={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'live', label: 'Live board' }, { value: 'history', label: 'History' }, { value: 'menu', label: 'Menu' }, { value: 'stock', label: 'Stock' }]} />}>
        <div key={tab} className="anim-fade">
          {tab === 'live' && <OrderBoard />}
          {tab === 'history' && <OrderHistoryTable />}
          {tab === 'menu' && <MenuManager />}
          {tab === 'stock' && <StockTable />}
        </div>
      </Section>
    </>
  );
}
