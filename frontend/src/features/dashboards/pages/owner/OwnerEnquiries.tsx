import { useMemo, useState } from 'react';
import { CalendarCheck, Mail, MessageSquare, Phone, UserPlus, X } from 'lucide-react';

import { formatClockIst, formatDateIst } from '@/lib/format';
import { isBackendConfigured } from '@/api/client';
import { SPORT_LABEL } from '@/api/public';
import { admin } from '../../store/admin';
import { useDemo } from '../../store/demoStore';
import { enquiries } from '../../store/staticData';
import { C, HBars } from '../../ui/charts';
import { btn, Chips, DataTable, Drawer, Kpi, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';

type Enq = (typeof enquiries)[number];
const TONE = { NEW: 'sun', HANDLED: 'green' } as const;
/** A trial request reads "awaiting approval" / "approved" / "declined"; every other enquiry keeps new / handled. */
const trialState = (e: Enq) => (e.type !== 'TRIAL' || !e.sport ? e.status.toLowerCase() : e.status === 'NEW' ? 'awaiting approval' : e.booking_id ? 'approved' : 'closed');

export default function OwnerEnquiries() {
  const ready = usePageReady();
  const toast = useToast();
  useDemo(); // re-render when the live store refetches the inbox
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Enq['status'] | 'ALL'>('ALL');
  const [open, setOpen] = useState<Enq | null>(null);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of enquiries) m[e.status] = (m[e.status] ?? 0) + 1;
    return m;
  }, [enquiries.length, enquiries.map((e) => e.status).join()]);
  const pendingTrials = enquiries.filter((e) => e.type === 'TRIAL' && e.status === 'NEW' && e.sport && e.preferred);
  const decide = async (e: Enq, approve: boolean) => {
    setBusy(e.id);
    const r = await (approve ? admin.approveTrial(e.id) : admin.declineTrial(e.id));
    setBusy(null);
    setOpen(null);
    toast(r.ok ? (approve ? `${e.name}'s trial is approved and on the calendar` : `${e.name}'s trial request declined`) : r.message, r.ok ? 'ok' : 'warn');
  };
  const rows = enquiries.filter((e) => status === 'ALL' || e.status === status);
  if (!ready) return <PageSkeleton rows={1} />;

  const cols: Column<Enq>[] = [
    { key: 'n', header: 'Name', cell: (e) => <div><p className="font-semibold">{e.name}</p><p className="text-xs text-muted">{e.phone}</p></div> },
    { key: 't', header: 'Type', hide: 'sm', cell: (e) => <Pill tone="muted">{e.type.toLowerCase()}</Pill> },
    { key: 'm', header: 'Message', hide: 'lg', cell: (e) => <span className="line-clamp-1 max-w-sm text-muted">{e.type === 'TRIAL' && e.sport && e.preferred ? `${SPORT_LABEL[e.sport]} · ${formatDateIst(e.preferred).replace(/, \d{4}$/, '')} ${formatClockIst(e.preferred)}` : (e.message ?? '—')}</span> },
    { key: 'd', header: 'Received', hide: 'sm', cell: (e) => <span className="text-muted">{formatDateIst(e.created_at).replace(/, \d{4}$/, '')}</span> },
    { key: 's', header: 'Status', cell: (e) => <Pill tone={TONE[e.status]}>{trialState(e)}</Pill> },
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
      {pendingTrials.length > 0 && (
        <Section eyebrow="Needs your approval" title={`Trial requests (${pendingTrials.length})`} className="mb-6">
          <ul>
            {pendingTrials.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.name} <span className="font-normal text-muted">· {e.phone}</span></span>
                  <span className="text-xs text-muted">Free {SPORT_LABEL[e.sport!]} trial · {formatDateIst(e.preferred!)} at {formatClockIst(e.preferred!)} IST</span>
                </span>
                {isBackendConfigured ? (
                  <span className="flex gap-2">
                    <button type="button" className={btn.secondary} disabled={busy === e.id} aria-label={`Decline ${e.name}'s trial`} onClick={() => void decide(e, false)}><X className="size-3.5" /> Decline</button>
                    <button type="button" className={btn.primary} disabled={busy === e.id} aria-label={`Approve ${e.name}'s trial`} onClick={() => void decide(e, true)}><CalendarCheck className="size-3.5" /> Approve & book</button>
                  </span>
                ) : <span className="text-xs text-muted">Log in to the live app to approve</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.8fr]">
        <Section eyebrow="Funnel" title="Pipeline"><HBars color={C.olive} rows={(['NEW', 'HANDLED'] as const).map((k) => ({ label: k.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), value: counts[k] ?? 0 }))} fmt={(n) => String(n)} /></Section>
        <Section eyebrow="Inbox" title="Enquiries" delay={80}>
          <div className="mb-4"><Chips value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'HANDLED', label: 'Handled' }]} /></div>
          <DataTable columns={cols} rows={rows} rowKey={(e) => e.id} onRowClick={setOpen} />
        </Section>
      </div>
      <Drawer open={!!open} onClose={() => setOpen(null)} eyebrow={open?.type.toLowerCase() + ' enquiry'} title={open?.name ?? ''}
        footer={open && open.type === 'TRIAL' && open.status === 'NEW' && open.sport && open.preferred ? (
          <div className="grid grid-cols-2 gap-2"><button type="button" className={btn.secondary} disabled={busy === open.id} onClick={() => void decide(open, false)}>Decline</button><button type="button" className={btn.primary} disabled={busy === open.id} onClick={() => void decide(open, true)}>Approve & book</button></div>
        ) : open && <div className="grid grid-cols-2 gap-2"><button type="button" className={btn.secondary} onClick={() => toast(`Marked ${open.name} as handled`)}>Mark handled</button><button type="button" className={btn.primary} onClick={() => { toast(`Quote drafted for ${open.name}`); setOpen(null); }}>Send quote</button></div>}>
        {open && (
          <div className="space-y-4">
            <Pill tone={TONE[open.status]}>{trialState(open)}</Pill>
            {open.type === 'TRIAL' && open.sport && open.preferred && <p className="font-semibold">Free {SPORT_LABEL[open.sport]} trial · {formatDateIst(open.preferred)} at {formatClockIst(open.preferred)} IST</p>}
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
