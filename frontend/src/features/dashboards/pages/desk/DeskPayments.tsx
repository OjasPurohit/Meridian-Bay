import { useMemo } from 'react';
import { Clock, Landmark, ReceiptText, Wallet } from 'lucide-react';

import { formatRupees } from '@/lib/format';
import { CAT_LABEL, PendingTable, pendingItems, todayPayments, totalsByMethod, TransactionTable } from '../../components/PaymentBits';
import { useDemo } from '../../store/demoStore';
import { C, Donut } from '../../ui/charts';
import { Kpi, PageHeader, PageSkeleton, Section, usePageReady } from '../../ui/kit';

export default function DeskPayments() {
  const ready = usePageReady();
  const s = useDemo();
  const today = useMemo(() => todayPayments(s), [s]);
  const pending = useMemo(() => pendingItems(s), [s]);
  const methods = totalsByMethod(today);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of today) m.set(p.category, (m.get(p.category) ?? 0) + p.amount);
    return [...m].map(([k, v], i) => ({ label: CAT_LABEL[k as keyof typeof CAT_LABEL], value: v, color: [C.olive, C.terracotta, C.sun, C.moss, C.sky][i % 5] }));
  }, [today]);
  if (!ready) return <PageSkeleton rows={2} />;
  const total = today.reduce((a, p) => a + p.amount, 0);

  return (
    <>
      <PageHeader eyebrow="Front desk" title="Payments & takings" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Wallet} label="Collected today" value={total} format={(n) => formatRupees(Math.round(n))} note={`${today.length} payments`} />
        <Kpi tone="sun" icon={Clock} label="Pending" value={pending.reduce((a, p) => a + p.amount, 0)} format={(n) => formatRupees(Math.round(n))} note={`${pending.length} outstanding`} delay={70} />
        <Kpi icon={Landmark} label="Cash in drawer" value={methods.CASH} format={(n) => formatRupees(Math.round(n))} note="cash today" delay={140} />
        <Kpi icon={ReceiptText} label="Card + UPI + online" value={methods.CARD + methods.UPI + methods.ONLINE} format={(n) => formatRupees(Math.round(n))} note="digital today" delay={210} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Section eyebrow="Awaiting payment" title="Pending payments"><PendingTable /></Section>
        <Section eyebrow="Today" title="By source" delay={80}>{byCat.length ? <Donut slices={byCat} fmt={(n) => formatRupees(Math.round(n))} sub="collected today" /> : <p className="text-sm text-muted">No takings yet today.</p>}</Section>
      </div>
      <Section eyebrow="Ledger" title="Recent transactions" className="mt-6" delay={140}><TransactionTable rows={s.payments} limit={14} /></Section>
    </>
  );
}
