import { useMemo, useState } from 'react';

import { addDays } from '@shared/lib/time';
import { cn } from '@/lib/utils';
import { formatClockIst } from '@/lib/format';
import { dayOf, liveBooking, useDemo } from '../store/demoStore';
import { courts } from '../store/staticData';
import { DEMO_TODAY, type DBooking } from '../store/types';
import { BookingDrawer } from './BookingDrawers';

export type CalendarView = 'day' | 'week' | 'month';

const utcNoon = (d: string) => new Date(`${d}T12:00:00Z`);
const wd = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' });
const dm = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Monday of the week containing `date` (YYYY-MM-DD). */
export const weekStart = (date: string) => addDays(date, -((utcNoon(date).getUTCDay() + 6) % 7));
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const nextMonth = (date: string) => { const d = utcNoon(monthStart(date)); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const prevMonth = (date: string) => { const d = utcNoon(monthStart(date)); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };

/** Previous / next / today for the chosen view; `date` is any day inside the visible week or month. */
export const shiftRange = (view: CalendarView, date: string, dir: -1 | 1) =>
  view === 'month' ? (dir > 0 ? nextMonth(date) : prevMonth(date)) : addDays(date, dir * (view === 'week' ? 7 : 1));

export const rangeLabel = (view: CalendarView, date: string) => {
  if (view === 'month') return monthFmt.format(utcNoon(date));
  const a = weekStart(date);
  return `${dm.format(utcNoon(a))} – ${dm.format(utcNoon(addDays(a, 6)))} ${a.slice(0, 4)}`;
};

const tone = (b: DBooking) =>
  b.kind === 'MAINTENANCE' ? 'border-ink/25 bg-ink/8 text-ink/70' : b.kind === 'TRIAL' ? 'border-sky bg-sky text-ink' : b.kind === 'SOCIAL' ? 'border-sun bg-sun text-ink' : b.pay === 'PENDING' ? 'border-primary bg-primary text-chalk' : 'border-olive bg-olive text-chalk';

/** Week and month views of the owner's court calendar. Everything comes from the live bookings store (court_bookings via /bookings). */
export function RangeCalendar({ view, date, sport, onPickDay }: { view: 'week' | 'month'; date: string; sport: string; onPickDay: (d: string) => void }) {
  const s = useDemo();
  const [open, setOpen] = useState<string | null>(null);
  const courtName = useMemo(() => new Map(courts.map((c) => [c.id, c.name])), []);
  const inSport = useMemo(() => new Set(courts.filter((c) => sport === 'ALL' || c.sport === sport).map((c) => c.id)), [sport]);
  const byDay = useMemo(() => {
    const m = new Map<string, DBooking[]>();
    for (const b of s.bookings) {
      if (!liveBooking(b) || !inSport.has(b.court_id)) continue;
      const d = dayOf(b.start_at);
      m.set(d, [...(m.get(d) ?? []), b]);
    }
    for (const list of m.values()) list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return m;
  }, [s.bookings, inSport]);

  const first = view === 'week' ? weekStart(date) : weekStart(monthStart(date));
  const days = view === 'week' ? 7 : Math.ceil((((utcNoon(monthStart(date)).getUTCDay() + 6) % 7) + new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate()) / 7) * 7;
  const cells = Array.from({ length: days }, (_, i) => addDays(first, i));
  const month = date.slice(0, 7);

  return (
    <div>
      <div className="grid grid-cols-7 gap-px border border-line bg-line text-center" role="grid" aria-label={view === 'week' ? 'Week of bookings' : 'Month of bookings'}>
        {cells.slice(0, 7).map((d) => (
          <div key={d} className="eyebrow bg-chalk py-2 !text-[0.62rem] text-olive-mid" role="columnheader">{wd.format(utcNoon(d))}</div>
        ))}
        {cells.map((d) => {
          const list = byDay.get(d) ?? [];
          const outside = view === 'month' && d.slice(0, 7) !== month;
          const trials = list.filter((b) => b.kind === 'TRIAL').length;
          const pending = list.filter((b) => b.pay === 'PENDING' && b.kind === 'REGULAR').length;
          return (
            <div key={d} role="gridcell" className={cn('min-h-28 bg-cream p-1.5 text-left align-top', outside && 'opacity-45', d === DEMO_TODAY && 'outline-2 -outline-offset-2 outline-sun')}>
              <button type="button" onClick={() => onPickDay(d)} aria-label={`Open ${dm.format(utcNoon(d))} in day view`} className="flex w-full items-baseline justify-between gap-1 text-left hover:text-primary">
                <span className="display text-lg leading-none">{utcNoon(d).getUTCDate()}</span>
                <span className="text-[0.62rem] text-muted">{list.length ? `${list.length} booked` : ''}</span>
              </button>
              {view === 'week' ? (
                <ul className="mt-1.5 space-y-1">
                  {list.map((b) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => setOpen(b.id)} title={`${b.name} · ${courtName.get(b.court_id) ?? ''}`} className={cn('block w-full truncate border px-1.5 py-1 text-left text-[0.68rem] leading-tight', tone(b))}>
                        <span className="font-semibold">{formatClockIst(b.start_at)}</span> {b.kind === 'TRIAL' ? 'Trial · ' : ''}{b.name}
                        <span className="block truncate opacity-75">{courtName.get(b.court_id) ?? ''}</span>
                      </button>
                    </li>
                  ))}
                  {list.length === 0 && <li className="text-[0.68rem] text-muted">Free</li>}
                </ul>
              ) : (
                <div className="mt-1.5 space-y-1 text-[0.68rem]">
                  {list.length > 0 && <div className="h-1.5 overflow-hidden rounded-full bg-ink/8"><div className="h-full rounded-full bg-terracotta" style={{ width: `${Math.min(100, (list.length / Math.max(1, inSport.size * 8)) * 100)}%` }} /></div>}
                  {trials > 0 && <span className="inline-block border border-sky bg-sky px-1.5 py-0.5 font-semibold text-ink">{trials} trial{trials > 1 ? 's' : ''}</span>}
                  {pending > 0 && <span className="ml-1 inline-block border border-primary bg-primary px-1.5 py-0.5 font-semibold text-chalk">{pending} unpaid</span>}
                  {list.slice(0, 2).map((b) => <p key={b.id} className="truncate text-muted">{formatClockIst(b.start_at)} {b.name}</p>)}
                  {list.length > 2 && <p className="text-muted">+{list.length - 2} more</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Click a date number to open that day's detailed slot view. Trial sessions are shown in blue.</p>
      <BookingDrawer mode="desk" bookingId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
