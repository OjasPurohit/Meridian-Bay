import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';

import type { MenuCategory } from '@shared/constants/enums';
import { formatMoney } from '@/lib/format';
import { demo, useDemo } from '../../store/demoStore';
import type { DMenuItem } from '../../store/types';
import { ConfirmDelete, FormModal, type FieldDef, type Values } from '../../ui/forms';
import { btn, Chips, DataTable, Empty, PageHeader, PageSkeleton, Pill, SearchInput, Section, usePageReady, useToast, type Column } from '../../ui/kit';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true, wide: true, placeholder: 'e.g. Masala Chai' },
  { key: 'category', label: 'Category', type: 'select', options: [{ value: 'DRINK', label: 'Drink' }, { value: 'SNACK', label: 'Snack' }, { value: 'FOOD', label: 'Main' }] },
  { key: 'price', label: 'Price (₹, incl. GST)', type: 'number', required: true },
  { key: 'stock', label: 'Stock on hand', type: 'number' },
  { key: 'threshold', label: 'Low-stock alert at', type: 'number' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'available', label: 'Available to order', type: 'toggle' },
];

export function MenuManager() {
  const s = useDemo();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<MenuCategory | 'ALL'>('ALL');
  const [edit, setEdit] = useState<DMenuItem | 'new' | null>(null);
  const [del, setDel] = useState<DMenuItem | null>(null);
  const rows = useMemo(() => s.menu.filter((m) => (cat === 'ALL' || m.category === cat) && (!q || m.name.toLowerCase().includes(q.toLowerCase()))), [s.menu, q, cat]);

  const cols: Column<DMenuItem>[] = [
    { key: 'n', header: 'Product', cell: (m) => <div><p className="font-semibold">{m.name}</p>{m.description && <p className="line-clamp-1 max-w-sm text-xs text-muted">{m.description}</p>}</div> },
    { key: 'c', header: 'Category', hide: 'sm', cell: (m) => <Pill tone="muted">{m.category.toLowerCase()}</Pill> },
    { key: 'p', header: 'Price', align: 'right', cell: (m) => <span className="font-semibold">{formatMoney(m.price)}</span> },
    { key: 's', header: 'Stock', align: 'right', hide: 'sm', cell: (m) => <span className={m.stock <= m.threshold ? 'font-semibold text-primary' : ''}>{m.stock}</span> },
    { key: 'a', header: 'Status', cell: (m) => (m.available ? <Pill tone="green">On menu</Pill> : <Pill tone="muted">Hidden</Pill>) },
    {
      key: 'x',
      header: '',
      align: 'right',
      cell: (m) => (
        <span className="inline-flex gap-1">
          <button type="button" className={btn.quiet} aria-label={`Edit ${m.name}`} onClick={() => setEdit(m)}><Pencil className="size-3.5" /> Edit</button>
          <button type="button" className={btn.danger} aria-label={`Delete ${m.name}`} onClick={() => setDel(m)}><Trash2 className="size-3.5" /></button>
        </span>
      ),
    },
  ];

  const initial: Values = edit && edit !== 'new' ? { name: edit.name, category: edit.category, price: edit.price, stock: edit.stock, threshold: edit.threshold, description: edit.description ?? '', available: edit.available } : { name: '', category: 'SNACK', price: '', stock: 30, threshold: 10, description: '', available: true };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Chips value={cat} onChange={setCat} options={[{ value: 'ALL', label: 'All' }, { value: 'DRINK', label: 'Drinks' }, { value: 'SNACK', label: 'Snacks' }, { value: 'FOOD', label: 'Mains' }]} />
        <div className="flex w-full gap-2 sm:w-auto"><SearchInput value={q} onChange={setQ} placeholder="Search products" className="flex-1 sm:w-60" /><button type="button" className={btn.primary} onClick={() => setEdit('new')}><Plus className="size-4" /> Add</button></div>
      </div>
      <DataTable columns={cols} rows={rows} rowKey={(m) => m.id} empty={<Empty icon={UtensilsCrossed} title="No products" body="Add your first menu item." action={<button type="button" className={btn.primary} onClick={() => setEdit('new')}>Add product</button>} />} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Kitchen products" title={edit === 'new' ? 'Add product' : 'Edit product'} fields={FIELDS} initial={initial} submitLabel={edit === 'new' ? 'Add to menu' : 'Save changes'}
        onSubmit={(v) => {
          demo.saveMenuItem({ id: edit && edit !== 'new' ? edit.id : undefined, name: String(v.name), category: v.category as MenuCategory, price: Number(v.price), stock: Number(v.stock), threshold: Number(v.threshold), description: String(v.description) || null, available: !!v.available });
          toast(edit === 'new' ? `${v.name} added to the menu` : `${v.name} updated`);
          setEdit(null);
        }} />
      <ConfirmDelete open={!!del} onClose={() => setDel(null)} what={del?.name ?? ''} onConfirm={() => { if (del) { demo.removeMenuItem(del.id); toast(`${del.name} deleted`, 'warn'); } setDel(null); }} />
    </>
  );
}

export default function KitchenProducts() {
  const ready = usePageReady();
  if (!ready) return <PageSkeleton rows={1} />;
  return (
    <>
      <PageHeader eyebrow="Kitchen manager" title="Products & prices" />
      <Section eyebrow="Menu" title="Manage products"><MenuManager /></Section>
    </>
  );
}
