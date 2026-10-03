import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Boxes, Package, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react';

import type { ProductCategory, ShopOrderStatus } from '@shared/constants/enums';
import { formatClockIst, formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { SHOP_STATUS, shopFlow } from '../../status';
import { demo, useDemo } from '../../store/demoStore';
import type { DProduct, DShopOrder } from '../../store/types';
import { ConfirmDelete, FormModal, type FieldDef } from '../../ui/forms';
import { btn, Chips, DataTable, Empty, Kpi, Meter, PageHeader, PageSkeleton, Pill, SearchInput, Section, Segmented, usePageReady, useToast, type Column } from '../../ui/kit';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Product name', type: 'text', required: true, wide: true },
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'category', label: 'Category', type: 'select', options: ['RACKET', 'BALL', 'SHOES', 'ACCESSORY', 'APPAREL'].map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() })) },
  { key: 'price', label: 'Price (₹, incl. GST)', type: 'number', required: true },
  { key: 'stock', label: 'Stock on hand', type: 'number' },
  { key: 'threshold', label: 'Low-stock alert at', type: 'number' },
  { key: 'description', label: 'Description', type: 'textarea' },
];

export default function OwnerStore() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [tab, setTab] = useState<'inventory' | 'orders'>('inventory');
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [edit, setEdit] = useState<DProduct | 'new' | null>(null);
  const [del, setDel] = useState<DProduct | null>(null);

  const rows = useMemo(() => s.products.filter((p) => (!low || p.stock <= p.threshold) && (!q || `${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(q.toLowerCase()))), [s.products, q, low]);
  const lowCount = s.products.filter((p) => p.stock <= p.threshold).length;
  const value = s.products.reduce((a, p) => a + p.price * p.stock, 0);
  const openOrders = s.shopOrders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));

  const advance = (o: DShopOrder) => {
    const flow = shopFlow(o.fulfillment);
    const next = flow[flow.indexOf(o.status) + 1] as ShopOrderStatus | undefined;
    if (next) {
      demo.setShopStatus(o.id, next);
      toast(`${o.number} → ${SHOP_STATUS[next].label.toLowerCase()}`);
    }
  };

  const pcols: Column<DProduct>[] = [
    { key: 'n', header: 'Product', cell: (p) => <div><p className="font-semibold">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div> },
    { key: 'c', header: 'Category', hide: 'md', cell: (p) => <Pill tone="muted">{p.category.toLowerCase()}</Pill> },
    { key: 'p', header: 'Price', align: 'right', cell: (p) => <span className="font-semibold">{formatMoney(p.price).replace(/\.00$/, '')}</span> },
    { key: 's', header: 'Stock', hide: 'sm', cell: (p) => <div className="flex items-center gap-2"><div className="w-20"><Meter value={p.stock} max={45} tone={p.stock === 0 ? 'rust' : p.stock <= p.threshold ? 'sun' : 'olive'} /></div><span className="w-7 text-right tabular-nums">{p.stock}</span></div> },
    { key: 'st', header: 'Status', cell: (p) => (p.stock === 0 ? <Pill tone="rust">Out</Pill> : p.stock <= p.threshold ? <Pill tone="sun">Low</Pill> : <Pill tone="green">OK</Pill>) },
    { key: 'x', header: '', align: 'right', cell: (p) => (
      <span className="inline-flex items-center gap-0.5">
        <button type="button" className={btn.quiet} onClick={() => { demo.adjustProductStock(p.id, 10); toast(`+10 ${p.name}`); }}>+10</button>
        <button type="button" className={btn.quiet} aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)}><Pencil className="size-3.5" /></button>
        <button type="button" className={btn.danger} aria-label={`Delete ${p.name}`} onClick={() => setDel(p)}><Trash2 className="size-3.5" /></button>
      </span>
    ) },
  ];

  const ocols: Column<DShopOrder>[] = [
    { key: 'n', header: 'Order', cell: (o) => <div><p className="font-semibold">{o.number}</p><p className="text-xs text-muted">{formatDateIst(o.created_at).replace(/, \d{4}$/, '')} {formatClockIst(o.created_at)}</p></div> },
    { key: 'c', header: 'Customer', cell: (o) => <div><p>{o.customer}</p><p className="line-clamp-1 max-w-56 text-xs text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p></div> },
    { key: 'f', header: 'Fulfilment', hide: 'md', cell: (o) => <Pill tone="muted">{o.fulfillment.replace('_', ' ').toLowerCase()}</Pill> },
    { key: 's', header: 'Status', cell: (o) => <Pill tone={SHOP_STATUS[o.status].tone}>{SHOP_STATUS[o.status].label}</Pill> },
    { key: 't', header: 'Total', align: 'right', cell: (o) => formatMoney(o.total) },
    { key: 'a', header: '', align: 'right', cell: (o) => { const flow = shopFlow(o.fulfillment); const next = flow[flow.indexOf(o.status) + 1]; return next && o.status !== 'CANCELLED' ? <button type="button" className={`${btn.secondary} !min-h-9 !px-3 text-xs`} onClick={() => advance(o)}>{SHOP_STATUS[next].label} <ArrowRight className="size-3.5" /></button> : null; } },
  ];

  const initial = edit && edit !== 'new' ? { name: edit.name, sku: edit.sku, brand: edit.brand ?? '', category: edit.category, price: edit.price, stock: edit.stock, threshold: edit.threshold, description: edit.description ?? '' } : { name: '', sku: '', brand: '', category: 'ACCESSORY', price: '', stock: 10, threshold: 5, description: '' };

  if (!ready) return <PageSkeleton rows={2} />;
  return (
    <>
      <PageHeader eyebrow="Store & inventory" title="Gear shop control">
        <button type="button" className={btn.primary} onClick={() => setEdit('new')}><Plus className="size-4" /> Add product</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="olive" icon={Package} label="Products" value={s.products.length} note="active in the store" />
        <Kpi tone={lowCount ? 'rust' : 'chalk'} icon={AlertTriangle} label="Low / out of stock" value={lowCount} note="needs restocking" delay={70} />
        <Kpi icon={Boxes} label="Inventory value" value={value} format={(n) => formatRupees(Math.round(n))} note="at selling price" delay={140} />
        <Kpi icon={ShoppingBag} label="Open orders" value={openOrders.length} note="to pack or deliver" delay={210} tone="sun" />
      </div>
      <Section eyebrow="One shelf, counter + online" title={tab === 'inventory' ? 'Inventory' : 'Store orders'} action={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'inventory', label: 'Inventory' }, { value: 'orders', label: 'Orders', count: openOrders.length }]} />}>
        {tab === 'inventory' ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Chips value={low ? 'low' : 'all'} onChange={(v) => setLow(v === 'low')} options={[{ value: 'all', label: 'All products' }, { value: 'low', label: `Low stock · ${lowCount}` }]} /><SearchInput value={q} onChange={setQ} placeholder="Search products" className="w-full sm:w-64" /></div>
            <DataTable columns={pcols} rows={rows} rowKey={(p) => p.id} empty={<Empty icon={Package} title="No products match" />} />
          </>
        ) : (
          <DataTable columns={ocols} rows={s.shopOrders.slice(0, 20)} rowKey={(o) => o.id} empty={<Empty icon={ShoppingBag} title="No store orders" />} />
        )}
      </Section>
      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Store" title={edit === 'new' ? 'Add product' : 'Edit product'} fields={FIELDS} initial={initial} submitLabel={edit === 'new' ? 'Add product' : 'Save changes'}
        onSubmit={(v) => {
          demo.saveProduct({ id: edit && edit !== 'new' ? edit.id : undefined, name: String(v.name), sku: String(v.sku) || undefined, brand: String(v.brand) || null, category: v.category as ProductCategory, price: Number(v.price), stock: Number(v.stock), threshold: Number(v.threshold), description: String(v.description) || null });
          toast(edit === 'new' ? `${v.name} added` : `${v.name} updated`);
          setEdit(null);
        }} />
      <ConfirmDelete open={!!del} onClose={() => setDel(null)} what={del?.name ?? ''} onConfirm={() => { if (del) { demo.removeProduct(del.id); toast(`${del.name} deleted`, 'warn'); } setDel(null); }} />
    </>
  );
}
