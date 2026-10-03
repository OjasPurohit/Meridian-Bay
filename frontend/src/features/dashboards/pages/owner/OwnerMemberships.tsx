import { useMemo } from 'react';
import { BellRing, Check, Crown, Shield, Sprout } from 'lucide-react';

import { formatDateIst, formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MembershipStatus } from '../../components/MemberLookup';
import { ALL_MEMBERS, planCards } from '../../store/staticData';
import { Avatar, btn, DataTable, Kpi, PageHeader, PageSkeleton, Section, usePageReady, useToast, type Column } from '../../ui/kit';
import type { DMember } from '../../store/types';

const ICON = { GOLD: Crown, SILVER: Shield, JUNIOR: Sprout } as const;
const rupee = (n: number) => formatRupees(Math.round(n));

export default function OwnerMemberships() {
  const ready = usePageReady();
  const toast = useToast();
  const stats = useMemo(() => planCards.map((p) => {
    const mine = ALL_MEMBERS.filter((m) => m.type === p.type && m.status === 'ACTIVE');
    return { ...p, active: mine.length, revenue: mine.length * p.price };
  }), []);
  const expiring = useMemo(() => ALL_MEMBERS.filter((m) => m.status === 'ACTIVE' && (m.days_left ?? 99) <= 45).sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0)), []);
  const lapsed = ALL_MEMBERS.filter((m) => m.status === 'EXPIRED').length;
  if (!ready) return <PageSkeleton rows={2} />;

  const cols: Column<DMember>[] = [
    { key: 'n', header: 'Member', cell: (m) => <div className="flex items-center gap-3"><Avatar name={m.name} size="sm" /><div><p className="font-semibold">{m.name}</p><p className="text-xs text-muted">{m.code}</p></div></div> },
    { key: 'p', header: 'Plan', cell: (m) => <MembershipStatus m={m} /> },
    { key: 'e', header: 'Expires', hide: 'sm', cell: (m) => formatDateIst(m.end_date!).replace(/^\w+, /, '') },
    { key: 'd', header: 'Days left', align: 'right', cell: (m) => <span className={cn('font-semibold', (m.days_left ?? 99) <= 10 && 'text-primary')}>{m.days_left}</span> },
    { key: 'a', header: '', align: 'right', cell: (m) => <button type="button" className={btn.quiet} onClick={() => toast(`Renewal reminder sent to ${m.name.split(' ')[0]}`)}><BellRing className="size-3.5" /> Remind</button> },
  ];

  return (
    <>
      <PageHeader eyebrow="Memberships" title="Plans & renewals" />
      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        {stats.map((p, i) => {
          const Icon = ICON[p.type];
          return (
            <div key={p.id} style={{ ['--d' as string]: `${i * 80}ms` }} className={cn('anim-rise card-lift flex flex-col border p-6', p.type === 'GOLD' ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk')}>
              <div className="flex items-start justify-between">
                <span className={cn('grid size-11 place-items-center rounded-full', p.type === 'GOLD' ? 'bg-chalk/15 text-sun' : 'bg-olive/10 text-olive')}><Icon className="size-5" aria-hidden="true" /></span>
                <p className={cn('eyebrow', p.type === 'GOLD' ? 'text-chalk/70' : 'text-olive-mid')}>{p.active} active</p>
              </div>
              <p className="display mt-4 text-3xl">{p.name}</p>
              <p className="display mt-1 text-4xl tabular-nums">{rupee(p.price)}<span className={cn('text-base', p.type === 'GOLD' ? 'text-chalk/65' : 'text-muted')}> / year</span></p>
              <ul className="mt-4 space-y-1.5 text-sm">{p.benefits.map((b) => <li key={b} className="flex gap-2"><Check className={cn('mt-0.5 size-4 shrink-0', p.type === 'GOLD' ? 'text-sun' : 'text-olive')} aria-hidden="true" />{b}</li>)}</ul>
              <div className={cn('mt-auto border-t pt-4', p.type === 'GOLD' ? 'border-chalk/20' : 'border-line')}>
                <p className={cn('eyebrow', p.type === 'GOLD' ? 'text-chalk/65' : 'text-olive-mid')}>Annual run-rate</p>
                <p className="display text-2xl tabular-nums">{rupee(p.revenue)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" label="Active memberships" value={stats.reduce((a, p) => a + p.active, 0)} />
        <Kpi tone="sun" label="Expiring within 45 days" value={expiring.length} delay={70} />
        <Kpi label="Lapsed (renewal chance)" value={lapsed} note="expired plans" delay={140} />
      </div>
      <Section eyebrow="Retention" title="Renewals coming up"><DataTable columns={cols} rows={expiring.slice(0, 12)} rowKey={(m) => m.id} dense /></Section>
    </>
  );
}
