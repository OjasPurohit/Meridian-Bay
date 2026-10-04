import { useState } from 'react';
import { Clock, Pencil, Power, UserCheck, UserPlus, Users } from 'lucide-react';

import { admin } from '../../store/admin';
import { useDemo } from '../../store/demoStore';
import { ALL_MEMBERS, planCards } from '../../store/staticData';
import type { DMember } from '../../store/types';
import { FormModal, type FieldDef } from '../../ui/forms';
import { btn, Kpi, PageHeader, PageSkeleton, Section, usePageReady, useToast } from '../../ui/kit';
import { MembersTable } from '../desk/DeskMembers';

const apiPhone = (p: string) => p.replace(/[\s()-]/g, '');
const EDIT_FIELDS: FieldDef[] = [
  { key: 'full_name', label: 'Full name', type: 'text', required: true, wide: true },
  { key: 'phone', label: 'Phone', type: 'text', required: true },
  { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
  { key: 'address', label: 'Address', type: 'textarea' },
];

export default function OwnerMembers() {
  const ready = usePageReady();
  const toast = useToast();
  useDemo();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<DMember | null>(null);
  if (!ready) return <PageSkeleton rows={1} />;

  const addFields: FieldDef[] = [
    { key: 'full_name', label: 'Full name', type: 'text', required: true, wide: true },
    { key: 'email', label: 'Email (login)', type: 'email', required: true },
    { key: 'phone', label: 'Phone', type: 'text', required: true, placeholder: '9876543210' },
    { key: 'initial_password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 8 characters, with a letter and a number. Tell the member.' },
    { key: 'date_of_birth', label: 'Date of birth', type: 'date', hint: 'Needed for a Junior plan' },
    { key: 'address', label: 'Address', type: 'text', wide: true },
    { key: 'membership_plan_id', label: 'Membership', type: 'select', options: [{ value: '', label: 'No plan yet' }, ...planCards.map((p) => ({ value: p.id, label: `${p.name} · ₹${p.price.toLocaleString('en-IN')}` }))] },
    { key: 'payment_method', label: 'Paid by (if a plan is chosen)', type: 'select', options: ['CASH', 'CARD', 'UPI'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() })) },
  ];

  const save = async (job: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string, close: () => void) => {
    const r = await job();
    if (r.ok) {
      toast(done);
      close();
    } else toast(r.message, 'warn');
  };

  const active = ALL_MEMBERS.filter((m) => m.status === 'ACTIVE');
  const expiring = active.filter((m) => (m.days_left ?? 99) <= 30);
  const recent = ALL_MEMBERS.filter((m) => m.joined_on >= '2026-09-03');
  return (
    <>
      <PageHeader eyebrow="Members" title="Everyone in the club">
        <button type="button" className={btn.primary} onClick={() => setAdding(true)}><UserPlus className="size-4" /> Add member</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Users} label="Members on record" value={ALL_MEMBERS.length} note="all time" />
        <Kpi icon={UserCheck} label="Active memberships" value={active.length} note={`${Math.round((active.length / Math.max(1, ALL_MEMBERS.length)) * 100)}% of members`} delay={70} />
        <Kpi tone="sun" icon={Clock} label="Renewing in 30 days" value={expiring.length} note="reach out early" delay={140} />
        <Kpi icon={UserPlus} label="Joined in 30 days" value={recent.length} delay={210} />
      </div>
      <Section eyebrow="Directory" title="Members">
        <MembersTable
          pageSize={15}
          actions={(m) => (
            <>
              <dl className="mb-1 w-full space-y-1 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd className="truncate">{m.email}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Phone</dt><dd>{m.phone || '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Address</dt><dd className="text-right">{m.address || '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Date of birth</dt><dd>{m.dob || '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Login</dt><dd>{m.active ? 'Active' : 'Deactivated'}</dd></div>
              </dl>
              {!m.synthetic && (
                <>
                  <button type="button" className={btn.secondary} onClick={() => setEdit(m)}><Pencil className="size-4" /> Edit details</button>
                  <button type="button" className={m.active ? btn.danger : btn.primary} onClick={() => void save(() => admin.setMemberActive(m.id, !m.active), m.active ? `${m.name} deactivated` : `${m.name} reactivated`, () => undefined)}><Power className="size-4" /> {m.active ? 'Deactivate' : 'Reactivate'}</button>
                </>
              )}
            </>
          )}
        />
      </Section>

      <FormModal open={adding} onClose={() => setAdding(false)} eyebrow="Members" title="Add member" fields={addFields} submitLabel="Create member"
        initial={{ full_name: '', email: '', phone: '', initial_password: '', date_of_birth: '', address: '', membership_plan_id: '', payment_method: 'CASH' }}
        onSubmit={(v) => void save(() => admin.createMember({
          full_name: String(v.full_name), email: String(v.email).toLowerCase(), phone: apiPhone(String(v.phone)), initial_password: String(v.initial_password),
          ...(v.date_of_birth ? { date_of_birth: String(v.date_of_birth) } : {}), ...(v.address ? { address: String(v.address) } : {}),
          ...(v.membership_plan_id ? { membership_plan_id: String(v.membership_plan_id), payment_method: String(v.payment_method) } : {}),
        }), `${v.full_name} added`, () => setAdding(false))} />

      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Members" title={edit ? `Edit ${edit.name}` : 'Edit member'} fields={EDIT_FIELDS} submitLabel="Save changes"
        initial={edit ? { full_name: edit.name, phone: edit.phone, date_of_birth: edit.dob ?? '', address: edit.address ?? '' } : {}}
        onSubmit={(v) => edit && void save(() => admin.updateMember(edit.id, { full_name: String(v.full_name), phone: apiPhone(String(v.phone)), ...(v.date_of_birth ? { date_of_birth: String(v.date_of_birth) } : {}), ...(v.address ? { address: String(v.address) } : {}) }), `${v.full_name} updated`, () => setEdit(null))} />
    </>
  );
}
