import { useMemo, useState } from 'react';
import { Banknote, CreditCard, Globe, Smartphone, Wallet } from 'lucide-react';

import type { PaymentMethod } from '@shared/constants/enums';
import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { courtById, dayOf, demo, useDemo } from '../store/demoStore';
import { DEMO_NOW, DEMO_TODAY, type DemoState, type DPayment } from '../store/types';
import { btn, DataTable, Empty, Pill, Segmented, useToast, type Column } from '../ui/kit';

export const METHOD_ICON = { CASH: Banknote, CARD: CreditCard, UPI: Smartphone, ONLINE: Globe } as const;
export const CAT_LABEL: Record<DPayment['category'], string> = { COURT: 'Courts', MEMBERSHIP: 'Memberships', SHOP: 'Store', BAR: 'Kitchen & bar', BUSINESS: 'Business' };

export interface Pending {
  key: string;
  kind: 'BOOKING' | 'KITCHEN';
  id: string;
  title: string;
  who: string;
  amount: number;
  when: string;
}

export function pendingItems(s: DemoState): Pending[] {
  const bookings = s.bookings
    .filter((b) => b.pay === 'PENDING' && b.status !== 'CANCELLED')
    .map((b): Pending => ({ key: `b-${b.id}`, kind: 'BOOKING', id: b.id, title: `${courtById(b.court_id)?.name ?? 'Court'} · ${formatDateIst(b.start_at)} ${formatClockIst(b.start_at)}`, who: b.name, amount: b.amount_due, when: b.start_at }));
  const kitchen = s.kOrders
    .filter((o) => o.pay === 'PENDING' && o.status !== 'CANCELLED')
    .map((o): Pending => ({ key: `k-${o.id}`, kind: 'KITCHEN', id: o.id, title: `Kitchen ${o.number}${o.table ? ` · ${o.table}` : ''}`, who: o.customer, amount: o.total, when: o.created_at }));
  return [...bookings, ...kitchen].sort((a, b) => a.when.localeCompare(b.when));
}

export function todayPayments(s: DemoState) {
  return s.payments.filter((p) => p.status === 'SUCCEEDED' && dayOf(p.at) === DEMO_TODAY);
}

export function totalsByMethod(rows: DPayment[]) {
  const m: Record<PaymentMethod, number> = { CASH: 0, CARD: 0, UPI: 0, ONLINE: 0 };
  for (const p of rows) m[p.method] += p.amount;
  return m;
}

export function PendingTable({ limit }: { limit?: number }) {
  const s = useDemo();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const rows = useMemo(() => pendingItems(s), [s]);
  const shown = limit ? rows.slice(0, limit) : rows;
  const collect = (p: Pending) => {
    if (p.kind === 'BOOKING') demo.markBookingPaid(p.id, method);
    else demo.collectKitchenPayment(p.id, method);
    toast(`${formatMoney(p.amount)} collected from ${p.who} (${method.toLowerCase()})`);
  };
  const cols: Column<Pending>[] = [
    { key: 'who', header: 'Customer', cell: (r) => <div><p className="font-semibold">{r.who}</p><p className="text-xs text-muted">{r.title}</p></div> },
    { key: 'amt', header: 'Due', align: 'right', cell: (r) => <span className="font-semibold">{formatMoney(r.amount)}</span> },
    { key: 'act', header: '', align: 'right', cell: (r) => <button type="button" className={cn(btn.primary, '!min-h-9 !px-4')} onClick={() => collect(r)}>Collect</button> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{rows.length} awaiting payment · <span className="font-semibold text-ink">{formatMoney(rows.reduce((a, r) => a + r.amount, 0))}</span></p>
        <Segmented size="sm" value={method} onChange={setMethod} options={[{ value: 'CASH', label: 'Cash' }, { value: 'CARD', label: 'Card' }, { value: 'UPI', label: 'UPI' }]} />
      </div>
      <DataTable columns={cols} rows={shown} rowKey={(r) => r.key} empty={<Empty icon={Wallet} title="All settled" body="No payments are pending right now." />} dense />
    </div>
  );
}

export function TransactionTable({ rows, limit, showCategory = true }: { rows: DPayment[]; limit?: number; showCategory?: boolean }) {
  const list = limit ? rows.slice(0, limit) : rows;
  const cols: Column<DPayment>[] = [
    { key: 'ref', header: 'Ref', hide: 'md', cell: (r) => <span className="font-mono text-xs text-muted">{r.number}</span> },
    { key: 'payer', header: 'Payer', cell: (r) => <span className="font-semibold">{r.payer}</span> },
    ...(showCategory ? [{ key: 'cat', header: 'For', hide: 'sm' as const, cell: (r: DPayment) => <Pill tone="muted">{CAT_LABEL[r.category]}</Pill> }] : []),
    { key: 'm', header: 'Method', hide: 'sm', cell: (r) => { const I = METHOD_ICON[r.method]; return <span className="inline-flex items-center gap-1.5 text-muted"><I className="size-3.5" /> {r.method.toLowerCase()}</span>; } },
    { key: 'at', header: 'When', hide: 'md', cell: (r) => <span className="text-muted">{r.at > DEMO_NOW ? 'Just now' : `${formatDateIst(r.at).replace(/, \d{4}$/, '')} ${formatClockIst(r.at)}`}</span> },
    { key: 'amt', header: 'Amount', align: 'right', cell: (r) => <span className={cn('font-semibold', r.status === 'REFUNDED' && 'text-primary line-through')}>{formatMoney(r.amount)}</span> },
  ];
  return <DataTable columns={cols} rows={list} rowKey={(r) => r.id} dense empty={<Empty icon={Wallet} title="No transactions" />} />;
}
