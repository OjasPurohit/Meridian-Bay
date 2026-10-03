import { useMemo, useState } from 'react';
import { FileText, Printer, ReceiptText, Wallet } from 'lucide-react';

import { formatClockIst, formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { ReceiptModal, type ReceiptData } from '../../components/MemberBits';
import { dayOf, useDemo } from '../../store/demoStore';
import { DEMO_TODAY, type DKOrder } from '../../store/types';
import { btn, DataTable, Empty, Kpi, PageHeader, PageSkeleton, Pill, SearchInput, Section, usePageReady, type Column } from '../../ui/kit';
import { kitchenReceipt } from '../member/MemberKitchen';

export default function KitchenInvoices() {
  const ready = usePageReady();
  const s = useDemo();
  const [q, setQ] = useState('');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const rows = useMemo(() => s.kOrders.filter((o) => o.status !== 'CANCELLED' && (!q || `${o.number} ${o.customer}`.toLowerCase().includes(q.toLowerCase()))), [s.kOrders, q]);
  const todayRows = s.kOrders.filter((o) => o.status !== 'CANCELLED' && dayOf(o.created_at) === DEMO_TODAY);
  const cols: Column<DKOrder>[] = [
    { key: 'n', header: 'Invoice', cell: (o) => <span className="font-mono text-xs font-semibold">INV-{o.number.replace('BO-', 'K')}</span> },
    { key: 'c', header: 'Billed to', cell: (o) => <span className="font-semibold">{o.customer}</span> },
    { key: 'd', header: 'Date', hide: 'sm', cell: (o) => <span className="text-muted">{formatDateIst(o.created_at).replace(/, \d{4}$/, '')} {formatClockIst(o.created_at)}</span> },
    { key: 'm', header: 'Method', hide: 'md', cell: (o) => <span className="text-muted capitalize">{o.method?.toLowerCase() ?? '—'}</span> },
    { key: 's', header: 'Status', cell: (o) => <Pill tone={o.pay === 'PAID' ? 'green' : 'sun'}>{o.pay === 'PAID' ? 'Paid' : 'Unpaid'}</Pill> },
    { key: 't', header: 'Amount', align: 'right', cell: (o) => formatMoney(o.total) },
    { key: 'v', header: '', align: 'right', cell: (o) => <button type="button" className={btn.quiet} onClick={() => setReceipt(kitchenReceipt(o))}><FileText className="size-3.5" /> View</button> },
  ];
  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Kitchen manager" title="Invoices & receipts" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={ReceiptText} label="Invoices today" value={todayRows.length} note="issued from the POS and member app" />
        <Kpi icon={Wallet} label="Billed today" value={todayRows.reduce((a, o) => a + o.total, 0)} format={(n) => formatRupees(Math.round(n))} delay={70} />
        <Kpi tone="sun" icon={Printer} label="Awaiting payment" value={rows.filter((o) => o.pay === 'PENDING').length} note="orders unpaid" delay={140} />
      </div>
      <Section eyebrow="Printable" title="All invoices" action={<SearchInput value={q} onChange={setQ} placeholder="Search invoice or customer" className="w-full sm:w-64" />}>
        <DataTable columns={cols} rows={rows} rowKey={(o) => o.id} onRowClick={(o) => setReceipt(kitchenReceipt(o))} empty={<Empty icon={FileText} title="No invoices" />} />
      </Section>
      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
