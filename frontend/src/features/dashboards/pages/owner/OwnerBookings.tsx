import { useMemo } from 'react';
import { CalendarCheck, Gauge, Undo2, Wallet } from 'lucide-react';

import { formatRupees } from '@/lib/format';
import { CourtCalendar } from '../../components/CourtCalendar';
import { dayOf, useDemo } from '../../store/demoStore';
import { periodTotals } from '../../store/selectors';
import { courts } from '../../store/staticData';
import { DEMO_TODAY } from '../../store/types';
import { HBars } from '../../ui/charts';
import { Kpi, PageHeader, PageSkeleton, Section, usePageReady } from '../../ui/kit';
import { BookingsTable } from '../desk/DeskBookings';

export default function OwnerBookings() {
  const ready = usePageReady();
  const s = useDemo();
  const { cur } = periodTotals('MONTH');
  const todays = s.bookings.filter((b) => b.kind === 'REGULAR' && b.status !== 'CANCELLED' && dayOf(b.start_at) === DEMO_TODAY).length;
  const util = useMemo(
    () =>
      courts.map((c) => ({
        label: c.name,
        value: s.bookings.filter((b) => b.court_id === c.id && b.status !== 'CANCELLED' && b.kind !== 'MAINTENANCE').length,
        sub: `₹${c.rate}/hr`,
      })).sort((a, b) => b.value - a.value),
    [s.bookings],
  );
  const cancelled = s.bookings.filter((b) => b.status === 'CANCELLED').length;
  if (!ready) return <PageSkeleton rows={2} />;
  const utilisation = Math.min(96, Math.round((cur.bookings / (courts.length * 14 * 30)) * 100 * 1.9));

  return (
    <>
      <PageHeader eyebrow="Courts & bookings" title="Utilisation and schedule" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={CalendarCheck} label="Bookings today" value={todays} note="all courts" />
        <Kpi icon={Gauge} label="Court utilisation" value={utilisation} format={(n) => `${Math.round(n)}%`} note="last 30 days" delay={70} />
        <Kpi icon={Wallet} label="Court revenue · 30 d" value={cur.court} format={(n) => formatRupees(Math.round(n))} delay={140} />
        <Kpi tone="sun" icon={Undo2} label="Cancellations" value={cancelled} note="in the schedule window" delay={210} />
      </div>
      <Section eyebrow="Schedule" title="Court calendar" className="!p-4 sm:!p-6"><CourtCalendar mode="desk" /></Section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Section eyebrow="Every booking" title="Bookings" delay={60}><BookingsTable /></Section>
        <Section eyebrow="Busiest" title="Bookings per court" delay={120}><HBars rows={util} /></Section>
      </div>
    </>
  );
}
