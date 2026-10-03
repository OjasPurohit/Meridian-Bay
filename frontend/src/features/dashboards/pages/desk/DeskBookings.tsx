import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';

import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { BookingDrawer } from '../../components/BookingDrawers';
import { BOOKING_STATUS_LABEL } from '../../status';
import { courtById, useDemo } from '../../store/demoStore';
import { DEMO_NOW, type DBooking } from '../../store/types';
import { Chips, DataTable, Empty, PageHeader, PageSkeleton, Pill, SearchInput, Section, usePageReady, type Column } from '../../ui/kit';

type Scope = 'upcoming' | 'today' | 'past' | 'cancelled' | 'all';

export function BookingsTable({ mode = 'desk' }: { mode?: 'desk' }) {
  const s = useDemo();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.parse(DEMO_NOW);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return s.bookings
      .filter((b) => b.kind !== 'MAINTENANCE')
      .filter((b) => {
        const start = Date.parse(b.start_at);
        if (scope === 'cancelled') return b.status === 'CANCELLED';
        if (scope === 'all') return true;
        if (b.status === 'CANCELLED') return false;
        if (scope === 'upcoming') return Date.parse(b.end_at) > now;
        if (scope === 'past') return Date.parse(b.end_at) <= now;
        return new Date(start).toDateString() === new Date(DEMO_NOW).toDateString() || (start > now && start - now < 8 * 3_600_000);
      })
      .filter((b) => !t || `${b.name} ${b.phone ?? ''} ${b.number} ${courtById(b.court_id)?.name}`.toLowerCase().includes(t))
      .sort((a, b) => (scope === 'past' || scope === 'cancelled' ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at)));
  }, [s.bookings, scope, q, now]);

  const cols: Column<DBooking>[] = [
    { key: 'n', header: 'Booking', hide: 'lg', cell: (b) => <span className="font-mono text-xs text-muted">{b.number}</span> },
    { key: 'who', header: 'Customer', cell: (b) => <div><p className="font-semibold">{b.name}</p><p className="text-xs text-muted">{b.phone ?? '—'}</p></div> },
    { key: 'court', header: 'Court', cell: (b) => courtById(b.court_id)?.name },
    { key: 'when', header: 'When', cell: (b) => <div><p>{formatDateIst(b.start_at).replace(/, \d{4}$/, '')}</p><p className="text-xs text-muted">{formatClockIst(b.start_at)}–{formatClockIst(b.end_at)}</p></div> },
    { key: 'st', header: 'Status', cell: (b) => <Pill tone={BOOKING_STATUS_LABEL[b.status].tone}>{BOOKING_STATUS_LABEL[b.status].label}</Pill> },
    { key: 'pay', header: 'Payment', hide: 'sm', cell: (b) => <Pill tone={b.pay === 'PENDING' ? 'sun' : b.pay === 'REFUNDED' ? 'rust' : 'green'}>{b.pay === 'FREE' ? 'Included' : b.pay.toLowerCase()}</Pill> },
    { key: 'amt', header: 'Amount', align: 'right', hide: 'md', cell: (b) => (b.amount_due ? formatMoney(b.amount_due) : '—') },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips value={scope} onChange={setScope} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'today', label: 'Next 8 h' }, { value: 'past', label: 'Played' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search name, phone, court…" className="w-full sm:w-72" />
      </div>
      <DataTable columns={cols} rows={rows} rowKey={(b) => b.id} onRowClick={(b) => setOpen(b.id)} empty={<Empty icon={ClipboardList} title="No bookings here" body="Change the filter or search." />} />
      <BookingDrawer mode={mode} bookingId={open} onClose={() => setOpen(null)} />
    </>
  );
}

export default function DeskBookings() {
  const ready = usePageReady();
  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Front desk" title="Manage bookings" />
      <Section eyebrow="Every court, every customer" title="All bookings">
        <BookingsTable />
      </Section>
    </>
  );
}
