import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Sparkles, Wrench } from 'lucide-react';

import { addDays } from '@shared/lib/time';
import { cn } from '@/lib/utils';
import { formatClockIst } from '@/lib/format';
import { dayOf, gridStarts, liveBooking, nextFreeSlot, playsUsed, slotState, useDemo } from '../store/demoStore';
import { ALL_MEMBERS, courts } from '../store/staticData';
import { DEMO_NOW, DEMO_TODAY, type DBooking, type DCourt } from '../store/types';
import { Chips } from '../ui/kit';
import { BookDrawer, BookingDrawer } from './BookingDrawers';

export type CalendarMode = 'member' | 'desk';

const SPORT_LABEL: Record<string, string> = { ALL: 'All courts', TENNIS: 'Tennis', CRICKET: 'Cricket', PADEL: 'Padel', BADMINTON: 'Badminton' };
const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' });
const numFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'UTC' });
const monFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const utcNoon = (d: string) => new Date(`${d}T12:00:00Z`);

const LABEL_W = '10.5rem';

function istMinutes(iso: string) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(iso)).split(':').map(Number);
  return h * 60 + m;
}

/**
 * The court-booking calendar. One component, two audiences:
 *  - member: other people's bookings are visible as "Booked" only — never who booked (privacy);
 *  - desk:   every booking shows the customer, status and payment, and opens full details.
 */
export function CourtCalendar({ mode, memberId, date: dateProp, onDateChange, sport: sportProp, onSportChange }: { mode: CalendarMode; memberId?: string; date?: string; onDateChange?: (d: string) => void; sport?: string; onSportChange?: (s: string) => void }) {
  const s = useDemo();
  const [ownDate, setOwnDate] = useState(DEMO_TODAY);
  const [ownSport, setOwnSport] = useState('ALL');
  const date = dateProp ?? ownDate;
  const setDate = onDateChange ?? setOwnDate;
  const sport = sportProp ?? ownSport;
  const setSport = onSportChange ?? setOwnSport;
  const [picked, setPicked] = useState<{ court: DCourt; start_at: string } | null>(null);
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const me = memberId ? ALL_MEMBERS.find((m) => m.id === memberId) : undefined;

  // the strip is today-centred; a date chosen elsewhere (the owner's month view) outside it re-centres the strip on that date
  const anchor = date >= addDays(DEMO_TODAY, -3) && date <= addDays(DEMO_TODAY, 14) ? DEMO_TODAY : date;
  const dates = useMemo(() => Array.from({ length: 18 }, (_, i) => addDays(anchor, i - 3)), [anchor]);
  const cols = useMemo(() => gridStarts(date), [date]);
  const visibleCourts = courts.filter((c) => sport === 'ALL' || c.sport === sport);
  const sports = ['ALL', ...new Set(courts.map((c) => c.sport))];

  const live = useMemo(() => s.bookings.filter(liveBooking), [s.bookings]);
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of live) m.set(dayOf(b.start_at), (m.get(dayOf(b.start_at)) ?? 0) + 1);
    return m;
  }, [live]);
  const maxPerDay = Math.max(1, ...dates.map((d) => perDay.get(d) ?? 0));
  const mineByDay = useMemo(() => new Set(live.filter((b) => b.member_id === memberId).map((b) => dayOf(b.start_at))), [live, memberId]);

  const dayBookings = useMemo(() => live.filter((b) => dayOf(b.start_at) === date), [live, date]);
  const freeCount = useMemo(() => visibleCourts.reduce((n, c) => n + cols.filter((t) => slotState(s, c.id, t) === 'AVAILABLE').length, 0), [s, visibleCourts, cols]);

  // keep the chosen date centred in the strip
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="date"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [date]);

  const jumpNext = () => {
    for (const d of dates.filter((x) => x >= DEMO_TODAY)) {
      const hit = nextFreeSlot(s, d, sport);
      if (hit) {
        setDate(d);
        setPicked(hit);
        return;
      }
    }
  };

  const nowPct = date === DEMO_TODAY ? Math.min(1, Math.max(0, (istMinutes(DEMO_NOW) - 360) / (16 * 60))) : null;
  const used = me ? playsUsed(s, me.id, date) : 0;

  const bookingAt = (courtId: string, t: string): DBooking | undefined => dayBookings.find((b) => b.court_id === courtId && b.start_at === t);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- date strip */}
      <div className="flex items-stretch gap-2">
        <button type="button" aria-label="Earlier days" onClick={() => strip.current?.scrollBy({ left: -280, behavior: 'smooth' })} className="hidden w-9 shrink-0 place-items-center border border-line bg-chalk transition-colors hover:border-olive sm:grid">
          <ChevronLeft className="size-4" />
        </button>
        <div ref={strip} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth pb-1" role="tablist" aria-label="Choose a day">
          {dates.map((d, i) => {
            const active = d === date;
            const count = perDay.get(d) ?? 0;
            const past = d < DEMO_TODAY;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={active ? 'date' : undefined}
                onClick={() => setDate(d)}
                style={{ ['--d' as string]: `${i * 22}ms` }}
                className={cn('anim-rise group relative flex w-[4.4rem] shrink-0 flex-col items-center border px-2 pt-2.5 pb-2 transition-[background-color,border-color,color,transform,box-shadow] duration-250 active:scale-95', active ? 'border-olive bg-olive text-chalk shadow-[0_14px_28px_-16px_rgba(30,37,32,0.8)]' : 'border-line bg-chalk hover:-translate-y-0.5 hover:border-olive-mid', past && !active && 'opacity-60')}
              >
                <span className={cn('eyebrow !text-[0.62rem]', active ? 'text-sun' : 'text-olive-mid')}>{d === DEMO_TODAY ? 'Today' : dayFmt.format(utcNoon(d))}</span>
                <span className="display mt-0.5 text-[1.7rem] leading-none">{numFmt.format(utcNoon(d))}</span>
                <span className={cn('text-[0.65rem]', active ? 'text-chalk/70' : 'text-muted')}>{monFmt.format(utcNoon(d))}</span>
                <span className={cn('mt-2 h-1 w-full overflow-hidden rounded-full', active ? 'bg-chalk/20' : 'bg-ink/8')} aria-hidden="true">
                  <span className={cn('block h-full rounded-full transition-[width] duration-700', active ? 'bg-sun' : 'bg-terracotta')} style={{ width: `${Math.max(count ? 12 : 0, (count / maxPerDay) * 100)}%` }} />
                </span>
                {mineByDay.has(d) && <span className={cn('absolute top-1.5 right-1.5 size-2 rounded-full', active ? 'bg-sun' : 'bg-olive')} title="You have a booking" />}
              </button>
            );
          })}
        </div>
        <button type="button" aria-label="Later days" onClick={() => strip.current?.scrollBy({ left: 280, behavior: 'smooth' })} className="hidden w-9 shrink-0 place-items-center border border-line bg-chalk transition-colors hover:border-olive sm:grid">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* ---------------------------------------------------------------- controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 key={date} className="display anim-fade text-2xl sm:text-3xl">
            {longFmt.format(utcNoon(date))}
          </h2>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-olive">{freeCount}</span> start times free
            {mode === 'member' && me && (
              <>
                {' '}
                · <span className="font-semibold text-ink">{Math.max(0, me.max_plays - used)}</span> of {me.max_plays} plays left this day
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Chips value={sport} onChange={setSport} options={sports.map((v) => ({ value: v, label: SPORT_LABEL[v] ?? v }))} />
          <button type="button" onClick={jumpNext} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-primary px-4 text-[0.82rem] font-semibold text-chalk transition-[transform,background-color,box-shadow] hover:bg-terracotta hover:shadow-[0_10px_22px_-12px_rgba(164,82,58,0.9)] active:scale-95">
            <Sparkles className="size-4" aria-hidden="true" /> Next available
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- legend */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-2"><span className="h-4 w-7 border border-olive-mid/50 bg-olive-mid/25" /> Available</li>
        <li className="inline-flex items-center gap-2"><span className="hatch h-4 w-7 border border-terracotta/40 bg-terracotta/10" /> Booked</li>
        {mode === 'member' ? (
          <li className="inline-flex items-center gap-2"><span className="h-4 w-7 bg-olive" /> Your booking</li>
        ) : (
          <>
            <li className="inline-flex items-center gap-2"><span className="h-4 w-7 bg-olive" /> Paid / free</li>
            <li className="inline-flex items-center gap-2"><span className="h-4 w-7 bg-primary" /> Payment pending</li>
          </>
        )}
        <li className="inline-flex items-center gap-2"><span className="h-4 w-7 bg-sun" /> Social play</li>
        <li className="inline-flex items-center gap-2"><span className="hatch-grey h-4 w-7 border border-ink/20 bg-ink/6" /> Maintenance</li>
        <li className="inline-flex items-center gap-2"><span className="h-4 w-7 bg-ink/[0.06]" /> Past / not bookable</li>
      </ul>

      {/* ---------------------------------------------------------------- the grid */}
      <div key={`${date}-${sport}`} className="anim-fade overflow-x-auto border border-line bg-chalk">
        <div className="relative min-w-[62rem]">
          <div className="grid" style={{ gridTemplateColumns: `${LABEL_W} repeat(${cols.length}, minmax(1.8rem, 1fr))` }}>
            {/* header row */}
            <div className="sticky left-0 z-20 border-b border-line bg-chalk px-3 py-2">
              <span className="eyebrow text-olive-mid">Court</span>
            </div>
            {cols.map((t, i) => {
              const m = istMinutes(t);
              return (
                <div key={t} className={cn('border-b border-line py-2 text-center text-[0.68rem] text-muted', m % 60 === 0 ? 'border-l border-l-line font-semibold text-ink/80' : 'text-transparent select-none')}>
                  {m % 60 === 0 ? formatClockIst(t).replace(':00', '') : '·'}
                  {i === 0 && <span className="sr-only">Times in IST</span>}
                </div>
              );
            })}

            {visibleCourts.length === 0 && <div className="col-span-full p-8 text-center text-sm text-muted">No courts match this filter.</div>}

            {visibleCourts.map((c) => (
              <CourtRow key={c.id} court={c} cols={cols} dayBookings={dayBookings} mode={mode} memberId={memberId} bookingAt={bookingAt} onPick={(t) => setPicked({ court: c, start_at: t })} onOpen={setOpenBooking} picked={picked} />
            ))}
          </div>

          {nowPct !== null && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-30" style={{ left: `calc(${LABEL_W} + (100% - ${LABEL_W}) * ${nowPct})` }}>
              <div className="relative h-full w-px bg-primary">
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded-b bg-primary px-1.5 py-0.5 text-[0.6rem] font-bold text-chalk">NOW</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted">
        <CalendarCheck className="size-4 text-olive" aria-hidden="true" />
        Each session is 1 hour; a new start opens every 30 minutes. Tap a free start time to book it.
        {mode === 'member' && ' Other members’ names are never shown.'}
      </p>

      <BookDrawer mode={mode} memberId={memberId} pick={picked} onClose={() => setPicked(null)} />
      <BookingDrawer mode={mode} memberId={memberId} bookingId={openBooking} onClose={() => setOpenBooking(null)} />
    </div>
  );
}

function CourtRow({
  court,
  cols,
  dayBookings,
  mode,
  memberId,
  bookingAt,
  onPick,
  onOpen,
  picked,
}: {
  court: DCourt;
  cols: string[];
  dayBookings: DBooking[];
  mode: CalendarMode;
  memberId?: string;
  bookingAt: (courtId: string, t: string) => DBooking | undefined;
  onPick: (t: string) => void;  
  onOpen: (id: string) => void;
  picked: { court: DCourt; start_at: string } | null;
}) {
  const s = useDemo();
  const covered = new Set<string>(); // second half-hour of a booking
  for (const b of dayBookings) if (b.court_id === court.id) covered.add(new Date(Date.parse(b.start_at) + 30 * 60_000).toISOString());

  return (
    <>
      <div className="sticky left-0 z-20 flex flex-col justify-center border-b border-line bg-chalk px-3 py-2">
        <span className="truncate text-sm font-semibold" title={court.name}>{court.name}</span>
        <span className="truncate text-[0.68rem] text-muted">₹{court.rate}/hr · {SPORT_LABEL[court.sport]}</span>
      </div>
      {cols.map((t, i) => {
        const col = i + 2;
        const b = bookingAt(court.id, t);
        const isHour = istMinutes(t) % 60 === 0;
        const base = cn('h-14 border-b border-line', isHour && 'border-l border-l-line/80');
        if (b) return <BookedBlock key={t} booking={b} col={col} mode={mode} memberId={memberId} onOpen={onOpen} />;
        if (covered.has(t)) return null;
        const st = slotState(s, court.id, t);
        if (st === 'AVAILABLE') {
          const sel = picked?.court.id === court.id && picked.start_at === t;
          return (
            <div key={t} style={{ gridColumn: col }} className={cn(base, 'group relative hover:z-10', sel && 'z-10')}>
              <button
                type="button"
                onClick={() => onPick(t)}
                aria-label={`Book ${court.name} at ${formatClockIst(t)}`}
                title={`${formatClockIst(t)}–${formatClockIst(new Date(Date.parse(t) + 3_600_000).toISOString())} · tap to book`}
                className={cn('absolute inset-0 m-px transition-[background-color,transform] duration-150 focus-visible:z-20', sel ? 'bg-olive-mid/45' : 'bg-olive-mid/18 hover:bg-olive-mid/38')}
              >
                <span aria-hidden="true" className={cn('pointer-events-none absolute inset-y-0 left-0 w-[200%] border-2 border-olive bg-olive/10 opacity-0 transition-opacity duration-150 group-hover:opacity-100', sel && 'opacity-100')} />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center text-[0.62rem] font-bold text-olive opacity-25 transition-opacity group-hover:opacity-100">
                  <span className="group-hover:hidden">+</span>
                  <span className="hidden group-hover:inline">{formatClockIst(t)}</span>
                </span>
              </button>
            </div>
          );
        }
        return <div key={t} style={{ gridColumn: col }} className={cn(base, st === 'PAST' ? 'bg-ink/[0.035]' : 'bg-ink/[0.07]')} aria-hidden="true" />;
      })}
    </>
  );
}

function BookedBlock({ booking: b, col, mode, memberId, onOpen }: { booking: DBooking; col: number; mode: CalendarMode; memberId?: string; onOpen: (id: string) => void }) {
  const mine = mode === 'member' && !!memberId && b.member_id === memberId;
  const past = Date.parse(b.end_at) <= Date.parse(DEMO_NOW);
  const kind = b.kind;
  const style = { gridColumn: `${col} / span 2` } as const;
  const hours = `${formatClockIst(b.start_at)}–${formatClockIst(b.end_at)}`;

  let tone: string;
  let label: string;
  let sub: string | null = null;
  if (kind === 'MAINTENANCE') {
    tone = 'hatch-grey bg-ink/8 text-ink/70 border-ink/25';
    label = 'Maintenance';
  } else if (kind === 'SOCIAL') {
    tone = 'bg-sun text-ink border-sun';
    label = mode === 'member' ? 'Social play' : b.title ?? 'Social play';
    sub = 'Friday open play';
  } else if (mode === 'member') {
    tone = mine ? 'bg-olive text-chalk border-olive shadow-[0_8px_18px_-10px_rgba(30,37,32,0.9)]' : 'hatch bg-terracotta/12 text-terracotta border-terracotta/40';
    label = mine ? 'Your booking' : 'Booked';
  } else {
    tone = b.pay === 'PENDING' ? 'bg-primary text-chalk border-primary' : b.kind === 'TRIAL' ? 'bg-sky text-ink border-sky' : 'bg-olive text-chalk border-olive';
    label = b.name;
    sub = b.kind === 'TRIAL' ? 'Trial session' : b.pay === 'PENDING' ? 'Payment pending' : b.pay === 'FREE' ? 'Included' : 'Paid';
  }

  const interactive = mode === 'desk' || mine;
  const content = (
    <>
      <span className="block truncate text-[0.7rem] leading-tight font-semibold">{label}</span>
      {(mode === 'desk' || mine || kind === 'SOCIAL') && <span className="block truncate text-[0.6rem] leading-tight opacity-80">{sub ?? hours}</span>}
    </>
  );
  const cls = cn('flex min-w-0 flex-col justify-center overflow-hidden border px-1.5 text-left transition-[transform,box-shadow,filter] duration-200', tone, past && 'opacity-55 saturate-50', interactive ? 'cursor-pointer hover:z-10 hover:-translate-y-0.5 hover:shadow-[0_14px_26px_-14px_rgba(30,37,32,0.8)] active:scale-[0.99]' : 'cursor-default');
  const cell = 'relative h-14 border-b border-line p-0';
  return (
    <div style={style} className={cn(cell)}>
      {interactive ? (
        <button type="button" onClick={() => onOpen(b.id)} title={`${label} · ${hours}`} className={cn(cls, 'absolute inset-px')}>
          {content}
        </button>
      ) : (
        <div title={kind === 'MAINTENANCE' ? 'Closed for maintenance' : `Booked · ${hours}`} className={cn(cls, 'absolute inset-px')}>
          {kind === 'MAINTENANCE' ? (
            <span className="flex items-center gap-1.5">
              <Wrench className="size-3 shrink-0" aria-hidden="true" />
              {content}
            </span>
          ) : (
            content
          )}
        </div>
      )}
    </div>
  );
}

