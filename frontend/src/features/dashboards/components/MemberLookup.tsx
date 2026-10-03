import { useMemo, useState } from 'react';
import { Phone, UserSearch } from 'lucide-react';

import { formatDateIst } from '@/lib/format';
import { cn } from '@/lib/utils';
import { courtById, playsUsed, useDemo } from '../store/demoStore';
import { ALL_MEMBERS } from '../store/staticData';
import { DEMO_NOW, DEMO_TODAY, type DMember } from '../store/types';
import { Avatar, Empty, Meter, Pill, SearchInput } from '../ui/kit';

export const MEMBER_STATUS_TONE = { ACTIVE: 'green', EXPIRED: 'rust', CANCELLED: 'rust', NONE: 'muted' } as const;

export function MembershipStatus({ m }: { m: DMember }) {
  return <Pill tone={MEMBER_STATUS_TONE[m.status]}>{m.status === 'ACTIVE' ? `${m.plan_name} · active` : m.status === 'NONE' ? 'No plan' : `${m.plan_name} · ${m.status.toLowerCase()}`}</Pill>;
}

export function MemberCard({ m }: { m: DMember }) {
  const s = useDemo();
  const used = playsUsed(s, m.id, DEMO_TODAY);
  const recent = s.bookings.filter((b) => b.member_id === m.id && b.kind === 'REGULAR').sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, 3);
  return (
    <div className="anim-pop space-y-4 border border-olive/40 bg-olive/5 p-4">
      <div className="flex items-start gap-3">
        <Avatar name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="display text-2xl leading-tight">{m.name}</p>
          <p className="text-sm text-muted">{m.code} · joined {formatDateIst(m.joined_on)}</p>
          <div className="mt-2"><MembershipStatus m={m} /></div>
        </div>
        <a href={`tel:${m.phone.replace(/\s/g, '')}`} className="grid size-10 place-items-center rounded-full border border-line bg-chalk transition-colors hover:border-olive" aria-label={`Call ${m.name}`}><Phone className="size-4" /></a>
      </div>
      <dl className="grid grid-cols-2 gap-px border border-line bg-line text-sm">
        <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Expiry</dt><dd className="mt-1 font-semibold">{m.end_date ? formatDateIst(m.end_date) : '—'}</dd><dd className="text-xs text-muted">{m.status === 'ACTIVE' ? `${m.days_left} days left` : m.status === 'NONE' ? 'walk-in rates' : 'renewal needed'}</dd></div>
        <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Discounts</dt><dd className="mt-1 font-semibold">{m.status === 'ACTIVE' ? `${m.court_pct === 100 ? 'Free' : m.court_pct + '%'} courts` : 'None'}</dd><dd className="text-xs text-muted">{m.status === 'ACTIVE' ? `${m.shop_pct}% store · ${m.bar_pct}% kitchen` : 'standard prices'}</dd></div>
        <div className="col-span-2 bg-chalk p-3">
          <div className="mb-1.5 flex justify-between text-xs"><span className="eyebrow text-olive-mid">Plays today</span><span className="font-semibold">{used} / {m.max_plays}</span></div>
          <Meter value={used} max={m.max_plays} tone={used >= m.max_plays ? 'rust' : 'olive'} />
        </div>
      </dl>
      <div>
        <p className="eyebrow mb-1 text-olive-mid">Recent bookings</p>
        {recent.length === 0 ? <p className="text-sm text-muted">No bookings on record.</p> : (
          <ul className="text-sm">{recent.map((b) => <li key={b.id} className="flex justify-between border-b border-line py-1.5 last:border-0"><span>{courtById(b.court_id)?.name}</span><span className="text-muted">{formatDateIst(b.start_at).replace(/, \d{4}$/, '')}{b.end_at > DEMO_NOW && b.status !== 'CANCELLED' ? ' · upcoming' : ''}</span></li>)}</ul>
        )}
      </div>
    </div>
  );
}

/** Search by name, member number or phone → member card with plan, expiry and today's allowance. */
export function MemberLookup() {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>('02000000-0000-4000-8000-000000000001');
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ALL_MEMBERS.filter((m) => !m.synthetic).slice(0, 5);
    return ALL_MEMBERS.filter((m) => m.name.toLowerCase().includes(t) || m.code.toLowerCase().includes(t) || m.phone.replace(/\s/g, '').includes(t.replace(/\s/g, ''))).slice(0, 6);
  }, [q]);
  const chosen = ALL_MEMBERS.find((m) => m.id === pick) ?? null;
  return (
    <div className="space-y-4">
      <SearchInput value={q} onChange={setQ} placeholder="Name, member no. (CCM-00001) or phone" />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <ul className="divide-y divide-line border border-line bg-chalk">
          {hits.length === 0 && <li><Empty icon={UserSearch} title="No match" body="Check the spelling or try the member number." /></li>}
          {hits.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setPick(m.id)} className={cn('flex min-h-14 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-olive/8', pick === m.id && 'bg-olive/12')}>
                <Avatar name={m.name} size="sm" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="block text-xs text-muted">{m.code}</span></span>
                <Pill tone={MEMBER_STATUS_TONE[m.status]}>{m.status === 'ACTIVE' ? m.plan_name : m.status === 'NONE' ? 'No plan' : m.status.toLowerCase()}</Pill>
              </button>
            </li>
          ))}
        </ul>
        {chosen ? <MemberCard key={chosen.id} m={chosen} /> : <Empty icon={UserSearch} title="Select a member" body="See plan, expiry and allowance at a glance." />}
      </div>
    </div>
  );
}
