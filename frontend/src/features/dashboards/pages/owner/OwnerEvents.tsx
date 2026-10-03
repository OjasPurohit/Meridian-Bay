import { useState } from 'react';
import { CalendarPlus, Ticket, Users } from 'lucide-react';

import { formatMoney, formatRupees } from '@/lib/format';
import { Capacity, DateBlock, EventFacts, eventPhase, KIND, taken } from '../../components/EventBits';
import { demo, useDemo } from '../../store/demoStore';
import type { EventKind } from '../../store/types';
import { FormModal, type FieldDef } from '../../ui/forms';
import { btn, Kpi, PageHeader, PageSkeleton, Pill, usePageReady, useToast } from '../../ui/kit';

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Event title', type: 'text', required: true, wide: true },
  { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'TOURNAMENT', label: 'Tournament' }, { value: 'CLINIC', label: 'Clinic' }, { value: 'CAMP', label: 'Camp' }, { value: 'MIXER', label: 'Social evening' }, { value: 'SOCIAL', label: 'Social play' }] },
  { key: 'location', label: 'Location', type: 'text', required: true },
  { key: 'start', label: 'Starts', type: 'datetime', required: true },
  { key: 'end', label: 'Ends', type: 'datetime', required: true },
  { key: 'capacity', label: 'Capacity', type: 'number', required: true },
  { key: 'fee', label: 'Fee (₹, 0 = free)', type: 'number' },
  { key: 'description', label: 'Description', type: 'textarea' },
];

export default function OwnerEvents() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (!ready) return <PageSkeleton rows={2} />;
  const upcoming = s.events.filter((e) => eventPhase(e) !== 'PAST');
  const regs = upcoming.reduce((a, e) => a + taken(e), 0);
  const est = upcoming.reduce((a, e) => a + taken(e) * e.fee * 0.7, 0);

  return (
    <>
      <PageHeader eyebrow="Events" title="Tournaments, clinics & socials">
        <button type="button" className={btn.primary} onClick={() => setOpen(true)}><CalendarPlus className="size-4" /> Create event</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={Ticket} label="Live & upcoming" value={upcoming.length} />
        <Kpi icon={Users} label="Registrations" value={regs} note="across all events" delay={70} />
        <Kpi tone="sun" label="Projected revenue" value={est} format={(n) => formatRupees(Math.round(n))} note="after member discounts (est.)" delay={140} />
      </div>
      <ul className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {s.events.map((e, i) => {
          const k = KIND[e.kind];
          const phase = eventPhase(e);
          return (
            <li key={e.id} style={{ ['--d' as string]: `${i * 50}ms` }} className="anim-rise card-lift flex flex-col gap-4 border border-line bg-chalk p-5">
              <div className="flex gap-4">
                <DateBlock iso={e.start_at} tone={phase === 'LIVE' ? 'dark' : 'light'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2"><Pill tone={k.tone}><k.icon className="size-3" /> {k.label}</Pill>{phase === 'LIVE' && <Pill tone="rust">Live now</Pill>}{phase === 'PAST' && <Pill tone="muted">Past</Pill>}</div>
                  <p className="display mt-2 text-xl leading-tight">{e.title}</p>
                </div>
              </div>
              <EventFacts event={e} />
              <Capacity event={e} />
              <p className="mt-auto text-sm text-muted">Fee {e.fee ? formatMoney(e.fee).replace(/\.00$/, '') : 'free'} · {e.registered.length} member sign-ups online</p>
            </li>
          );
        })}
      </ul>
      <FormModal open={open} onClose={() => setOpen(false)} eyebrow="Events" title="Create an event" fields={FIELDS} initial={{ title: '', kind: 'CLINIC', location: '', start: '2026-10-12T09:00', end: '2026-10-12T11:00', capacity: 20, fee: 500, description: '' }} submitLabel="Publish event"
        onSubmit={(v) => {
          const toIso = (x: string | number | boolean) => new Date(`${String(x)}:00+05:30`).toISOString();
          demo.addEvent({ title: String(v.title), kind: v.kind as EventKind, description: String(v.description) || 'Details to follow.', start_at: toIso(v.start), end_at: toIso(v.end), location: String(v.location), capacity: Number(v.capacity), fee: Number(v.fee), perks: ['Member discounts apply automatically'] });
          toast(`${v.title} published — members can register now`);
          setOpen(false);
        }} />
    </>
  );
}
