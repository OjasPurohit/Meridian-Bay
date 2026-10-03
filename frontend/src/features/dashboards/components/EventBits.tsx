import { CalendarDays, MapPin, Music, Sparkles, Trophy, Users, Dumbbell, Tent, type LucideIcon } from 'lucide-react';

import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { planCards } from '../store/staticData';
import { DEMO_NOW, type DEvent, type DMember, type EventKind } from '../store/types';
import { Meter, Pill } from '../ui/kit';

export const KIND: Record<EventKind, { label: string; icon: LucideIcon; tone: 'green' | 'sun' | 'rust' | 'muted' }> = {
  TOURNAMENT: { label: 'Tournament', icon: Trophy, tone: 'rust' },
  SOCIAL: { label: 'Social play', icon: Users, tone: 'sun' },
  CLINIC: { label: 'Clinic', icon: Dumbbell, tone: 'green' },
  MIXER: { label: 'Social evening', icon: Music, tone: 'sun' },
  CAMP: { label: 'Camp', icon: Tent, tone: 'green' },
};

export type EventPhase = 'LIVE' | 'UPCOMING' | 'PAST';
export const eventPhase = (e: DEvent): EventPhase => {
  const now = Date.parse(DEMO_NOW);
  return Date.parse(e.end_at) < now ? 'PAST' : Date.parse(e.start_at) <= now ? 'LIVE' : 'UPCOMING';
};

/** Which plan discount applies: courts for play events, the bar for the social evening, none if free. */
export function eventPrice(e: DEvent, planPct: { court: number; bar: number } | DMember | null) {
  if (e.fee === 0) return 0;
  const pct = !planPct ? 0 : 'court' in planPct ? (e.kind === 'MIXER' ? planPct.bar : planPct.court) : e.kind === 'MIXER' ? planPct.bar_pct : planPct.court_pct;
  return Math.round(e.fee * (100 - pct)) / 100;
}

export const taken = (e: DEvent) => e.base_registered + e.registered.length;

export function PlanPriceTable({ event }: { event: DEvent }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-ink/15 text-left"><th className="eyebrow py-2 text-olive-mid">Plan</th><th className="eyebrow py-2 text-right text-olive-mid">Your price</th></tr>
      </thead>
      <tbody>
        <tr className="border-b border-line"><td className="py-2 text-muted">Non-member / guest</td><td className="py-2 text-right tabular-nums">{event.fee ? formatMoney(event.fee) : 'Free'}</td></tr>
        {planCards.map((p) => {
          const price = eventPrice(event, { court: p.court, bar: p.bar });
          return (
            <tr key={p.id} className="border-b border-line last:border-0"><td className="py-2 font-semibold">{p.name}</td><td className={cn('py-2 text-right tabular-nums', price === 0 && 'font-semibold text-olive')}>{price === 0 ? 'Free' : formatMoney(price)}</td></tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EventFacts({ event }: { event: DEvent }) {
  return (
    <ul className="space-y-1.5 text-sm text-muted">
      <li className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0 text-olive" aria-hidden="true" /> {formatDateIst(event.start_at)}{new Date(event.start_at).toDateString() !== new Date(event.end_at).toDateString() ? ` → ${formatDateIst(event.end_at)}` : ''}</li>
      <li className="flex items-center gap-2"><Sparkles className="size-4 shrink-0 text-olive" aria-hidden="true" /> {formatClockIst(event.start_at)}–{formatClockIst(event.end_at)}</li>
      <li className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-olive" aria-hidden="true" /> {event.location}</li>
    </ul>
  );
}

export function DateBlock({ iso, tone = 'light' }: { iso: string; tone?: 'light' | 'dark' }) {
  const d = new Date(iso);
  return (
    <div className={cn('grid size-16 shrink-0 place-items-center text-center leading-none', tone === 'dark' ? 'bg-olive text-chalk' : 'border border-line bg-sand')}>
      <div>
        <p className="display text-2xl">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' }).format(d)}</p>
        <p className={cn('eyebrow mt-1 !text-[0.6rem]', tone === 'dark' ? 'text-sun' : 'text-olive-mid')}>{new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).format(d)}</p>
      </div>
    </div>
  );
}

export function Capacity({ event }: { event: DEvent }) {
  const t = taken(event);
  const left = Math.max(0, event.capacity - t);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted">{t} registered</span><span className={cn('font-semibold', left <= 3 ? 'text-primary' : 'text-olive')}>{left === 0 ? 'Full' : `${left} spots left`}</span></div>
      <Meter value={t} max={event.capacity} tone={left <= 3 ? 'rust' : 'olive'} />
    </div>
  );
}

export { Pill as EventPill };
