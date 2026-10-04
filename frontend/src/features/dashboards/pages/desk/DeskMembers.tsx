import { useMemo, useState, type ReactNode } from 'react';
import { Users } from 'lucide-react';

import { formatDateIst } from '@/lib/format';
import { MemberCard, MembershipStatus } from '../../components/MemberLookup';
import { useDemo } from '../../store/demoStore';
import { ALL_MEMBERS } from '../../store/staticData';
import type { DMember } from '../../store/types';
import { Avatar, btn, Chips, DataTable, Drawer, Empty, PageHeader, PageSkeleton, Pill, SearchInput, Section, usePageReady, type Column } from '../../ui/kit';

type Filter = 'ALL' | 'ACTIVE' | 'EXPIRING' | 'LAPSED';

/** `actions` (owner only) adds management buttons under the member card in the drawer. */
export function MembersTable({ pageSize = 12, actions }: { pageSize?: number; actions?: (m: DMember) => ReactNode }) {
  const store = useDemo(); // the live store refills ALL_MEMBERS in place: re-render when it does
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('ALL');
  const [limit, setLimit] = useState(pageSize);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (ALL_MEMBERS.find((m) => m.id === openId) ?? null) : null;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ALL_MEMBERS.filter((m) => {
      if (f === 'ACTIVE' && m.status !== 'ACTIVE') return false;
      if (f === 'EXPIRING' && !(m.status === 'ACTIVE' && (m.days_left ?? 999) <= 30)) return false;
      if (f === 'LAPSED' && !(m.status === 'EXPIRED' || m.status === 'CANCELLED' || m.status === 'NONE')) return false;
      return !t || `${m.name} ${m.code} ${m.phone} ${m.email}`.toLowerCase().includes(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, f, store]);

  const cols: Column<DMember>[] = [
    { key: 'name', header: 'Member', cell: (m) => <div className="flex items-center gap-3"><Avatar name={m.name} size="sm" /><div className="min-w-0"><p className="truncate font-semibold">{m.name}{!m.active && <Pill tone="rust" className="ml-2 align-middle">Deactivated</Pill>}</p><p className="text-xs text-muted">{m.code}</p></div></div> },
    { key: 'plan', header: 'Membership', cell: (m) => <MembershipStatus m={m} /> },
    { key: 'exp', header: 'Expires', hide: 'sm', cell: (m) => (m.end_date ? <span>{formatDateIst(m.end_date).replace(/^\w+, /, '')}<span className="block text-xs text-muted">{m.status === 'ACTIVE' ? `${m.days_left} days left` : 'ended'}</span></span> : '—') },
    { key: 'phone', header: 'Contact', hide: 'md', cell: (m) => <span className="text-muted">{m.phone}</span> },
    { key: 'joined', header: 'Joined', hide: 'lg', cell: (m) => <span className="text-muted">{formatDateIst(m.joined_on).replace(/^\w+, /, '')}</span> },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips value={f} onChange={(v) => { setF(v); setLimit(pageSize); }} options={[{ value: 'ALL', label: `All · ${ALL_MEMBERS.length}` }, { value: 'ACTIVE', label: 'Active' }, { value: 'EXPIRING', label: 'Expiring ≤ 30 d' }, { value: 'LAPSED', label: 'Lapsed / no plan' }]} />
        <SearchInput value={q} onChange={(v) => { setQ(v); setLimit(pageSize); }} placeholder="Search name, number, phone…" className="w-full sm:w-72" />
      </div>
      <DataTable columns={cols} rows={rows.slice(0, limit)} rowKey={(m) => m.id} onRowClick={(m) => setOpenId(m.id)} empty={<Empty icon={Users} title="No members match" body="Try another filter or search term." />} />
      {rows.length > limit && (
        <div className="mt-4 text-center"><button type="button" className={btn.secondary} onClick={() => setLimit((l) => l + pageSize)}>Show more · {rows.length - limit} remaining</button></div>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(null)} eyebrow="Member" title={open?.name ?? ''}>{open && <><MemberCard m={open} />{actions && <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">{actions(open)}</div>}</>}</Drawer>
    </>
  );
}

export default function DeskMembers() {
  const ready = usePageReady();
  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Front desk" title="Members" />
      <Section eyebrow="Search and membership status" title="Member directory"><MembersTable /></Section>
    </>
  );
}
