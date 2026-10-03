import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';

import { formatDateIst, formatRupees } from '@/lib/format';
import { istDate } from '@shared/lib/time';
import { useDemo } from '../../store/demoStore';
import { downloadCsv } from '../../store/selectors';
import { btn, Chips, Kpi, PageHeader, PageSkeleton, SearchInput, Section, usePageReady } from '../../ui/kit';
import { BizTxTable } from './BizOverview';

export default function BizHistory() {
  const ready = usePageReady();
  const s = useDemo();
  const [type, setType] = useState<'ALL' | 'SALE' | 'PURCHASE' | 'EXPENSE'>('ALL');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const rows = useMemo(() => s.bizTx.filter((t) => (type === 'ALL' || t.type === type) && (!q || `${t.party} ${t.description} ${t.ref}`.toLowerCase().includes(q.toLowerCase()))), [s.bizTx, type, q]);
  const sum = (t: string) => rows.filter((r) => r.type === t).reduce((a, r) => a + r.amount, 0);

  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Business" title="Transaction history">
        <button type="button" className={btn.secondary} onClick={() => downloadCsv('transactions.csv', ['Ref', 'Date', 'Type', 'Party', 'Description', 'Status', 'Amount'], rows.map((r) => [r.ref, istDate(r.at), r.type, r.party, r.description, r.status, r.amount]))}><Download className="size-4" /> Export CSV</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" label="Sales" value={sum('SALE')} format={(n) => formatRupees(Math.round(n))} note={`${rows.filter((r) => r.type === 'SALE').length} transactions`} />
        <Kpi label="Purchases" value={sum('PURCHASE')} format={(n) => formatRupees(Math.round(n))} delay={70} />
        <Kpi label="Operating expenses" value={sum('EXPENSE')} format={(n) => formatRupees(Math.round(n))} delay={140} />
      </div>
      <Section eyebrow={`Since ${formatDateIst(s.bizTx[s.bizTx.length - 1].at)}`} title="Ledger">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Chips value={type} onChange={(v) => { setType(v); setLimit(25); }} options={[{ value: 'ALL', label: 'Everything' }, { value: 'SALE', label: 'Sales' }, { value: 'PURCHASE', label: 'Purchases' }, { value: 'EXPENSE', label: 'Expenses' }]} />
          <SearchInput value={q} onChange={setQ} placeholder="Search party or reference" className="w-full sm:w-72" />
        </div>
        <BizTxTable rows={rows} limit={limit} />
        {rows.length > limit && <div className="mt-4 text-center"><button type="button" className={btn.secondary} onClick={() => setLimit((l) => l + 25)}>Show more · {rows.length - limit} remaining</button></div>}
      </Section>
    </>
  );
}
