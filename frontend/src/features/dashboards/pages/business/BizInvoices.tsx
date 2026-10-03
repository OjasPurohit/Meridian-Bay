import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Printer, ReceiptText } from 'lucide-react';

import { formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { INVOICE_STATUS_LABEL } from '../../status';
import { BUSINESS_CLIENT } from '../../store/seed';
import { demo, useDemo } from '../../store/demoStore';
import type { DInvoice } from '../../store/types';
import { btn, Chips, DataTable, Empty, Kpi, Modal, PageHeader, PageSkeleton, Pill, Section, usePageReady, useToast, type Column } from '../../ui/kit';

export function InvoiceModal({ inv, onClose, canPay, onPay }: { inv: DInvoice | null; onClose: () => void; canPay?: boolean; onPay?: (i: DInvoice) => void }) {
  if (!inv) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const due = inv.total - inv.paid;
  const st = INVOICE_STATUS_LABEL[inv.status];
  return (
    <Modal open onClose={onClose} eyebrow={`Invoice ${inv.number}`} title={inv.client} width="max-w-2xl"
      footer={<div className="no-print flex flex-wrap justify-end gap-2"><button type="button" className={btn.secondary} onClick={() => window.print()}><Printer className="size-4" /> Print</button>{canPay && due > 0 && inv.status !== 'VOID' && inv.status !== 'DRAFT' && <button type="button" className={btn.primary} onClick={() => onPay?.(inv)}>Pay {formatMoney(due)} online</button>}</div>}>
      <div className="print-area space-y-5 bg-chalk p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-display text-2xl">Meridian Bay</p><p className="text-xs text-muted">The Champions Club · GSTIN 27AABCM0000A1Z5</p></div>
          <div className="text-right text-sm"><Pill tone={st.tone}>{st.label}</Pill><p className="mt-2 text-muted">Issued {formatDateIst(inv.issue_date)}</p><p className="text-muted">Due {formatDateIst(inv.due_date)}</p></div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ink/20 text-left"><th className="eyebrow py-2 text-olive-mid">Description</th><th className="eyebrow py-2 text-right text-olive-mid">Qty</th><th className="eyebrow py-2 text-right text-olive-mid">Rate</th><th className="eyebrow py-2 text-right text-olive-mid">Amount</th></tr></thead>
          <tbody>{inv.items.map((i, n) => <tr key={n} className="border-b border-line"><td className="py-2 pr-2">{i.description}</td><td className="py-2 text-right tabular-nums">{i.qty}</td><td className="py-2 text-right tabular-nums">{formatMoney(i.unit)}</td><td className="py-2 text-right tabular-nums">{formatMoney(i.total)}</td></tr>)}</tbody>
        </table>
        <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(inv.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">GST (18%)</dt><dd className="tabular-nums">{formatMoney(inv.tax)}</dd></div>
          <div className="flex justify-between border-t border-ink/30 pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(inv.total)}</dd></div>
          <div className="flex justify-between text-olive"><dt>Paid</dt><dd className="tabular-nums">{formatMoney(inv.paid)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{formatMoney(due)}</dd></div>
        </dl>
        {inv.notes && <p className="text-xs text-muted">Note: {inv.notes}</p>}
      </div>
    </Modal>
  );
}

export default function BizInvoices() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [f, setF] = useState<'ALL' | 'OPEN' | 'PAID'>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const mine = useMemo(() => s.invoices.filter((i) => i.client_id === BUSINESS_CLIENT.id && i.status !== 'DRAFT'), [s.invoices]);
  const rows = mine.filter((i) => f === 'ALL' || (f === 'PAID' ? i.status === 'PAID' : i.status !== 'PAID' && i.status !== 'VOID'));
  const outstanding = mine.filter((i) => i.status !== 'VOID').reduce((a, i) => a + i.total - i.paid, 0);
  const overdue = mine.filter((i) => i.status === 'OVERDUE' || (i.status !== 'PAID' && i.due_date < '2026-10-03' && i.status !== 'VOID'));
  const selected = s.invoices.find((i) => i.id === open) ?? null;

  const pay = (i: DInvoice) => {
    demo.payInvoice(i.id, 'ONLINE');
    toast(`Payment received for ${i.number} — thank you`);
  };

  const cols: Column<DInvoice>[] = [
    { key: 'n', header: 'Invoice', cell: (i) => <span className="font-semibold">{i.number}</span> },
    { key: 'd', header: 'Issued', hide: 'sm', cell: (i) => <span className="text-muted">{formatDateIst(i.issue_date).replace(/^\w+, /, '')}</span> },
    { key: 'due', header: 'Due', hide: 'sm', cell: (i) => <span className="text-muted">{formatDateIst(i.due_date).replace(/^\w+, /, '')}</span> },
    { key: 's', header: 'Status', cell: (i) => <Pill tone={INVOICE_STATUS_LABEL[i.status].tone}>{INVOICE_STATUS_LABEL[i.status].label}</Pill> },
    { key: 't', header: 'Total', align: 'right', cell: (i) => formatMoney(i.total) },
    { key: 'b', header: 'Balance', align: 'right', hide: 'md', cell: (i) => (i.total - i.paid > 0 && i.status !== 'VOID' ? <span className="font-semibold">{formatMoney(i.total - i.paid)}</span> : '—') },
    { key: 'a', header: '', align: 'right', cell: (i) => (i.total - i.paid > 0 && i.status !== 'VOID' ? <button type="button" className={`${btn.primary} !min-h-9 !px-4`} onClick={(e) => { e.stopPropagation(); pay(i); }}>Pay</button> : <CheckCircle2 className="ml-auto size-5 text-olive" aria-label="Settled" />) },
  ];

  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow={BUSINESS_CLIENT.company_name} title="Invoices" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={ReceiptText} label="Outstanding" value={outstanding} format={(n) => formatRupees(Math.round(n))} note={`${mine.filter((i) => i.total > i.paid && i.status !== 'VOID').length} open invoices`} />
        <Kpi tone={overdue.length ? 'rust' : 'chalk'} icon={AlertCircle} label="Overdue" value={overdue.length} note={overdue.length ? 'please settle soon' : 'nothing overdue'} delay={70} />
        <Kpi icon={CheckCircle2} label="Paid to date" value={mine.reduce((a, i) => a + i.paid, 0)} format={(n) => formatRupees(Math.round(n))} delay={140} />
      </div>
      <Section eyebrow="Billing from the club" title="Your invoices" action={<Chips value={f} onChange={setF} options={[{ value: 'ALL', label: 'All' }, { value: 'OPEN', label: 'Open' }, { value: 'PAID', label: 'Paid' }]} />}>
        <DataTable columns={cols} rows={rows} rowKey={(i) => i.id} onRowClick={(i) => setOpen(i.id)} empty={<Empty icon={FileText} title="No invoices here" />} />
      </Section>
      <InvoiceModal inv={selected} onClose={() => setOpen(null)} canPay onPay={pay} />
    </>
  );
}
