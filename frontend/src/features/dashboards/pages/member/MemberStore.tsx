import { useMemo, useState } from 'react';
import { Minus, PackageCheck, Plus, Receipt, ShoppingBag, Truck, Store as StoreIcon, X } from 'lucide-react';

import type { PaymentMethod, ProductCategory } from '@shared/constants/enums';
import { formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GearGlyph, glyphFor } from '@/features/shop/components/GearGlyph';
import { DiscountBanner, MembershipCard, PriceTag, ReceiptModal, useMe, type ReceiptData } from '../../components/MemberBits';
import { SHOP_STATUS, shopFlow } from '../../status';
import { demo, memberDiscount, useDemo } from '../../store/demoStore';
import type { DProduct, DShopOrder } from '../../store/types';
import { btn, Chips, Drawer, Empty, field, Field, Modal, PageHeader, PageSkeleton, Pill, SearchInput, Section, Segmented, Stepper, useToast, usePageReady } from '../../ui/kit';

const CATS: { value: ProductCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All gear' },
  { value: 'RACKET', label: 'Rackets' },
  { value: 'BALL', label: 'Balls' },
  { value: 'SHOES', label: 'Shoes' },
  { value: 'ACCESSORY', label: 'Accessories' },
  { value: 'APPAREL', label: 'Apparel' },
];

const stockPill = (p: DProduct) => (p.stock === 0 ? <Pill tone="rust">Out of stock</Pill> : p.stock <= p.threshold ? <Pill tone="sun">Only {p.stock} left</Pill> : <Pill tone="green">In stock</Pill>);

export function orderReceipt(o: DShopOrder, memberCode?: string): ReceiptData {
  return { title: `Order ${o.number}`, number: o.number, at: o.created_at, customer: o.customer, memberCode, lines: o.lines, subtotal: o.subtotal, discount: o.discount, delivery: o.delivery_fee, total: o.total, method: o.method, paid: true, note: o.fulfillment === 'DELIVERY' ? `Delivering to ${o.address}` : o.fulfillment === 'PICKUP' ? 'Collect from the club shop' : null };
}

export default function MemberStore() {
  const ready = usePageReady();
  const s = useDemo();
  const me = useMe();
  const toast = useToast();
  const [cat, setCat] = useState<ProductCategory | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<DProduct | null>(null);
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [basketOpen, setBasketOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const pct = memberDiscount(me, 'shop');

  const products = useMemo(() => s.products.filter((p) => p.active && (cat === 'ALL' || p.category === cat) && (!q || `${p.name} ${p.brand}`.toLowerCase().includes(q.toLowerCase()))), [s.products, cat, q]);
  const orders = useMemo(() => s.shopOrders.filter((o) => o.member_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)), [s.shopOrders, me.id]);
  const count = Object.values(basket).reduce((a, b) => a + b, 0);

  const add = (id: string, n = 1) => {
    const p = s.products.find((x) => x.id === id)!;
    setBasket((b) => ({ ...b, [id]: Math.min(p.stock, (b[id] ?? 0) + n) }));
  };

  if (!ready) return <PageSkeleton rows={2} />;

  return (
    <>
      <PageHeader eyebrow="Club store" title="Gear up for your next match">
        <button type="button" onClick={() => setBasketOpen(true)} className={cn(btn.primary, 'relative')}>
          <ShoppingBag className="size-4" aria-hidden="true" /> Basket
          {count > 0 && <span key={count} className="anim-pop grid min-w-5 place-items-center rounded-full bg-sun px-1.5 text-xs font-bold text-ink">{count}</span>}
        </button>
      </PageHeader>

      <DiscountBanner member={me} area="shop" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Chips value={cat} onChange={setCat} options={CATS} />
        <SearchInput value={q} onChange={setQ} placeholder="Search the store" className="w-full sm:w-72" />
      </div>

      {products.length === 0 ? (
        <div className="mt-5"><Empty icon={ShoppingBag} title="No products found" body="Try another category or search term." /></div>
      ) : (
        <ul key={`${cat}-${q}`} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {products.map((p, i) => (
            <li key={p.id} style={{ ['--d' as string]: `${Math.min(i, 10) * 45}ms` }} className="anim-rise">
              <div className="card-lift group flex h-full flex-col border border-line bg-chalk">
                <button type="button" onClick={() => setDetail(p)} className="relative block overflow-hidden bg-gradient-to-b from-sky/45 to-clay/45 px-6 pt-6 pb-2" aria-label={`Details: ${p.name}`}>
                  <GearGlyph kind={glyphFor(p.category, p.name)} className="mx-auto h-36 w-full transition-transform duration-500 ease-[var(--ease-soft)] group-hover:scale-110 group-hover:-rotate-3" />
                  <span className="absolute top-3 left-3">{stockPill(p)}</span>
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <p className="eyebrow text-olive-mid">{p.brand}</p>
                  <button type="button" onClick={() => setDetail(p)} className="mt-1 text-left font-semibold leading-snug hover:underline">{p.name}</button>
                  <div className="mt-auto pt-4">
                    <PriceTag price={p.price} pct={pct} />
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <button type="button" disabled={p.stock === 0} onClick={() => { add(p.id); toast(`${p.name} added to basket`); }} className={cn(btn.primary, '!min-h-10')}>
                        <Plus className="size-4" aria-hidden="true" /> Add
                      </button>
                      <button type="button" onClick={() => setDetail(p)} className={cn(btn.secondary, '!min-h-10 !px-4')}>Details</button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Section eyebrow="Your purchases" title="Order history & status">
          {orders.length === 0 ? (
            <Empty icon={PackageCheck} title="No orders yet" body="Orders you place in the store are tracked here, from packing to pickup or delivery." />
          ) : (
            <ul className="space-y-4">
              {orders.map((o) => {
                const flow = shopFlow(o.fulfillment);
                const st = SHOP_STATUS[o.status];
                return (
                  <li key={o.id} className="anim-rise border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{o.number} <span className="font-normal text-muted">· {formatDateIst(o.created_at)}</span></p>
                        <p className="text-sm text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
                      </div>
                      <div className="text-right">
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(o.total)}</p>
                      </div>
                    </div>
                    {o.status !== 'CANCELLED' && (
                      <div className="mt-4">
                        <Stepper steps={flow.map((k) => ({ key: k, label: SHOP_STATUS[k].label }))} current={o.status} />
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">{o.fulfillment === 'DELIVERY' ? <Truck className="size-3.5" /> : <StoreIcon className="size-3.5" />}{o.fulfillment === 'DELIVERY' ? `Delivery · ${o.address}` : 'Pickup at the club shop'}</span>
                      <span className="ml-auto flex gap-1">
                        <button type="button" className={btn.quiet} onClick={() => setReceipt(orderReceipt(o, me.code))}><Receipt className="size-3.5" /> Receipt</button>
                        {o.status === 'PLACED' && <button type="button" className={btn.danger} onClick={() => { demo.cancelShopOrder(o.id); toast(`Order ${o.number} cancelled — refund started.`, 'warn'); }}>Cancel</button>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <div className="hidden xl:block"><MembershipCard member={me} compact /></div>
      </div>

      <ProductModal product={detail} pct={pct} onClose={() => setDetail(null)} onAdd={(id, n) => { add(id, n); toast('Added to basket'); setDetail(null); }} />
      <BasketDrawer open={basketOpen} onClose={() => setBasketOpen(false)} basket={basket} setBasket={setBasket} pct={pct} onReceipt={setReceipt} />
      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

function ProductModal({ product: p, pct, onClose, onAdd }: { product: DProduct | null; pct: number; onClose: () => void; onAdd: (id: string, n: number) => void }) {
  const [qty, setQty] = useState(1);
  if (!p) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const memberPrice = Math.round(p.price * (100 - pct)) / 100;
  return (
    <Modal open onClose={onClose} eyebrow={p.brand ?? 'Product'} title={p.name} width="max-w-2xl">
      <div className="grid gap-6 sm:grid-cols-[14rem_1fr]">
        <div className="grid place-items-center bg-gradient-to-b from-sky/45 to-clay/45 p-4"><GearGlyph kind={glyphFor(p.category, p.name)} className="h-40 w-full" /></div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">{stockPill(p)}<Pill tone="muted">{p.category.toLowerCase()}</Pill></div>
          <p className="text-muted">{p.description}</p>
          <dl className="grid grid-cols-2 gap-px border border-line bg-line text-sm">
            <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">SKU</dt><dd className="mt-1 font-semibold">{p.sku}</dd></div>
            <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Availability</dt><dd className="mt-1 font-semibold">{p.stock} in stock</dd></div>
          </dl>
          <PriceTag price={p.price} pct={pct} size="lg" />
          {pct > 0 && <p className="text-xs text-olive-mid">You save {formatMoney(p.price - memberPrice)} as a member.</p>}
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center border border-line">
              <button type="button" aria-label="Decrease" className="grid size-11 place-items-center hover:bg-olive/8" onClick={() => setQty((n) => Math.max(1, n - 1))}><Minus className="size-4" /></button>
              <span className="w-10 text-center font-semibold tabular-nums">{qty}</span>
              <button type="button" aria-label="Increase" className="grid size-11 place-items-center hover:bg-olive/8" onClick={() => setQty((n) => Math.min(p.stock, n + 1))}><Plus className="size-4" /></button>
            </div>
            <button type="button" disabled={p.stock === 0} className={cn(btn.primary, 'flex-1')} onClick={() => onAdd(p.id, qty)}>Add {qty} to basket · {formatRupees(memberPrice * qty)}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function BasketDrawer({ open, onClose, basket, setBasket, pct, onReceipt }: { open: boolean; onClose: () => void; basket: Record<string, number>; setBasket: (b: Record<string, number>) => void; pct: number; onReceipt: (r: ReceiptData) => void }) {
  const s = useDemo();
  const me = useMe();
  const toast = useToast();
  const [fulfil, setFulfil] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<DShopOrder | null>(null);

  const lines = Object.entries(basket).filter(([, n]) => n > 0).map(([id, qty]) => ({ p: s.products.find((x) => x.id === id)!, qty })).filter((l) => l.p);
  const subtotal = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const discount = Math.round(subtotal * pct) / 100;
  const after = subtotal - discount;
  const fee = fulfil === 'DELIVERY' && after < 2000 && after > 0 ? 50 : 0;

  const place = () => {
    const r = demo.placeShopOrder({ member_id: me.id, customer: me.name, lines: lines.map((l) => ({ product_id: l.p.id, qty: l.qty })), fulfillment: fulfil, address, method: 'ONLINE' as PaymentMethod });
    if (!r.ok) return setError(r.message);
    setError(null);
    setPlaced(r.value);
    setBasket({});
    toast(`Order ${r.value.number} placed`);
  };

  const close = () => {
    setPlaced(null);
    setError(null);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      eyebrow="Basket"
      title={placed ? 'Order placed' : 'Your basket'}
      footer={
        placed ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btn.secondary} onClick={() => onReceipt(orderReceipt(placed, me.code))}><Receipt className="size-4" /> Receipt</button>
            <button type="button" className={btn.primary} onClick={close}>Done</button>
          </div>
        ) : lines.length > 0 ? (
          <div className="space-y-2">
            {error && <p role="alert" className="anim-pop border-l-2 border-primary bg-terracotta/10 px-3 py-2 text-sm text-primary">{error}</p>}
            <button type="button" className={cn(btn.primary, 'w-full')} onClick={place} disabled={fulfil === 'DELIVERY' && !address.trim()}>Pay {formatMoney(after + fee)} online</button>
          </div>
        ) : undefined
      }
    >
      {placed ? (
        <div className="anim-fade space-y-4 text-center">
          <svg viewBox="0 0 52 52" className="mx-auto size-20" aria-hidden="true"><circle cx="26" cy="26" r="23" fill="none" stroke="var(--color-olive)" strokeWidth="3" pathLength={1} className="anim-draw" /><path d="M15 27.5 L23 35 L38 18" fill="none" stroke="var(--color-olive)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="anim-draw" style={{ ['--d' as string]: '450ms' }} /></svg>
          <p className="display text-2xl">{placed.number}</p>
          <p className="text-muted">{formatMoney(placed.total)} paid · {placed.fulfillment === 'DELIVERY' ? 'on its way once packed' : 'we’ll let you know when it’s ready for pickup'}.</p>
        </div>
      ) : lines.length === 0 ? (
        <Empty icon={ShoppingBag} title="Your basket is empty" body="Add something from the store and it will show up here." />
      ) : (
        <div className="space-y-5">
          <ul className="divide-y divide-line border-y border-line">
            {lines.map((l) => (
              <li key={l.p.id} className="anim-fade flex items-center gap-3 py-3">
                <GearGlyph kind={glyphFor(l.p.category, l.p.name)} className="h-12 w-16 shrink-0 bg-sky/30" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.p.name}</p>
                  <p className="text-xs text-muted">{formatMoney(l.p.price * (100 - pct) / 100)} each</p>
                </div>
                <div className="inline-flex items-center border border-line">
                  <button type="button" aria-label="Decrease" className="grid size-9 place-items-center hover:bg-olive/8" onClick={() => setBasket({ ...basket, [l.p.id]: l.qty - 1 })}><Minus className="size-3.5" /></button>
                  <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                  <button type="button" aria-label="Increase" className="grid size-9 place-items-center hover:bg-olive/8 disabled:opacity-30" disabled={l.qty >= l.p.stock} onClick={() => setBasket({ ...basket, [l.p.id]: l.qty + 1 })}><Plus className="size-3.5" /></button>
                </div>
                <button type="button" aria-label={`Remove ${l.p.name}`} className="grid size-9 place-items-center text-muted hover:text-primary" onClick={() => setBasket({ ...basket, [l.p.id]: 0 })}><X className="size-4" /></button>
              </li>
            ))}
          </ul>
          <Segmented value={fulfil} onChange={setFulfil} className="w-full" options={[{ value: 'PICKUP', label: <span className="inline-flex items-center gap-1.5"><StoreIcon className="size-4" /> Pickup</span> }, { value: 'DELIVERY', label: <span className="inline-flex items-center gap-1.5"><Truck className="size-4" /> Delivery</span> }]} />
          {fulfil === 'DELIVERY' && <Field label="Delivery address" hint="Free delivery above ₹2,000 after discount; otherwise ₹50."><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={cn(field, 'py-2.5')} placeholder="Flat, building, area, Pune" /></Field>}
          <dl className="space-y-2 border border-line bg-chalk p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(subtotal)}</dd></div>
            {pct > 0 && <div className="flex justify-between text-olive"><dt>Member discount ({pct}%)</dt><dd className="tabular-nums">− {formatMoney(discount)}</dd></div>}
            {fulfil === 'DELIVERY' && <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{fee ? formatMoney(fee) : 'Free'}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">Total</dt><dd className="display text-2xl tabular-nums">{formatMoney(after + fee)}</dd></div>
          </dl>
        </div>
      )}
    </Drawer>
  );
}
