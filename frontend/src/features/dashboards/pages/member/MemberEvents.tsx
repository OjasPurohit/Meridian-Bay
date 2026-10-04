import { useMemo, useState } from 'react';
import { Check, Gift } from 'lucide-react';

import { isBackendConfigured } from '@/api/client';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Capacity, DateBlock, EventFacts, eventPhase, eventPrice, KIND, PlanPriceTable, taken } from '../../components/EventBits';
import { useMe } from '../../components/MemberBits';
import { admin } from '../../store/admin';
import { demo, useDemo } from '../../store/demoStore';
import type { DEvent } from '../../store/types';
import { btn, Empty, Modal, PageHeader, PageSkeleton, Pill, usePageReady, useToast } from '../../ui/kit';

function EventCard({ e, joined, price, onOpen, onToggle, live }: { e: DEvent; joined: boolean; price: number; onOpen: () => void; onToggle: () => void; live?: boolean }) {
  const k = KIND[e.kind];
  const full = taken(e) >= e.capacity && !joined;
  return (
    <li className={cn('anim-rise card-lift flex flex-col border bg-chalk', live ? 'border-primary/50' : 'border-line')}>
      <div className="flex gap-4 p-5">
        <DateBlock iso={e.start_at} tone={live ? 'dark' : 'light'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={k.tone}><k.icon className="size-3" aria-hidden="true" /> {k.label}</Pill>
            {live && <Pill tone="rust"><span className="live-dot size-1.5 rounded-full bg-primary text-primary" /> Happening now</Pill>}
            {joined && <Pill tone="green"><Check className="size-3" /> Registered</Pill>}
          </div>
          <button type="button" onClick={onOpen} className="display mt-2 text-left text-2xl leading-tight hover:underline">{e.title}</button>
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5">
        <EventFacts event={e} />
        <Capacity event={e} />
        <div className="flex flex-wrap items-center gap-2 border border-sun/50 bg-sun/12 px-3 py-2 text-sm">
          <Gift className="size-4 text-primary" aria-hidden="true" />
          <span>Your price: <span className="font-semibold">{price === 0 ? 'Free' : formatMoney(price)}</span>{e.fee > 0 && price < e.fee && <s className="ml-2 text-xs text-muted">{formatMoney(e.fee)}</s>}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onToggle} disabled={full} className={cn(joined ? btn.secondary : btn.primary, 'flex-1')}>{joined ? 'Cancel registration' : full ? 'Event full' : price === 0 ? 'Register — free' : `Register · ${formatMoney(price)}`}</button>
          <button type="button" onClick={onOpen} className={btn.secondary}>Details</button>
        </div>
      </div>
    </li>
  );
}

export default function MemberEvents() {
  const ready = usePageReady();
  const s = useDemo();
  const me = useMe();
  const toast = useToast();
  const [open, setOpen] = useState<DEvent | null>(null);
  const current = useMemo(() => s.events.filter((e) => eventPhase(e) === 'LIVE'), [s.events]);
  const upcoming = useMemo(() => s.events.filter((e) => eventPhase(e) === 'UPCOMING'), [s.events]);

  const toggle = async (e: DEvent) => {
    const joined = e.registered.includes(me.id);
    if (isBackendConfigured) {
      // saved in the database first; the card changes when the refetch brings the new state back
      const r = await (joined ? admin.unregisterFromEvent(e.id) : admin.registerForEvent(e.id));
      return toast(r.ok ? (joined ? `Registration cancelled for ${e.title}` : `You’re registered for ${e.title}`) : r.message, r.ok ? undefined : 'warn');
    }
    const r = demo.toggleEvent(e.id, me.id);
    if (!r.ok) return toast(r.message, 'warn');
    toast(r.value.registered.includes(me.id) ? `You’re registered for ${e.title}` : `Registration cancelled for ${e.title}`);
  };

  if (!ready) return <PageSkeleton rows={2} />;
  const live = open ? s.events.find((x) => x.id === open.id) ?? open : null;

  return (
    <>
      <PageHeader eyebrow="Events" title="What’s on at the club" />
      <p className="-mt-3 mb-6 max-w-2xl text-muted">Your {me.plan_name} membership benefits are applied to every price below.</p>

      {current.length > 0 && (
        <>
          <h2 className="display mb-3 text-2xl">Happening now</h2>
          <ul className="mb-8 grid gap-5 lg:grid-cols-2">{current.map((e) => <EventCard key={e.id} e={e} live joined={e.registered.includes(me.id)} price={eventPrice(e, me)} onOpen={() => setOpen(e)} onToggle={() => void toggle(e)} />)}</ul>
        </>
      )}

      <h2 className="display mb-3 text-2xl">Upcoming</h2>
      {upcoming.length === 0 ? (
        <Empty title="No upcoming events" body="New events will appear here." />
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {upcoming.map((e, i) => (
            <div key={e.id} style={{ ['--d' as string]: `${i * 60}ms` }} className="contents"><EventCard e={e} joined={e.registered.includes(me.id)} price={eventPrice(e, me)} onOpen={() => setOpen(e)} onToggle={() => void toggle(e)} /></div>
          ))}
        </ul>
      )}

      <Modal open={!!live} onClose={() => setOpen(null)} eyebrow={live ? KIND[live.kind].label : ''} title={live?.title ?? ''} width="max-w-2xl"
        footer={live && <button type="button" className={cn(live.registered.includes(me.id) ? btn.secondary : btn.primary, 'w-full')} onClick={() => void toggle(live)}>{live.registered.includes(me.id) ? 'Cancel registration' : `Register · ${eventPrice(live, me) === 0 ? 'free' : formatMoney(eventPrice(live, me))}`}</button>}>
        {live && (
          <div className="space-y-5">
            <p className="leading-relaxed text-muted">{live.description}</p>
            <EventFacts event={live} />
            <Capacity event={live} />
            <div>
              <p className="eyebrow mb-1 text-olive-mid">Pricing by membership</p>
              <PlanPriceTable event={live} />
            </div>
            <div>
              <p className="eyebrow mb-2 text-olive-mid">Member benefits</p>
              <ul className="flex flex-wrap gap-2">{live.perks.map((p) => <li key={p}><Pill tone="green">{p}</Pill></li>)}</ul>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
