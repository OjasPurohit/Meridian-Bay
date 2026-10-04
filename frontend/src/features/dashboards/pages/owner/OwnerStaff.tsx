import { useState } from 'react';
import { Briefcase, CalendarOff, Check, Inbox, Pencil, Power, UserCog, UserPlus, Users, X } from 'lucide-react';

import type { UserRole } from '@shared/constants/enums';
import { formatDateIst, formatRupees } from '@/lib/format';
import { admin } from '../../store/admin';
import { useDemo } from '../../store/demoStore';
import { applications, leaveRequests, staff } from '../../store/staticData';
import type { DApplication, DStaff } from '../../store/types';
import { FormModal, type FieldDef } from '../../ui/forms';
import { Avatar, btn, DataTable, Empty, Kpi, Modal, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';

type Leave = (typeof leaveRequests)[number];
const ROLE_LABEL: Record<string, string> = { OWNER_ADMIN: 'Owner', FRONT_DESK: 'Front desk', KITCHEN_MANAGER: 'Kitchen', STORE_MANAGER: 'Store manager', COACH: 'Coach', GROUNDS: 'Grounds', BAR: 'Bar & café' };
/** The roles an owner can give an employee. */
const EMPLOYEE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'FRONT_DESK', label: 'Front desk' },
  { value: 'KITCHEN_MANAGER', label: 'Kitchen' },
  { value: 'STORE_MANAGER', label: 'Store manager' },
];
const DEFAULT_DESIGNATION: Record<string, string> = { FRONT_DESK: 'Front Desk Executive', KITCHEN_MANAGER: 'Kitchen Manager', STORE_MANAGER: 'Store Manager' };

const NEW_FIELDS: FieldDef[] = [
  { key: 'full_name', label: 'Full name', type: 'text', required: true, wide: true },
  { key: 'email', label: 'Email (login)', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'text', placeholder: '9876543210' },
  { key: 'role', label: 'Role', type: 'select', options: EMPLOYEE_ROLES.map((r) => ({ value: r.value, label: r.label })) },
  { key: 'designation', label: 'Designation', type: 'text', required: true },
  { key: 'monthly_salary', label: 'Salary / month (₹)', type: 'number', required: true },
  { key: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 8 characters, with a letter and a number.' },
];
const EDIT_FIELDS: FieldDef[] = [
  { key: 'full_name', label: 'Full name', type: 'text', required: true, wide: true },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'designation', label: 'Designation', type: 'text', required: true },
  { key: 'monthly_salary', label: 'Salary / month (₹)', type: 'number', required: true },
];

const money = (n: unknown) => Number(n).toFixed(2);

export default function OwnerStaff() {
  const ready = usePageReady();
  const toast = useToast();
  useDemo(); // re-render when the live store refreshes (staff, applications and leave are filled in place)
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<DStaff | null>(null);
  const [approve, setApprove] = useState<DApplication | null>(null);
  const [decline, setDecline] = useState<DApplication | null>(null);
  const [role, setRole] = useState<UserRole>('FRONT_DESK');
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState<Leave | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ready) return <PageSkeleton rows={2} />;

  /** Runs one API call; closes the dialog only when the database accepted it. */
  const act = async (job: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string, close: () => void) => {
    setBusy(true);
    const r = await job();
    setBusy(false);
    if (r.ok) {
      toast(done);
      close();
    } else toast(r.message, 'warn');
  };

  const pendingApps = applications.filter((a) => a.status === 'PENDING');
  const pending = leaveRequests.filter((l) => l.status === 'PENDING');
  const active = staff.filter((s) => s.active);
  const payroll = active.reduce((a, s) => a + s.salary, 0);
  const realId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

  const cols: Column<DStaff>[] = [
    { key: 'n', header: 'Employee', cell: (s) => <div className="flex items-center gap-3"><Avatar name={s.name} size="sm" tone="sun" /><div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.designation}{s.email ? ` · ${s.email}` : ''}</p></div></div> },
    { key: 'r', header: 'Role', hide: 'md', cell: (s) => <Pill tone="muted">{ROLE_LABEL[s.role] ?? s.role}</Pill> },
    { key: 'sh', header: 'Shift today', hide: 'sm', cell: (s) => <span className="text-muted">{s.shift}</span> },
    { key: 'd', header: 'Status', cell: (s) => (!s.active ? <Pill tone="rust">Deactivated</Pill> : s.on_duty ? <Pill tone="green"><span className="live-dot size-1.5 rounded-full bg-olive text-olive" /> On duty</Pill> : <Pill tone="muted">Off</Pill>) },
    { key: 'pay', header: 'Payroll', hide: 'md', cell: (s) => <Pill tone={s.payroll === 'PAID' ? 'green' : 'sun'}>{s.payroll === 'PAID' ? 'Paid' : 'Due'}</Pill> },
    { key: 'sal', header: 'Salary / mo', align: 'right', hide: 'lg', cell: (s) => (s.salary ? formatRupees(s.salary) : '—') },
    { key: 'x', header: '', align: 'right', cell: (s) => (realId(s.id) && s.role !== 'OWNER_ADMIN' ? (
      <span className="inline-flex gap-1">
        <button type="button" className={btn.quiet} aria-label={`Edit ${s.name}`} onClick={() => setEdit(s)}><Pencil className="size-3.5" /> Edit</button>
        <button type="button" className={s.active ? btn.danger : btn.quiet} aria-label={`${s.active ? 'Deactivate' : 'Reactivate'} ${s.name}`} onClick={() => void act(() => admin.setStaffActive(s.id, !s.active), s.active ? `${s.name} deactivated` : `${s.name} reactivated`, () => undefined)}><Power className="size-3.5" /> {s.active ? 'Deactivate' : 'Reactivate'}</button>
      </span>
    ) : null) },
  ];

  const acols: Column<DApplication>[] = [
    { key: 'n', header: 'Applicant', cell: (a) => <div className="flex items-center gap-3"><Avatar name={a.name} size="sm" /><div><p className="font-semibold">{a.name}</p><p className="text-xs text-muted">{a.email}</p></div></div> },
    { key: 'p', header: 'Phone', hide: 'sm', cell: (a) => <span className="text-muted">{a.phone || '—'}</span> },
    { key: 'd', header: 'Applied', hide: 'sm', cell: (a) => <span className="text-muted">{formatDateIst(a.applied_at).replace(/^\w+, /, '')}</span> },
    { key: 's', header: 'Status', cell: (a) => (a.status === 'PENDING' ? <Pill tone="sun">Pending</Pill> : a.status === 'APPROVED' ? <Pill tone="green">Approved{a.role ? ` · ${ROLE_LABEL[a.role] ?? a.role}` : ''}</Pill> : <Pill tone="rust">Declined</Pill>) },
    { key: 'a', header: '', align: 'right', cell: (a) => (a.status === 'PENDING' ? (
      <span className="inline-flex gap-1">
        <button type="button" className={`${btn.primary} !min-h-9 !px-3`} onClick={() => { setRole('FRONT_DESK'); setApprove(a); }}><Check className="size-4" /> Approve</button>
        <button type="button" className={`${btn.danger} border border-primary/30`} onClick={() => { setNote(''); setDecline(a); }}><X className="size-4" /> Decline</button>
      </span>
    ) : a.note ? <span className="text-xs text-muted">{a.note}</span> : null) },
  ];

  const lcols: Column<Leave>[] = [
    { key: 's', header: 'Employee', cell: (l) => <span className="font-semibold">{l.staff}</span> },
    { key: 'sub', header: 'Asked', hide: 'md', cell: (l) => <span className="text-muted">{formatDateIst(l.submitted).replace(/^\w+, /, '').replace(/ \d{4}$/, '')}</span> },
    { key: 'd', header: 'Dates', cell: (l) => <span>{formatDateIst(l.from).replace(/^\w+, /, '').replace(/ \d{4}$/, '')}{l.to !== l.from ? ` – ${formatDateIst(l.to).replace(/^\w+, /, '').replace(/ \d{4}$/, '')}` : ''}</span> },
    { key: 'rs', header: 'Reason', hide: 'lg', cell: (l) => <span className="line-clamp-2 max-w-48 text-xs text-muted">{l.reason ?? '—'}{l.note ? ` · Owner: ${l.note}` : ''}</span> },
    { key: 'st', header: 'Status', cell: (l) => <Pill tone={l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'rust' : 'sun'}>{l.status.toLowerCase()}</Pill> },
    { key: 'a', header: '', align: 'right', cell: (l) => (l.status === 'PENDING' ? <span className="inline-flex gap-1"><button type="button" className={`${btn.primary} !min-h-9 !px-3`} onClick={() => void act(() => admin.decideLeave(l.id, 'APPROVE'), `${l.staff}’s leave approved`, () => undefined)}><Check className="size-4" /> Approve</button><button type="button" aria-label="Reject" className={`${btn.danger} border border-primary/30`} onClick={() => { setRejectNote(''); setRejecting(l); }}><X className="size-4" /></button></span> : null) },
  ];

  return (
    <>
      <PageHeader eyebrow="Staff" title="Team & operations">
        <button type="button" className={btn.primary} onClick={() => setAdding(true)}><UserPlus className="size-4" /> Add employee</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Users} label="Team size" value={active.length} note={`${staff.length - active.length} deactivated`} />
        <Kpi tone={pendingApps.length ? 'sun' : 'chalk'} icon={Inbox} label="Job applications" value={pendingApps.length} note="waiting for you" delay={70} />
        <Kpi tone={pending.length ? 'sun' : 'chalk'} icon={CalendarOff} label="Leave to approve" value={pending.length} delay={140} />
        <Kpi icon={UserCog} label="Monthly payroll" value={payroll} format={(n) => formatRupees(Math.round(n))} note={`${active.filter((s) => s.payroll === 'PAID').length} paid · ${active.filter((s) => s.payroll !== 'PAID' && s.salary).length} due`} delay={210} />
      </div>

      <Section eyebrow="Hiring" title="Job applications" className="mb-6">
        <DataTable columns={acols} rows={applications} rowKey={(a) => a.id} empty={<Empty icon={Briefcase} title="No job applications" body="People who apply as an employee on the sign-up page appear here." />} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Section eyebrow="Roster" title="Employees"><DataTable columns={cols} rows={staff} rowKey={(s) => s.id} /></Section>
        <Section eyebrow="Approvals" title="Leave requests" delay={80}><DataTable columns={lcols} rows={leaveRequests} rowKey={(l) => l.id} dense /></Section>
      </div>

      <FormModal open={adding} onClose={() => setAdding(false)} eyebrow="Staff" title="Add employee" fields={NEW_FIELDS} submitLabel="Create employee"
        initial={{ full_name: '', email: '', phone: '', role: 'FRONT_DESK', designation: DEFAULT_DESIGNATION.FRONT_DESK!, monthly_salary: 25000, password: '' }}
        onSubmit={(v) => void act(() => admin.createStaff({ full_name: String(v.full_name), email: String(v.email).toLowerCase(), ...(v.phone ? { phone: String(v.phone).replace(/[\s()-]/g, '') } : {}), role: v.role as UserRole, password: String(v.password), designation: String(v.designation), monthly_salary: money(v.monthly_salary) }), `${v.full_name} added`, () => setAdding(false))} />

      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Staff" title={edit ? `Edit ${edit.name}` : 'Edit employee'} fields={EDIT_FIELDS} submitLabel="Save changes"
        initial={edit ? { full_name: edit.name, phone: edit.phone, designation: edit.designation, monthly_salary: edit.salary } : {}}
        onSubmit={(v) => edit && void act(() => admin.updateStaff(edit.id, { full_name: String(v.full_name), ...(v.phone ? { phone: String(v.phone).replace(/[\s()-]/g, '') } : {}), designation: String(v.designation), monthly_salary: money(v.monthly_salary) }), `${v.full_name} updated`, () => setEdit(null))} />

      <Modal open={!!approve} onClose={() => setApprove(null)} eyebrow="Job application" title={approve ? `Approve ${approve.name}` : 'Approve'} width="max-w-md"
        footer={<div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={() => setApprove(null)}>Cancel</button><button type="button" disabled={busy} className={btn.primary} onClick={() => approve && void act(() => admin.approveApplication(approve.id, { role, designation: DEFAULT_DESIGNATION[role] }), `${approve.name} approved as ${ROLE_LABEL[role]?.toLowerCase()}`, () => setApprove(null))}><Check className="size-4" /> Approve as {ROLE_LABEL[role]?.toLowerCase()}</button></div>}>
        <p className="text-sm text-muted">Choose the role. They log in with the email and password they signed up with, and the role decides which dashboard they see.</p>
        <fieldset className="mt-4 grid gap-2">
          <legend className="sr-only">Employee role</legend>
          {EMPLOYEE_ROLES.map((r) => (
            <label key={r.value} className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 ${role === r.value ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid'}`}>
              <input type="radio" name="role" className="sr-only" checked={role === r.value} onChange={() => setRole(r.value)} />
              <span className="font-semibold">{r.label}</span>
            </label>
          ))}
        </fieldset>
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} eyebrow="Leave request" title={rejecting ? `Reject ${rejecting.staff}’s leave` : 'Reject leave'} width="max-w-md"
        footer={<div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={() => setRejecting(null)}>Keep waiting</button><button type="button" disabled={busy || !rejectNote.trim()} className={btn.accent} onClick={() => rejecting && void act(() => admin.decideLeave(rejecting.id, 'REJECT', rejectNote.trim()), `${rejecting.staff}’s leave rejected`, () => setRejecting(null))}>Reject leave</button></div>}>
        <p className="text-sm text-muted">The employee sees this reason on their dashboard.</p>
        <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} maxLength={500} placeholder="Reason (required)" aria-label="Reason for rejecting" className="mt-4 w-full border border-line bg-chalk px-3 py-2 text-sm" />
      </Modal>

      <Modal open={!!decline} onClose={() => setDecline(null)} eyebrow="Job application" title={decline ? `Decline ${decline.name}` : 'Decline'} width="max-w-md"
        footer={<div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={() => setDecline(null)}>Keep waiting</button><button type="button" disabled={busy} className={btn.accent} onClick={() => decline && void act(() => admin.rejectApplication(decline.id, note.trim() || undefined), `${decline.name}’s application declined`, () => setDecline(null))}><X className="size-4" /> Decline</button></div>}>
        <p className="text-sm text-muted">No account is created and they get no access. You can add a note for your records.</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Note (optional)" className="mt-4 w-full border border-line bg-chalk px-3 py-2 text-sm" />
      </Modal>
    </>
  );
}
