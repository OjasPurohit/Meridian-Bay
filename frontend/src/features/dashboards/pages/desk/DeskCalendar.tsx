import { useMemo, useState } from 'react';
import { CalendarCheck2, Clock, Gauge, Search, Wallet } from 'lucide-react';

import { formatRupees } from '@/lib/format';
import { CourtCalendar } from '../../components/CourtCalendar';
import { METHOD_ICON, PendingTable, pendingItems, todayPayments, totalsByMethod, TransactionTable } from '../../components/PaymentBits';
import { MemberLookup } from '../../components/MemberLookup';
import { dayOf, useDemo } from '../../store/demoStore';
import { courts } from '../../store/staticData';
import { DEMO_NOW, DEMO_TODAY } from '../../store/types';
import { Kpi, PageHeader, PageSkeleton, Pill, Section, Segmented, usePageReady } from '../../ui/kit';

export default function DeskCalendar() {
  const ready = usePageReady();
  const s = useDemo();
  const [tab, setTab] = useState<'today' | 'pending' | 'recent'>('today');

  const today = useMemo(() => todayPayments(s), [s]);
  const collected = today.reduce((a, p) => a + p.amount, 0);
  const pending = useMemo(() => pendingItems(s), [s]);
  const pendingSum = pending.reduce((a, p) => a + p.amount, 0);
  const todays = s.bookings.filter((b) => b.kind === 'REGULAR' && b.status !== 'CANCELLED' && dayOf(b.start_at) === DEMO_TODAY);
  const upcomingToday = todays.filter((b) => Date.parse(b.start_at) > Date.parse(DEMO_NOW)).length;
  const live = s.bookings.filter((b) => b.status !== 'CANCELLED' && Date.parse(b.start_at) <= Date.parse(DEMO_NOW) && Date.parse(b.end_at) > Date.parse(DEMO_NOW)).length;
  const methods = totalsByMethod(today);

  if (!ready) return <PageSkeleton rows={2} />;

  return (
    <>
      <PageHeader eyebrow="Front desk" title="Today’s court calendar">
        <Pill tone="green"><span className="live-dot size-1.5 rounded-full bg-olive text-olive" /> {live} on court now</Pill>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Wallet} label="Collected today" value={collected} format={(n) => formatRupees(Math.round(n))} note={`${today.length} payments`} delay={0} />
        <Kpi tone="sun" icon={Clock} label="Pending payments" value={pendingSum} format={(n) => formatRupees(Math.round(n))} note={`${pending.length} to collect`} delay={70} />
        <Kpi icon={CalendarCheck2} label="Bookings today" value={todays.length} note={`${upcomingToday} still to play`} delay={140} />
        <Kpi icon={Gauge} label="Courts in use" value={live} note={`of ${courts.length} courts right now`} delay={210} />
      </div>

      <Section eyebrow="All bookings" title="Court calendar" className="!p-4 sm:!p-6">
        <CourtCalendar mode="desk" />
      </Section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Section eyebrow="Lookup" title="Find a member" delay={60} action={<Search className="size-5 text-olive-mid" aria-hidden="true" />}>
          <MemberLookup />
        </Section>

        <Section eyebrow="Cash desk" title="Payments" delay={120} action={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today', count: today.length }, { value: 'pending', label: 'Pending', count: pending.length }, { value: 'recent', label: 'Recent' }]} />}>
          {tab === 'today' && (
            <div className="anim-fade space-y-4">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(methods) as (keyof typeof methods)[]).map((m) => {
                  const I = METHOD_ICON[m];
                  return (
                    <li key={m} className="border border-line bg-sand p-3">
                      <I className="size-4 text-olive" aria-hidden="true" />
                      <p className="display mt-2 text-xl tabular-nums">{formatRupees(methods[m])}</p>
                      <p className="text-xs text-muted capitalize">{m.toLowerCase()}</p>
                    </li>
                  );
                })}
              </ul>
              <TransactionTable rows={today} limit={6} />
            </div>
          )}
          {tab === 'pending' && <div className="anim-fade"><PendingTable limit={6} /></div>}
          {tab === 'recent' && <div className="anim-fade"><TransactionTable rows={s.payments} limit={8} /></div>}
        </Section>
      </div>
    </>
  );
}
