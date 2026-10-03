import { useMemo, useState } from 'react';
import { Mail, MessageSquare, Phone, UserPlus } from 'lucide-react';

import { formatClockIst, formatDateIst } from '@/lib/format';
import { enquiries } from '../../store/staticData';
import { C, HBars } from '../../ui/charts';
import { btn, Chips, DataTable, Drawer, Kpi, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';

type Enq = (typeof enquiries)[number];
const TONE = { NEW: 'sun', HANDLED: 'green' } as const;

export default function OwnerEnquiries() {
  const ready = usePageReady();
  const toast = useToast();
  const [status, setStatus] = useState<Enq['status'] | 'ALL'>('ALL');
  const [open, setOpen] = useState<Enq | null>(null);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of enquiries) m[e.status] = (m[e.status] ?? 0) + 1;
    return m;
  }, []);
  const rows = enquiries.filter((e) => status === 'ALL' || e.status === status);
  if (!ready) return <PageSkeleton rows={1} />;

  const cols: Column<Enq>[] = [
    { key: 'n', header: 'Name', cell: (e) => <div><p className="font-semibold">{e.name}</p><p className="text-xs text-muted">{e.phone}</p></div> },
    { key: 't', header: 'Type', hide: 'sm', cell: (e) => <Pill tone="muted">{e.type.toLowerCase()}</Pill> },
    { key: 'm', header: 'Message', hide: 'lg', cell: (e) => <span className="line-clamp-1 max-w-sm text-muted">{e.message ?? '—'}</span> },
    { key: 'd', header: 'Received', hide: 'sm', cell: (e) => <span className="text-muted">{formatDateIst(e.created_at).replace(/, \d{4}$/, '')}</span> },
    { key: 's', header: 'Status', cell: (e) => <Pill tone={TONE[e.status]}>{e.status.replace('_', ' ').toLowerCase()}</Pill> },
  ];
  const conv = enquiries.length ? Math.round(((counts.HANDLED ?? 0) / enquiries.length) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="Enquiries" title="Leads & follow-ups" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={MessageSquare} label="Total enquiries" value={enquiries.length} />
        <Kpi tone="sun" icon={UserPlus} label="New · not yet handled" value={counts.NEW ?? 0} delay={70} />
        <Kpi label="Handled" value={counts.HANDLED ?? 0} note="answered by the desk" delay={140} />
        <Kpi label="Handled rate" value={conv} format={(n) => `${Math.round(n)}%`} note="of all enquiries" delay={210} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.8fr]">
        <Section eyebrow="Funnel" title="Pipeline"><HBars color={C.olive} rows={(['NEW', 'HANDLED'] as const).map((k) => ({ label: k.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), value: counts[k] ?? 0 }))} fmt={(n) => String(n)} /></Section>
        <Section eyebrow="Inbox" title="Enquiries" delay={80}>
          <div className="mb-4"><Chips value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'HANDLED', label: 'Handled' }]} /></div>
          <DataTable columns={cols} rows={rows} rowKey={(e) => e.id} onRowClick={setOpen} />
        </Section>
      </div>
      <Drawer open={!!open} onClose={() => setOpen(null)} eyebrow={open?.type.toLowerCase() + ' enquiry'} title={open?.name ?? ''}
        footer={open && <div className="grid grid-cols-2 gap-2"><button type="button" className={btn.secondary} onClick={() => toast(`Marked ${open.name} as handled`)}>Mark handled</button><button type="button" className={btn.primary} onClick={() => { toast(`Quote drafted for ${open.name}`); setOpen(null); }}>Send quote</button></div>}>
        {open && (
          <div className="space-y-4">
            <Pill tone={TONE[open.status]}>{open.status.replace('_', ' ').toLowerCase()}</Pill>
            <p className="leading-relaxed text-muted">{open.message ?? 'No message left.'}</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Phone className="size-4 text-olive" /> <a href={`tel:${open.phone}`} className="hover:underline">{open.phone}</a></li>
              {open.email && <li className="flex items-center gap-2"><Mail className="size-4 text-olive" /> <a href={`mailto:${open.email}`} className="hover:underline">{open.email}</a></li>}
              <li className="text-muted">Received {formatDateIst(open.created_at)} · {formatClockIst(open.created_at)}</li>
            </ul>
          </div>
        )}
      </Drawer>
    </>
  );
}
