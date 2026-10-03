import { useMemo, useState } from 'react';
import { CalendarClock, Clock, History, Zap } from 'lucide-react';

import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BookingDrawer } from '../../components/BookingDrawers';
import { CourtCalendar } from '../../components/CourtCalendar';
import { MembershipCard, useMe } from '../../components/MemberBits';
import { BOOKING_STATUS_LABEL } from '../../status';
import { courtById, playsUsed, useDemo } from '../../store/demoStore';
import { DEMO_NOW, DEMO_TODAY, type DBooking } from '../../store/types';
import { Card, Empty, Kpi, Meter, PageHeader, PageSkeleton, Pill, Section, usePageReady } from '../../ui/kit';

function BookingRow({ b, onOpen }: { b: DBooking; onOpen: (id: string) => void }) {
  const st = BOOKING_STATUS_LABEL[b.status];
  const court = courtById(b.court_id);
  return (
    <li>
      <button type="button" onClick={() => onOpen(b.id)} className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line px-1 py-3.5 text-left transition-colors last:border-0 hover:bg-olive/6">
        <span className="grid size-12 shrink-0 place-items-center border border-line bg-sand text-center leading-none transition-colors group-hover:border-olive">
          <span>
            <span className="display block text-xl">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(b.start_at))}</span>
            <span className="eyebrow !text-[0.55rem] text-olive-mid">{new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(b.start_at))}</span>
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{b.kind === 'SOCIAL' ? (b.title ?? 'Social play') : court?.name}</span>
          <span className="block text-sm text-muted">{formatClockIst(b.start_at)}–{formatClockIst(b.end_at)} · {b.amount_due === 0 ? 'Included' : formatMoney(b.amount_due)}</span>
        </span>
        <Pill tone={st.tone}>{st.label}</Pill>
      </button>
    </li>
  );
}

export default function MemberCourts() {
  const ready = usePageReady();
  const s = useDemo();
  const me = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<'up' | 'past'>('up');

  const mine = useMemo(() => s.bookings.filter((b) => b.member_id === me.id).sort((a, b) => a.start_at.localeCompare(b.start_at)), [s.bookings, me.id]);
  const upcoming = mine.filter((b) => Date.parse(b.end_at) > Date.parse(DEMO_NOW) && b.status !== 'CANCELLED');
  const history = mine.filter((b) => !upcoming.includes(b)).reverse();
  const next = upcoming[0];
  const used = playsUsed(s, me.id, DEMO_TODAY);
  const nextCourt = next ? courtById(next.court_id) : undefined;
  const spent = history.filter((b) => b.pay === 'PAID').reduce((a, b) => a + b.amount_due, 0);
  const saved = mine.filter((b) => b.status !== 'CANCELLED').reduce((a, b) => a + b.discount, 0);

  if (!ready) return <PageSkeleton />;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(DEMO_NOW)));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader eyebrow="Courts & bookings" title={`${greeting}, ${me.name.split(' ')[0]}. Where to next?`}>
        <Pill tone="green"><Zap className="size-3" aria-hidden="true" /> Live availability</Pill>
      </PageHeader>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
        <MembershipCard member={me} />
        <Card lift className="anim-rise flex flex-col justify-between p-5" style={{ ['--d' as string]: '80ms' }}>
          <div>
            <p className="eyebrow text-olive-mid">Today’s allowance</p>
            <p className="display mt-3 text-5xl leading-none">
              {Math.max(0, me.max_plays - used)}
              <span className="text-2xl text-muted"> / {me.max_plays}</span>
            </p>
            <p className="mt-1 text-sm text-muted">plays remaining today</p>
          </div>
          <div className="mt-5">
            <Meter value={used} max={me.max_plays} tone={used >= me.max_plays ? 'rust' : 'olive'} />
            <p className="mt-2 text-xs text-muted">{used >= me.max_plays ? 'Limit reached — pick another day.' : `${used} of ${me.max_plays} used · resets at midnight IST`}</p>
          </div>
        </Card>
        <Card lift className="anim-rise flex flex-col justify-between p-5" style={{ ['--d' as string]: '160ms' }}>
          <p className="eyebrow text-olive-mid">Next booking</p>
          {next ? (
            <button type="button" onClick={() => setOpen(next.id)} className="mt-3 text-left">
              <p className="display text-3xl leading-tight">{nextCourt?.name}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted"><CalendarClock className="size-4 text-olive" aria-hidden="true" /> {formatDateIst(next.start_at)}</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted"><Clock className="size-4 text-olive" aria-hidden="true" /> {formatClockIst(next.start_at)}–{formatClockIst(next.end_at)}</p>
              <p className="mt-4 text-xs font-semibold text-primary">View details →</p>
            </button>
          ) : (
            <p className="mt-3 text-sm text-muted">Nothing scheduled — grab a slot below.</p>
          )}
        </Card>
      </div>

      <Section eyebrow="Availability" title="Book a court" className="!p-4 sm:!p-6">
        <CourtCalendar mode="member" memberId={me.id} />
      </Section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Section eyebrow="Your sessions" title="Bookings" delay={60} action={
          <div className="flex gap-1 rounded-full border border-line bg-sand p-1 text-xs font-semibold">
            {([['up', `Upcoming · ${upcoming.length}`], ['past', `History · ${history.length}`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={cn('min-h-8 rounded-full px-3 transition-colors duration-200', tab === k ? 'bg-olive text-chalk' : 'text-ink/70 hover:text-ink')}>{l}</button>
            ))}
          </div>
        }>
          {(tab === 'up' ? upcoming : history).length === 0 ? (
            <Empty icon={tab === 'up' ? CalendarClock : History} title={tab === 'up' ? 'No upcoming bookings' : 'No history yet'} body={tab === 'up' ? 'Pick a free start time on the calendar and it will appear here.' : 'Played sessions will be listed here.'} />
          ) : (
            <ul key={tab} className="anim-fade">{(tab === 'up' ? upcoming : history).map((b) => <BookingRow key={b.id} b={b} onOpen={setOpen} />)}</ul>
          )}
        </Section>

        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Kpi label="Saved with membership" value={saved} format={(n) => formatMoney(n).replace(/\.00$/, '')} icon={Zap} tone="sun" note="on court bookings" delay={100} />
          <Kpi label="Sessions played" value={history.filter((b) => b.status === 'COMPLETED').length} icon={History} note={spent ? `${formatMoney(spent).replace(/\.00$/, '')} spent` : 'all included in your plan'} delay={160} />
        </div>
      </div>

      <BookingDrawer mode="member" memberId={me.id} bookingId={open} onClose={() => setOpen(null)} />
    </>
  );
}
