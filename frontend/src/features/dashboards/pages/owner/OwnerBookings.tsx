import { useMemo, useState } from 'react';
import { CalendarCheck, Gauge, Pencil, Plus, Power, Undo2, Wallet } from 'lucide-react';

import { SPORT_TYPE } from '@shared/constants/enums';
import { isBackendConfigured } from '@/api/client';
import { formatRupees } from '@/lib/format';
import { CourtCalendar } from '../../components/CourtCalendar';
import { admin } from '../../store/admin';
import { dayOf, useDemo } from '../../store/demoStore';
import { periodTotals } from '../../store/selectors';
import { courts, inactiveCourts } from '../../store/staticData';
import { DEMO_TODAY, type DCourt } from '../../store/types';
import { FormModal, type FieldDef } from '../../ui/forms';
import { HBars } from '../../ui/charts';
import { btn, DataTable, Kpi, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';
import { BookingsTable } from '../desk/DeskBookings';

const SPORTS = Object.values(SPORT_TYPE).map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));
const ADD_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Court name', type: 'text', required: true, wide: true },
  { key: 'sport_type', label: 'Sport', type: 'select', options: SPORTS },
  { key: 'rate', label: 'Walk-in rate / hour (₹)', type: 'number', required: true },
  { key: 'surface', label: 'Surface', type: 'text', placeholder: 'Hard court, clay, turf…' },
  { key: 'description', label: 'Description', type: 'textarea', wide: true },
];
const EDIT_FIELDS: FieldDef[] = ADD_FIELDS.filter((f) => f.key !== 'sport_type');

export default function OwnerBookings() {
  const ready = usePageReady();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<DCourt | null>(null);
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

  /** The court list is the `courts` table; every role's list refetches it, so nothing else needs touching. */
  const act = async (job: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string, close: () => void) => {
    const r = await job();
    if (r.ok) {
      toast(done);
      close();
    } else toast(r.message, 'warn');
  };
  const realId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
  const ccols: Column<DCourt>[] = [
    { key: 'n', header: 'Court', cell: (c) => <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted">{c.description ?? ''}</p></div> },
    { key: 's', header: 'Sport', hide: 'sm', cell: (c) => <Pill tone="muted">{c.sport.charAt(0) + c.sport.slice(1).toLowerCase()}</Pill> },
    { key: 'f', header: 'Surface', hide: 'md', cell: (c) => <span className="text-muted">{c.surface ?? '—'}</span> },
    { key: 'r', header: 'Rate / hr', align: 'right', cell: (c) => formatRupees(c.rate) },
    { key: 'x', header: '', align: 'right', cell: (c) => (isBackendConfigured && realId(c.id) ? (
      <span className="inline-flex gap-1">
        <button type="button" className={btn.quiet} aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Pencil className="size-3.5" /> Edit</button>
        <button type="button" className={btn.danger} aria-label={`Deactivate ${c.name}`} onClick={() => void act(() => admin.updateCourt(c.id, { is_active: false }), `${c.name} deactivated`, () => undefined)}><Power className="size-3.5" /> Deactivate</button>
      </span>
    ) : null) },
  ];
  const utilisation = Math.min(96, Math.round((cur.bookings / (courts.length * 14 * 30)) * 100 * 1.9));

  return (
    <>
      <PageHeader eyebrow="Courts & bookings" title="Utilisation and schedule">
        <button type="button" className={btn.primary} onClick={() => setAdding(true)}><Plus className="size-4" /> Add court</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={CalendarCheck} label="Bookings today" value={todays} note="all courts" />
        <Kpi icon={Gauge} label="Court utilisation" value={utilisation} format={(n) => `${Math.round(n)}%`} note="last 30 days" delay={70} />
        <Kpi icon={Wallet} label="Court revenue · 30 d" value={cur.court} format={(n) => formatRupees(Math.round(n))} delay={140} />
        <Kpi tone="sun" icon={Undo2} label="Cancellations" value={cancelled} note="in the schedule window" delay={210} />
      </div>
      <Section eyebrow="Schedule" title="Court calendar" className="!p-4 sm:!p-6"><CourtCalendar mode="desk" /></Section>
      <Section eyebrow="Catalogue" title="Courts" className="mt-6" delay={40}><DataTable columns={ccols} rows={[...courts]} rowKey={(c) => c.id} /></Section>
      {isBackendConfigured && inactiveCourts.length > 0 && (
        <Section eyebrow="Not bookable" title="Deactivated courts" className="mt-6" delay={50}>
          <ul>
            {inactiveCourts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="text-xs text-muted">{c.sport.charAt(0) + c.sport.slice(1).toLowerCase()} · {formatRupees(c.rate)} / hr</span></span>
                <button type="button" className={btn.secondary} aria-label={`Reactivate ${c.name}`} onClick={() => void act(() => admin.updateCourt(c.id, { is_active: true }), `${c.name} reactivated`, () => undefined)}><Power className="size-3.5" /> Reactivate</button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Section eyebrow="Every booking" title="Bookings" delay={60}><BookingsTable /></Section>
        <Section eyebrow="Busiest" title="Bookings per court" delay={120}><HBars rows={util} /></Section>
      </div>

      <FormModal open={adding} onClose={() => setAdding(false)} eyebrow="Courts" title="Add a court" fields={ADD_FIELDS} submitLabel="Add court"
        initial={{ name: '', sport_type: 'TENNIS', rate: 600, surface: '', description: '' }}
        onSubmit={(v) => void act(() => admin.createCourt({ name: String(v.name).trim(), sport_type: String(v.sport_type), walk_in_rate_per_hour: Number(v.rate).toFixed(2), ...(String(v.surface).trim() ? { surface: String(v.surface).trim() } : {}), ...(String(v.description).trim() ? { description: String(v.description).trim() } : {}) }), `${v.name} added`, () => setAdding(false))} />

      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Courts" title={edit ? `Edit ${edit.name}` : 'Edit court'} fields={EDIT_FIELDS} submitLabel="Save changes"
        initial={edit ? { name: edit.name, rate: edit.rate, surface: edit.surface ?? '', description: edit.description ?? '' } : {}}
        onSubmit={(v) => edit && void act(() => admin.updateCourt(edit.id, { name: String(v.name).trim(), walk_in_rate_per_hour: Number(v.rate).toFixed(2), ...(String(v.surface).trim() ? { surface: String(v.surface).trim() } : {}), ...(String(v.description).trim() ? { description: String(v.description).trim() } : {}) }), `${v.name} updated`, () => setEdit(null))} />
    </>
  );
}
