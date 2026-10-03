import { useMemo, useState } from 'react';
import { Eye, Package, Pencil, Plus, Trash2 } from 'lucide-react';

import { formatMoney, formatRupees } from '@/lib/format';
import { demo, useDemo } from '../../store/demoStore';
import type { BizProduct } from '../../store/types';
import { ConfirmDelete, FormModal, type FieldDef } from '../../ui/forms';
import { btn, Chips, DataTable, Drawer, Empty, Kpi, Meter, PageHeader, PageSkeleton, Pill, SearchInput, Section, usePageReady, useToast, type Column } from '../../ui/kit';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Product name', type: 'text', required: true, wide: true },
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Wearables' },
  { key: 'price', label: 'Selling price (₹)', type: 'number', required: true },
  { key: 'cost', label: 'Cost price (₹)', type: 'number' },
  { key: 'stock', label: 'Stock (units)', type: 'number' },
  { key: 'description', label: 'Description', type: 'textarea' },
];

export default function BizStore() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('ALL');
  const [edit, setEdit] = useState<BizProduct | 'new' | null>(null);
  const [view, setView] = useState<BizProduct | null>(null);
  const [del, setDel] = useState<BizProduct | null>(null);
  const cats = ['ALL', ...new Set(s.bizProducts.map((p) => p.category))];
  const rows = useMemo(() => s.bizProducts.filter((p) => (cat === 'ALL' || p.category === cat) && (!q || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()))), [s.bizProducts, q, cat]);
  const stockValue = s.bizProducts.reduce((a, p) => a + p.cost * p.stock, 0);
  const viewLive = view ? s.bizProducts.find((p) => p.id === view.id) ?? view : null;

  const cols: Column<BizProduct>[] = [
    { key: 'n', header: 'Product', cell: (p) => <div><p className="font-semibold">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div> },
    { key: 'c', header: 'Category', hide: 'md', cell: (p) => <Pill tone="muted">{p.category}</Pill> },
    { key: 'p', header: 'Price', align: 'right', cell: (p) => <span className="font-semibold">{formatMoney(p.price).replace(/\.00$/, '')}</span> },
    { key: 'm', header: 'Margin', align: 'right', hide: 'lg', cell: (p) => <span className="text-olive">{Math.round(((p.price - p.cost) / p.price) * 100)}%</span> },
    { key: 's', header: 'Stock', hide: 'sm', cell: (p) => <div className="flex items-center gap-2"><div className="w-20"><Meter value={p.stock} max={120} tone={p.stock < 10 ? 'rust' : p.stock < 25 ? 'sun' : 'olive'} /></div><span className="w-8 text-right tabular-nums">{p.stock}</span></div> },
    { key: 'x', header: '', align: 'right', cell: (p) => (
      <span className="inline-flex gap-0.5">
        <button type="button" className={btn.quiet} aria-label={`View ${p.name}`} onClick={() => setView(p)}><Eye className="size-3.5" /></button>
        <button type="button" className={btn.quiet} aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)}><Pencil className="size-3.5" /></button>
        <button type="button" className={btn.danger} aria-label={`Delete ${p.name}`} onClick={() => setDel(p)}><Trash2 className="size-3.5" /></button>
      </span>
    ) },
  ];

  const initial = edit && edit !== 'new' ? { name: edit.name, sku: edit.sku, category: edit.category, price: edit.price, cost: edit.cost, stock: edit.stock, description: edit.description } : { name: '', sku: '', category: '', price: '', cost: '', stock: 0, description: '' };

  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Business" title="Your store">
        <button type="button" className={btn.primary} onClick={() => setEdit('new')}><Plus className="size-4" /> Add product</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={Package} label="Products" value={s.bizProducts.length} note={`${cats.length - 1} categories`} />
        <Kpi label="Stock value (at cost)" value={stockValue} format={(n) => formatRupees(Math.round(n))} delay={70} />
        <Kpi tone="sun" label="Low stock" value={s.bizProducts.filter((p) => p.stock < 10).length} note="under 10 units" delay={140} />
      </div>
      <Section eyebrow="Catalogue" title="Products" action={<SearchInput value={q} onChange={setQ} placeholder="Search products" className="w-full sm:w-64" />}>
        <div className="mb-4"><Chips value={cat} onChange={setCat} options={cats.map((c) => ({ value: c, label: c === 'ALL' ? 'All' : c }))} /></div>
        <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} onRowClick={setView} empty={<Empty icon={Package} title="No products" body="Add your first product to start selling." action={<button type="button" className={btn.primary} onClick={() => setEdit('new')}>Add product</button>} />} />
      </Section>

      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Store" title={edit === 'new' ? 'Add product' : 'Edit product'} fields={FIELDS} initial={initial} submitLabel={edit === 'new' ? 'Add product' : 'Save changes'}
        onSubmit={(v) => {
          demo.saveBizProduct({ id: edit && edit !== 'new' ? edit.id : undefined, name: String(v.name), sku: String(v.sku) || undefined, category: String(v.category) || 'General', price: Number(v.price), cost: Number(v.cost) || Math.round(Number(v.price) * 0.6), stock: Number(v.stock), description: String(v.description) });
          toast(edit === 'new' ? `${v.name} added` : `${v.name} updated`);
          setEdit(null);
        }} />
      <ConfirmDelete open={!!del} onClose={() => setDel(null)} what={del?.name ?? ''} onConfirm={() => { if (del) { demo.removeBizProduct(del.id); toast(`${del.name} deleted`, 'warn'); } setDel(null); }} />
      <Drawer open={!!viewLive} onClose={() => setView(null)} eyebrow={viewLive?.category ?? ''} title={viewLive?.name ?? ''}
        footer={viewLive && <div className="flex gap-2"><button type="button" className={`${btn.secondary} flex-1`} onClick={() => { setEdit(viewLive); setView(null); }}>Edit</button><button type="button" className={`${btn.danger} flex-1 border border-primary/30`} onClick={() => { setDel(viewLive); setView(null); }}>Delete</button></div>}>
        {viewLive && (
          <div className="space-y-5">
            <p className="text-muted">{viewLive.description || 'No description yet.'}</p>
            <dl className="grid grid-cols-2 gap-px border border-line bg-line text-sm">
              <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">SKU</dt><dd className="mt-1 font-semibold">{viewLive.sku}</dd></div>
              <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Stock</dt><dd className="mt-1 font-semibold">{viewLive.stock} units</dd></div>
              <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Selling price</dt><dd className="display mt-1 text-2xl">{formatMoney(viewLive.price)}</dd></div>
              <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Cost</dt><dd className="mt-1 font-semibold">{formatMoney(viewLive.cost)}</dd><dd className="text-xs text-olive">{Math.round(((viewLive.price - viewLive.cost) / viewLive.price) * 100)}% margin</dd></div>
            </dl>
          </div>
        )}
      </Drawer>
    </>
  );
}
