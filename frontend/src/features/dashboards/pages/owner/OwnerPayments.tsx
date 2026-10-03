import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, FileText, Hourglass, ReceiptText } from 'lucide-react';

import { formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { PendingTable, pendingItems, TransactionTable } from '../../components/PaymentBits';
import { INVOICE_STATUS_LABEL } from '../../status';
import { demo, useDemo } from '../../store/demoStore';
import type { DInvoice } from '../../store/types';
import { btn, DataTable, Empty, Kpi, PageHeader, PageSkeleton, Pill, Section, Segmented, usePageReady, useToast, type Column } from '../../ui/kit';
import { InvoiceModal } from '../business/BizInvoices';

export default function OwnerPayments() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [tab, setTab] = useState<'invoices' | 'payments' | 'pending'>('invoices');
  const [open, setOpen] = useState<string | null>(null);
  const pending = useMemo(() => pendingItems(s), [s]);
  const outstanding = s.invoices.filter((i) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status)).reduce((a, i) => a + i.total - i.paid, 0);
  const received = s.payments.filter((p) => p.status === 'SUCCEEDED').reduce((a, p) => a + p.amount, 0);
  const selected = s.invoices.find((i) => i.id === open) ?? null;

  const cols: Column<DInvoice>[] = [
    { key: 'n', header: 'Invoice', cell: (i) => <span className="font-semibold">{i.number}</span> },
    { key: 'c', header: 'Billed to', cell: (i) => <div><p>{i.client}</p><p className="text-xs text-muted">{i.type === 'BUSINESS' ? 'business client' : 'membership'}</p></div> },
    { key: 'd', header: 'Due', hide: 'sm', cell: (i) => <span className="text-muted">{formatDateIst(i.due_date).replace(/^\w+, /, '')}</span> },
    { key: 's', header: 'Status', cell: (i) => <Pill tone={INVOICE_STATUS_LABEL[i.status].tone}>{INVOICE_STATUS_LABEL[i.status].label}</Pill> },
    { key: 't', header: 'Total', align: 'right', cell: (i) => formatMoney(i.total) },
    { key: 'b', header: 'Balance', align: 'right', hide: 'md', cell: (i) => (i.total - i.paid > 0 && i.status !== 'VOID' && i.status !== 'DRAFT' ? formatMoney(i.total - i.paid) : '—') },
    { key: 'a', header: '', align: 'right', cell: (i) => (['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) ? <button type="button" className={`${btn.secondary} !min-h-9 !px-3 text-xs`} onClick={(e) => { e.stopPropagation(); demo.payInvoice(i.id, 'CARD'); toast(`${i.number} marked as paid`); }}>Mark paid</button> : null) },
  ];

  if (!ready) return <PageSkeleton rows={2} />;
  return (
    <>
      <PageHeader eyebrow="Finance" title="Invoices & payments" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={CircleDollarSign} label="Received (ledger)" value={received} format={(n) => formatRupees(Math.round(n))} note={`${s.payments.length} payments`} />
        <Kpi tone="sun" icon={ReceiptText} label="Invoices outstanding" value={outstanding} format={(n) => formatRupees(Math.round(n))} note={`${s.invoices.filter((i) => i.status === 'OVERDUE').length} overdue`} delay={70} />
        <Kpi icon={Hourglass} label="Pending at desk" value={pending.reduce((a, p) => a + p.amount, 0)} format={(n) => formatRupees(Math.round(n))} note={`${pending.length} bookings / orders`} delay={140} />
        <Kpi icon={CheckCircle2} label="Paid invoices" value={s.invoices.filter((i) => i.status === 'PAID').length} note={`of ${s.invoices.length}`} delay={210} />
      </div>
      <Section eyebrow="One ledger" title={tab === 'invoices' ? 'Invoices' : tab === 'payments' ? 'All payments' : 'Pending payments'} action={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'invoices', label: 'Invoices' }, { value: 'payments', label: 'Payments' }, { value: 'pending', label: 'Pending', count: pending.length }]} />}>
        <div key={tab} className="anim-fade">
          {tab === 'invoices' && <DataTable columns={cols} rows={s.invoices} rowKey={(i) => i.id} onRowClick={(i) => setOpen(i.id)} empty={<Empty icon={FileText} title="No invoices" />} />}
          {tab === 'payments' && <TransactionTable rows={s.payments} limit={25} />}
          {tab === 'pending' && <PendingTable />}
        </div>
      </Section>
      <InvoiceModal inv={selected} onClose={() => setOpen(null)} />
    </>
  );
}
