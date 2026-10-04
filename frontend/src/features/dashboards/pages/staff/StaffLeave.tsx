import { useState } from 'react';
import { CalendarOff, Hourglass, Send, Wallet, X } from 'lucide-react';

import { isBackendConfigured } from '@/api/client';
import { formatDateIst, formatRupees } from '@/lib/format';
import { admin } from '../../store/admin';
import { useDemo } from '../../store/demoStore';
import { leaveRequests, myPay } from '../../store/staticData';
import { DEMO_TODAY } from '../../store/types';
import { btn, DataTable, Empty, Field, field, Kpi, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';

type Leave = (typeof leaveRequests)[number];
type Pay = (typeof myPay.payroll)[number];

const short = (d: string) => formatDateIst(d).replace(/^\w+, /, '').replace(/ \d{4}$/, '');
const TONE = { PENDING: 'sun', APPROVED: 'green', REJECTED: 'rust', CANCELLED: 'muted' } as const;
const monthLabel = (d: string) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/** Shared by front desk, kitchen manager and store manager: ask for leave, follow the owner's decision, see own pay. */
export default function StaffLeave() {
  const ready = usePageReady();
  const toast = useToast();
  useDemo(); // re-render when the live store refetches leave and pay
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready) return <PageSkeleton rows={2} />;

  const mine = [...leaveRequests].sort((a, b) => b.submitted.localeCompare(a.submitted));
  const pending = mine.filter((l) => l.status === 'PENDING').length;
  const upcoming = mine.filter((l) => l.status === 'APPROVED' && l.to >= DEMO_TODAY).length;

  const submit = async () => {
    setError(null);
    if (!start || !end) return setError('Choose the first and last day of your leave.');
    if (start < DEMO_TODAY) return setError('Leave cannot start in the past.');
    if (end < start) return setError('The last day must be on or after the first day.');
    setBusy(true);
    const r = await admin.requestLeave({ start_date: start, end_date: end, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    toast('Leave request sent to the owner');
    setStart('');
    setEnd('');
    setReason('');
  };
  const withdraw = async (l: Leave) => {
    const r = await admin.cancelLeave(l.id);
    toast(r.ok ? 'Leave request withdrawn' : r.message, r.ok ? 'ok' : 'warn');
  };

  const cols: Column<Leave>[] = [
    { key: 'd', header: 'Dates', cell: (l) => <span className="font-semibold">{short(l.from)}{l.to !== l.from ? ` – ${short(l.to)}` : ''}</span> },
    { key: 's', header: 'Asked', hide: 'sm', cell: (l) => <span className="text-muted">{short(l.submitted)}</span> },
    { key: 'r', header: 'Reason', hide: 'md', cell: (l) => <span className="line-clamp-2 max-w-56 text-muted">{l.reason ?? '—'}</span> },
    { key: 'st', header: 'Status', cell: (l) => <Pill tone={TONE[l.status as keyof typeof TONE] ?? 'muted'}>{l.status.toLowerCase()}</Pill> },
    { key: 'n', header: 'Owner’s reply', hide: 'md', cell: (l) => <span className="text-xs text-muted">{l.decided_at ? `${l.status === 'APPROVED' ? 'Approved' : 'Rejected'} ${short(l.decided_at)}${l.note ? ` · ${l.note}` : ''}` : '—'}</span> },
    { key: 'x', header: '', align: 'right', cell: (l) => (l.status === 'PENDING' ? <button type="button" className={btn.quiet} aria-label={`Withdraw leave from ${short(l.from)}`} onClick={() => void withdraw(l)}><X className="size-3.5" /> Withdraw</button> : null) },
  ];
  const pcols: Column<Pay>[] = [
    { key: 'm', header: 'Month', cell: (p) => <span className="font-semibold">{monthLabel(p.period)}</span> },
    { key: 'a', header: 'Amount', align: 'right', cell: (p) => formatRupees(p.amount) },
    { key: 'st', header: 'Status', cell: (p) => (p.paid_on ? <Pill tone="green">paid {short(p.paid_on)}</Pill> : <Pill tone="sun">pending</Pill>) },
  ];

  return (
    <>
      <PageHeader eyebrow="My work" title="Leave & pay" />
      {!isBackendConfigured && <p className="mb-6 border-l-2 border-sun bg-sun/10 px-4 py-3 text-sm">This is a preview with sample data. Log in to the live app to send a leave request or see your pay.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={Wallet} label="Monthly salary" value={myPay.salary} format={(n) => formatRupees(Math.round(n))} note="set by the owner" />
        <Kpi tone={pending ? 'sun' : 'chalk'} icon={Hourglass} label="Waiting for the owner" value={pending} note="leave requests" delay={70} />
        <Kpi icon={CalendarOff} label="Approved leave ahead" value={upcoming} delay={140} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Section eyebrow="New request" title="Ask for leave">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day"><input type="date" value={start} min={DEMO_TODAY} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd(e.target.value); }} className={field} /></Field>
              <Field label="Last day"><input type="date" value={end} min={start || DEMO_TODAY} onChange={(e) => setEnd(e.target.value)} className={field} /></Field>
            </div>
            <Field label="Reason" hint="Optional, but it helps the owner decide.">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={`${field} py-2`} placeholder="e.g. Family function" />
            </Field>
            {error && <p role="alert" className="border-l-2 border-primary bg-terracotta/10 px-3 py-2 text-sm text-primary">{error}</p>}
            <button type="submit" disabled={busy || !isBackendConfigured} className={`${btn.primary} w-full`}><Send className="size-4" /> {busy ? 'Sending…' : 'Send request'}</button>
          </form>
        </Section>

        <Section eyebrow="History" title="My leave requests" delay={60}>
          <DataTable columns={cols} rows={mine} rowKey={(l) => l.id} dense empty={<Empty icon={CalendarOff} title="No leave requests yet" body="When you ask for leave it shows here with the owner’s decision." />} />
        </Section>
      </div>

      <Section eyebrow="Salary" title="My pay" className="mt-6" delay={90}>
        <DataTable columns={pcols} rows={myPay.payroll} rowKey={(p) => p.id} dense empty={<Empty icon={Wallet} title="No salary payments yet" body="Your monthly salary payments appear here once the owner records them." />} />
      </Section>
    </>
  );
}
