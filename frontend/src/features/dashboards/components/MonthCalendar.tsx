import { cn } from '@/lib/utils';

export interface CalendarMark {
  date: string; // YYYY-MM-DD (IST)
  kind: 'booking' | 'event';
  label: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Month grid (Monday first) with dots for bookings and joined events. */
export function MonthCalendar({ month, today, marks }: { month: string; today: string; marks: CalendarMark[] }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const key = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const title = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);

  return (
    <div>
      <table className="w-full table-fixed border-collapse text-center text-sm">
        <caption className="mb-3 text-left font-semibold">{title}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="pb-2 text-[0.7rem] font-semibold tracking-[0.1em] text-muted uppercase">
                <abbr title={d}>{d.slice(0, 1)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, wi) => (
            <tr key={wi}>
              {w.map((d, di) => {
                if (!d) return <td key={di} />;
                const k = key(d);
                const dayMarks = marks.filter((x) => x.date === k);
                const isToday = k === today;
                return (
                  <td key={di} className="p-0.5">
                    <div className={cn('flex aspect-square flex-col items-center justify-center gap-1', isToday && 'bg-olive text-chalk', !isToday && dayMarks.length > 0 && 'bg-sand')}>
                      <span className="tabular-nums">{d}</span>
                      {(isToday || dayMarks.length > 0) && (
                        <span className="sr-only">
                          {isToday ? 'Today. ' : ''}
                          {dayMarks.map((x) => x.label).join('; ')}
                        </span>
                      )}
                      <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                        {dayMarks.some((x) => x.kind === 'booking') && <span className={cn('size-1.5 rounded-full', isToday ? 'bg-sun' : 'bg-terracotta')} />}
                        {dayMarks.some((x) => x.kind === 'event') && <span className={cn('size-1.5 rounded-full', isToday ? 'bg-chalk' : 'bg-olive-mid')} />}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-terracotta" aria-hidden="true" /> Court booking
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-olive-mid" aria-hidden="true" /> Social play
        </span>
      </p>
    </div>
  );
}
