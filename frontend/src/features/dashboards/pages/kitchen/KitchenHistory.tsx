import { useMemo, useState } from 'react';
import { History, Receipt } from 'lucide-react';

import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { ReceiptModal, type ReceiptData } from '../../components/MemberBits';
import { KITCHEN_STATUS } from '../../status';
import { useDemo } from '../../store/demoStore';
import type { DKOrder } from '../../store/types';
import { btn, Chips, DataTable, Empty, PageHeader, PageSkeleton, Pill, SearchInput, Section, usePageReady, type Column } from '../../ui/kit';
import { kitchenReceipt } from '../member/MemberKitchen';

export function OrderHistoryTable({ limit }: { limit?: number }) {
  const s = useDemo();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'ALL' | 'SERVED' | 'CANCELLED'>('ALL');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = s.kOrders.filter((o) => (o.status === 'SERVED' || o.status === 'CANCELLED') && (f === 'ALL' || o.status === f) && (!t || `${o.number} ${o.customer} ${o.table ?? ''}`.toLowerCase().includes(t)));
    return limit ? r.slice(0, limit) : r;
  }, [s.kOrders, q, f, limit]);
  const cols: Column<DKOrder>[] = [
    { key: 'n', header: 'Order', cell: (o) => <span className="font-semibold">{o.number}</span> },
    { key: 'c', header: 'Customer', cell: (o) => <div><p>{o.customer}</p><p className="text-xs text-muted">{o.table ?? 'Counter'} · {o.member_id ? 'member' : 'guest'}</p></div> },
    { key: 'i', header: 'Items', hide: 'md', cell: (o) => <span className="line-clamp-1 max-w-64 text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</span> },
    { key: 'w', header: 'When', hide: 'sm', cell: (o) => <span className="text-muted">{formatDateIst(o.created_at).replace(/, \d{4}$/, '')} {formatClockIst(o.created_at)}</span> },
    { key: 's', header: 'Status', cell: (o) => <Pill tone={KITCHEN_STATUS[o.status].tone}>{KITCHEN_STATUS[o.status].label}</Pill> },
    { key: 't', header: 'Total', align: 'right', cell: (o) => formatMoney(o.total) },
    { key: 'r', header: '', align: 'right', cell: (o) => <button type="button" className={btn.quiet} onClick={(e) => { e.stopPropagation(); setReceipt(kitchenReceipt(o)); }}><Receipt className="size-3.5" /> Receipt</button> },
  ];
  return (
    <>
      {!limit && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips value={f} onChange={setF} options={[{ value: 'ALL', label: 'All' }, { value: 'SERVED', label: 'Served' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          <SearchInput value={q} onChange={setQ} placeholder="Search order, customer, table" className="w-full sm:w-72" />
        </div>
      )}
      <DataTable columns={cols} rows={rows} rowKey={(o) => o.id} empty={<Empty icon={History} title="No past orders" />} />
      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

export default function KitchenHistory() {
  const ready = usePageReady();
  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Kitchen manager" title="Previous orders" />
      <Section eyebrow="Completed and cancelled" title="Order history"><OrderHistoryTable /></Section>
    </>
  );
}
