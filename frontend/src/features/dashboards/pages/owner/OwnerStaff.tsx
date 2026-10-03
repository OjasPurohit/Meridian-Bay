import { useState } from 'react';
import { Briefcase, CalendarOff, Check, UserCog, Users, X } from 'lucide-react';

import { formatDateIst, formatRupees } from '@/lib/format';
import { leaveRequests, staff } from '../../store/staticData';
import { Avatar, btn, DataTable, Kpi, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';

type Leave = (typeof leaveRequests)[number];
const ROLE_LABEL: Record<string, string> = { OWNER_ADMIN: 'Owner', FRONT_DESK: 'Front desk', KITCHEN_MANAGER: 'Kitchen', COACH: 'Coach', GROUNDS: 'Grounds', BAR: 'Bar & café' };

export default function OwnerStaff() {
  const ready = usePageReady();
  const toast = useToast();
  const [leave, setLeave] = useState<Leave[]>(leaveRequests);
  if (!ready) return <PageSkeleton rows={2} />;

  const decide = (l: Leave, status: 'APPROVED' | 'REJECTED') => {
    setLeave((rows) => rows.map((r) => (r.id === l.id ? { ...r, status } : r)));
    toast(`${l.staff}’s leave ${status.toLowerCase()}`);
  };
  const pending = leave.filter((l) => l.status === 'PENDING');
  const payroll = staff.reduce((a, s) => a + s.salary, 0);

  const cols: Column<(typeof staff)[number]>[] = [
    { key: 'n', header: 'Employee', cell: (s) => <div className="flex items-center gap-3"><Avatar name={s.name} size="sm" tone="sun" /><div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.designation}</p></div></div> },
    { key: 'r', header: 'Role', hide: 'md', cell: (s) => <Pill tone="muted">{ROLE_LABEL[s.role] ?? s.role}</Pill> },
    { key: 'sh', header: 'Shift today', hide: 'sm', cell: (s) => <span className="text-muted">{s.shift}</span> },
    { key: 'd', header: 'Now', cell: (s) => (s.on_duty ? <Pill tone="green"><span className="live-dot size-1.5 rounded-full bg-olive text-olive" /> On duty</Pill> : <Pill tone="muted">Off</Pill>) },
    { key: 'pay', header: 'Payroll', hide: 'md', cell: (s) => <Pill tone={s.payroll === 'PAID' ? 'green' : 'sun'}>{s.payroll === 'PAID' ? 'Paid' : 'Due'}</Pill> },
    { key: 'sal', header: 'Salary / mo', align: 'right', hide: 'lg', cell: (s) => (s.salary ? formatRupees(s.salary) : '—') },
  ];
  const lcols: Column<Leave>[] = [
    { key: 's', header: 'Employee', cell: (l) => <span className="font-semibold">{l.staff}</span> },
    { key: 't', header: 'Type', hide: 'sm', cell: (l) => <span className="capitalize text-muted">{l.type.toLowerCase()}</span> },
    { key: 'd', header: 'Dates', cell: (l) => <span>{formatDateIst(l.from).replace(/^\w+, /, '').replace(/ \d{4}$/, '')}{l.to !== l.from ? ` – ${formatDateIst(l.to).replace(/^\w+, /, '').replace(/ \d{4}$/, '')}` : ''}</span> },
    { key: 'st', header: 'Status', cell: (l) => <Pill tone={l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'rust' : 'sun'}>{l.status.toLowerCase()}</Pill> },
    { key: 'a', header: '', align: 'right', cell: (l) => (l.status === 'PENDING' ? <span className="inline-flex gap-1"><button type="button" className={`${btn.primary} !min-h-9 !px-3`} onClick={() => decide(l, 'APPROVED')}><Check className="size-4" /> Approve</button><button type="button" aria-label="Reject" className={`${btn.danger} border border-primary/30`} onClick={() => decide(l, 'REJECTED')}><X className="size-4" /></button></span> : null) },
  ];

  return (
    <>
      <PageHeader eyebrow="Staff" title="Team & operations" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Users} label="Team size" value={staff.length} note="employees" />
        <Kpi icon={Briefcase} label="On duty now" value={staff.filter((s) => s.on_duty).length} note="at 5:15 pm" delay={70} />
        <Kpi tone={pending.length ? 'sun' : 'chalk'} icon={CalendarOff} label="Leave to approve" value={pending.length} delay={140} />
        <Kpi icon={UserCog} label="Monthly payroll" value={payroll} format={(n) => formatRupees(Math.round(n))} note={`${staff.filter((s) => s.payroll === 'PAID').length} paid · ${staff.filter((s) => s.payroll !== 'PAID' && s.salary).length} due`} delay={210} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Section eyebrow="Roster" title="Employees"><DataTable columns={cols} rows={staff} rowKey={(s) => s.id} /></Section>
        <Section eyebrow="Approvals" title="Leave requests" delay={80}><DataTable columns={lcols} rows={leave} rowKey={(l) => l.id} dense /></Section>
      </div>
    </>
  );
}
