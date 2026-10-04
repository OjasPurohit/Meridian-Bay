import { AlertTriangle, Boxes, PackagePlus } from 'lucide-react';

import { isBackendConfigured } from '@/api/client';
import { StockStepper } from '../../components/StockStepper';
import { demo, useDemo } from '../../store/demoStore';
import type { DMenuItem } from '../../store/types';
import { btn, DataTable, Kpi, Meter, PageHeader, PageSkeleton, Pill, Section, usePageReady, type Column } from '../../ui/kit';

export function StockTable() {
  const s = useDemo();
  const cols: Column<DMenuItem>[] = [
    { key: 'n', header: 'Item', cell: (m) => <div><p className="font-semibold">{m.name}</p><p className="text-xs text-muted capitalize">{m.category.toLowerCase()}</p></div> },
    { key: 'lvl', header: 'Level', hide: 'sm', cell: (m) => <div className="w-36"><Meter value={m.stock} max={80} tone={m.stock === 0 ? 'rust' : m.stock <= m.threshold ? 'sun' : 'olive'} /></div> },
    { key: 'q', header: 'In stock', align: 'right', cell: (m) => <span className="font-semibold">{m.stock}</span> },
    { key: 's', header: 'Status', cell: (m) => (!m.available ? <Pill tone="muted">Off menu</Pill> : m.stock === 0 ? <Pill tone="rust">Out</Pill> : m.stock <= m.threshold ? <Pill tone="sun">Low</Pill> : <Pill tone="green">OK</Pill>) },
    {
      key: 'a',
      header: 'Adjust',
      align: 'right',
      cell: (m) => (
        isBackendConfigured ? <span className="text-xs text-muted">not tracked</span> : <StockStepper name={m.name} stock={m.stock} onChange={(d) => demo.adjustMenuStock(m.id, d)} />

      ),
    },
  ];
  return <DataTable columns={cols} rows={[...s.menu].sort((a, b) => a.stock - b.stock)} rowKey={(m) => m.id} dense />;
}

export default function KitchenStock() {
  const ready = usePageReady();
  const s = useDemo();
  const low = s.menu.filter((m) => m.available && m.stock > 0 && m.stock <= m.threshold);
  const out = s.menu.filter((m) => m.stock === 0);
  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Kitchen manager" title="Stock levels" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={Boxes} label="Items tracked" value={s.menu.length} note="on the menu" />
        <Kpi tone="sun" icon={AlertTriangle} label="Running low" value={low.length} note={low.map((m) => m.name).slice(0, 2).join(', ') || 'all healthy'} delay={70} />
        <Kpi icon={PackagePlus} label="Out of stock" value={out.length} note="unavailable to order" delay={140} tone={out.length ? 'rust' : 'chalk'} />
      </div>
      <Section eyebrow="Live" title="Kitchen stock" action={<span className="text-xs text-muted">Orders deduct stock automatically</span>}><StockTable /></Section>
    </>
  );
}
