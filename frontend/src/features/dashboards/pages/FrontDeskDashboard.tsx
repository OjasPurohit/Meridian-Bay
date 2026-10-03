import { useMemo, useState } from 'react';

import { getCourtDay, listBookingDates, PREVIEW_NOW, type CourtDay, type SlotKind } from '@/api/dashboards';
import { getClubInfo } from '@/api/public';
import { field, label } from '@/features/public/components/EnquirySection';
import { formatClockIst, formatDateIst, formatMoney, formatRupees, istDateKey } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge, DashboardShell, EmptyState, ErrorState, Loading, Panel, useLoad } from '../components/DashboardShell';

const SECTIONS = [
  { id: 'courts', label: 'Court status' },
  { id: 'walk-in', label: 'Walk-in booking' },
  { id: 'tabs', label: 'Open bills' },
];

const SLOT_STYLE: Record<SlotKind | 'FREE', { cls: string; label: string }> = {
  FREE: { cls: 'bg-chalk border border-line', label: 'Free' },
  BOOKED: { cls: 'bg-terracotta', label: 'Booked' },
  SOCIAL: { cls: 'bg-olive-mid', label: 'Social play' },
  TRIAL: { cls: 'bg-sun', label: 'Trial' },
  MAINTENANCE: { cls: 'bg-ink/60', label: 'Maintenance' },
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const at = (date: string, m: number) => new Date(`${date}T${hhmm(m)}:00+05:30`).getTime();

function slotKind(day: CourtDay, courtId: string, startMs: number, endMs: number): SlotKind | 'FREE' {
  const hit = day.occupied.find((o) => o.court_id === courtId && new Date(o.start_at).getTime() < endMs && new Date(o.end_at).getTime() > startMs);
  return hit ? hit.kind : 'FREE';
}

function CourtGrid({ day, open, close }: { day: CourtDay; open: number; close: number }) {
  const slots = Array.from({ length: (close - open) / 30 }, (_, i) => open + i * 30);
  return (
    <div className="relative overflow-x-auto pb-2">
      <table className="w-full min-w-[46rem] border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Court status on {formatDateIst(day.date)} in 30-minute slots</caption>
        <thead>
          <tr>
            <th scope="col" className="w-36 pr-2 text-left font-semibold text-muted">Court</th>
            {slots.map((m) => (
              <th key={m} scope="col" className="text-left font-normal text-muted">
                {m % 60 === 0 ? <span>{hhmm(m).slice(0, 2)}</span> : <span className="sr-only">{hhmm(m)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {day.courts.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="pr-2 text-left text-sm font-semibold whitespace-nowrap">
                {c.name}
              </th>
              {slots.map((m) => {
                const k = slotKind(day, c.id, at(day.date, m), at(day.date, m + 30));
                return (
                  <td key={m} className="p-0">
                    <span className={cn('block h-7 min-w-3', SLOT_STYLE[k].cls)} title={`${hhmm(m)} ${SLOT_STYLE[k].label}`}>
                      <span className="sr-only">
                        {hhmm(m)} {SLOT_STYLE[k].label}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FrontDeskDashboard() {
  const dates = listBookingDates();
  const todayKey = istDateKey(PREVIEW_NOW.toISOString());
  const [date, setDate] = useState(dates.includes(todayKey) ? todayKey : dates[0]);
  const state = useLoad(() => Promise.all([getCourtDay(date), getClubInfo()]), [date]);
  const [day, club] = state.data ?? [null, null];
  const open = club ? toMin(club.club_open_time) : 360;
  const close = club ? toMin(club.club_close_time) : 1320;

  const [courtId, setCourtId] = useState('');
  const [start, setStart] = useState('');
  const court = day?.courts.find((c) => c.id === (courtId || day.courts[0]?.id));
  const freeStarts = useMemo(() => {
    if (!day || !court) return [];
    const out: number[] = [];
    for (let m = open; m + 60 <= close; m += 30) {
      if (slotKind(day, court.id, at(day.date, m), at(day.date, m + 60)) === 'FREE' && at(day.date, m) > PREVIEW_NOW.getTime()) out.push(m);
    }
    return out;
  }, [day, court, open, close]);
  const chosen = freeStarts.includes(toMin(start || '00:00')) ? start : freeStarts[0] !== undefined ? hhmm(freeStarts[0]) : '';

  const counts = day
    ? (['BOOKED', 'SOCIAL', 'TRIAL', 'MAINTENANCE'] as SlotKind[]).map((k) => ({ k, n: day.occupied.filter((o) => o.kind === k).length })).filter((x) => x.n)
    : [];

  return (
    <DashboardShell
      role="FRONT_DESK"
      title="Today at the desk."
      intro="Which courts are free, walk-in bookings and the bills still open at the bar."
      sections={SECTIONS}
      previewOf="Court status shows occupancy only — never who booked."
    >
      {state.error && <ErrorState message={state.error} />}
      <div className="grid gap-6">
        <Panel
          id="courts"
          title="Court status"
          action={
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Day</span>
              <select value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 border border-line bg-chalk px-3">
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDateIst(d)}
                    {d === todayKey ? ' (today)' : ''}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          {state.loading || !day ? (
            <Loading label="Loading court status" />
          ) : (
            <>
              <CourtGrid day={day} open={open} close={close} />
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
                {Object.entries(SLOT_STYLE).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={cn('inline-block size-3', v.cls)} aria-hidden="true" />
                    {v.label}
                  </span>
                ))}
                <span className="ml-auto">{counts.length ? counts.map((c) => `${c.n} ${SLOT_STYLE[c.k].label.toLowerCase()}`).join(' · ') : 'No bookings this day'}</span>
              </div>
            </>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-12">
          <Panel id="walk-in" title="Walk-in booking" className="lg:col-span-5">
            {day && court ? (
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className={label}>Court</span>
                    <select className={field} value={court.id} onChange={(e) => setCourtId(e.target.value)}>
                      {day.courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={label}>Start (1 hour)</span>
                    <select className={field} value={chosen} onChange={(e) => setStart(e.target.value)} disabled={!freeStarts.length}>
                      {freeStarts.length ? freeStarts.map((m) => <option key={m}>{hhmm(m)}</option>) : <option>No free hour left</option>}
                    </select>
                  </label>
                </div>
                <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Walk-in rate</dt>
                    <dd className="font-semibold tabular-nums">{formatRupees(court.walk_in_rate_per_hour)} / hour</dd>
                  </div>
                  <p className="text-xs text-muted">Walk-ins pay the court’s list rate (GST included). Members are booked from their profile so their plan discount applies.</p>
                </dl>
                <button type="submit" disabled className="mt-5 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-ink/20 px-6 font-semibold text-muted">
                  Confirm booking
                </button>
                <p className="mt-2 text-xs text-muted">Saving bookings needs the bookings API, so nothing is booked from this preview.</p>
              </form>
            ) : (
              <Loading />
            )}
          </Panel>

          <Panel id="tabs" title="Open bills" className="lg:col-span-7" action={day && <Badge tone="sun">{day.open_tabs.length} open</Badge>}>
            {!day ? (
              <Loading />
            ) : day.open_tabs.length ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/20 text-xs tracking-[0.12em] text-muted uppercase">
                      <th scope="col" className="py-2 pr-4 font-semibold">Tab</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Table</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Opened</th>
                      <th scope="col" className="py-2 text-right font-semibold">Running total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.open_tabs.map((t) => (
                      <tr key={t.id} className="border-b border-line">
                        <td className="py-3 pr-4 font-semibold">{t.tab_number}</td>
                        <td className="py-3 pr-4">{t.table ?? 'Counter'}</td>
                        <td className="py-3 pr-4 text-muted">
                          {formatDateIst(t.opened_at)} {formatClockIst(t.opened_at)}
                        </td>
                        <td className="py-3 text-right tabular-nums">{formatMoney(t.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState>No open bills.</EmptyState>
            )}
            <p className="mt-4 text-xs text-muted">Settling a bill (cash, card or UPI) needs the payments API and is not available in this preview.</p>
          </Panel>
        </div>
      </div>
    </DashboardShell>
  );
}
