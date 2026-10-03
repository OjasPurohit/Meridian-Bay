import { useMemo, useState } from 'react';
import { ChefHat, Coffee, Minus, Plus, Receipt, Sandwich, Soup, UtensilsCrossed } from 'lucide-react';

import type { MenuCategory, PaymentMethod } from '@shared/constants/enums';
import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DiscountBanner, PriceTag, ReceiptModal, useMe, type ReceiptData } from '../../components/MemberBits';
import { KITCHEN_FLOW, KITCHEN_STATUS } from '../../status';
import { demo, memberDiscount, useDemo } from '../../store/demoStore';
import type { DKOrder } from '../../store/types';
import { btn, Chips, Empty, PageHeader, PageSkeleton, Pill, Section, Segmented, Select, Stepper, usePageReady, useToast } from '../../ui/kit';

const ICON: Record<MenuCategory, typeof Coffee> = { DRINK: Coffee, SNACK: Sandwich, FOOD: Soup };
const CATS: { value: MenuCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Everything' },
  { value: 'DRINK', label: 'Drinks' },
  { value: 'SNACK', label: 'Snacks' },
  { value: 'FOOD', label: 'Mains' },
];
const TABLES = ['Counter pickup', ...Array.from({ length: 7 }, (_, i) => `Table ${i + 1}`)];

export function kitchenReceipt(o: DKOrder, code?: string): ReceiptData {
  return { title: `Order ${o.number}`, number: o.number, at: o.created_at, customer: o.customer, memberCode: code, lines: o.lines, subtotal: o.subtotal, discount: o.discount, total: o.total, method: o.method, paid: o.pay === 'PAID', note: o.table ? `Served at ${o.table}` : null };
}

export default function MemberKitchen() {
  const ready = usePageReady();
  const s = useDemo();
  const me = useMe();
  const toast = useToast();
  const [cat, setCat] = useState<MenuCategory | 'ALL'>('ALL');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [table, setTable] = useState(TABLES[1]);
  const [payNow, setPayNow] = useState<'NOW' | 'TAB'>('NOW');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const pct = memberDiscount(me, 'bar');

  const items = useMemo(() => s.menu.filter((m) => cat === 'ALL' || m.category === cat), [s.menu, cat]);
  const orders = useMemo(() => s.kOrders.filter((o) => o.member_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)), [s.kOrders, me.id]);
  const active = orders.filter((o) => o.status !== 'SERVED' && o.status !== 'CANCELLED');
  const past = orders.filter((o) => !active.includes(o));

  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ m: s.menu.find((x) => x.id === id)!, qty })).filter((l) => l.m);
  const subtotal = lines.reduce((a, l) => a + l.m.price * l.qty, 0);
  const discount = Math.round(subtotal * pct) / 100;
  const total = subtotal - discount;
  const count = lines.reduce((a, l) => a + l.qty, 0);

  const set = (id: string, d: number, max: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(max, (c[id] ?? 0) + d)) }));

  const place = () => {
    const method: PaymentMethod | null = payNow === 'NOW' ? 'UPI' : null;
    const r = demo.placeKitchenOrder({ member_id: me.id, customer: me.name, lines: lines.map((l) => ({ menu_id: l.m.id, qty: l.qty })), source: 'MEMBER', table: table === TABLES[0] ? null : table, method, payNow: payNow === 'NOW' });
    if (!r.ok) return setError(r.message);
    setError(null);
    setCart({});
    toast(`Order ${r.value.number} sent to the kitchen`);
  };

  if (!ready) return <PageSkeleton rows={2} />;

  return (
    <>
      <PageHeader eyebrow="Bar & café" title="Fresh from the kitchen, after your match" />
      <DiscountBanner member={me} area="bar" />

      {active.length > 0 && (
        <Section eyebrow="Live" title="Your orders in progress" className="mt-5">
          <ul className="grid gap-4 lg:grid-cols-2">
            {active.map((o) => (
              <li key={o.id} className="anim-rise border border-olive/40 bg-olive/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{o.number} <span className="font-normal text-muted">· {formatClockIst(o.created_at)}</span></p>
                    <p className="text-sm text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
                  </div>
                  <Pill tone={KITCHEN_STATUS[o.status].tone}>{KITCHEN_STATUS[o.status].label}</Pill>
                </div>
                <div className="mt-4"><Stepper steps={KITCHEN_FLOW.map((k) => ({ key: k, label: KITCHEN_STATUS[k].label }))} current={o.status} /></div>
                <p className="mt-3 text-xs text-muted">{o.table ?? 'Counter'} · {formatMoney(o.total)} · {o.pay === 'PAID' ? 'paid' : 'on your tab'} — updates live as the kitchen works.</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1fr_22rem]">
        <div>
          <Chips value={cat} onChange={setCat} options={CATS} />
          <ul key={cat} className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {items.map((m, i) => {
              const Icon = ICON[m.category];
              const n = cart[m.id] ?? 0;
              const unavailable = !m.available || m.stock === 0;
              return (
                <li key={m.id} style={{ ['--d' as string]: `${Math.min(i, 12) * 35}ms` }} className={cn('anim-rise card-lift flex gap-4 border bg-chalk p-4', n > 0 ? 'border-olive' : 'border-line', unavailable && 'opacity-60')}>
                  <span className={cn('grid size-12 shrink-0 place-items-center rounded-full transition-colors duration-300', n > 0 ? 'bg-olive text-chalk' : 'bg-sun/25 text-ink')}><Icon className="size-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{m.name}</p>
                    {m.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{m.description}</p>}
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <PriceTag price={m.price} pct={pct} />
                      {unavailable ? (
                        <Pill tone="rust">Unavailable</Pill>
                      ) : n === 0 ? (
                        <button type="button" onClick={() => set(m.id, 1, m.stock)} className={cn(btn.primary, '!min-h-9 !px-4')}><Plus className="size-4" /> Add</button>
                      ) : (
                        <span className="inline-flex items-center border border-olive">
                          <button type="button" aria-label={`Remove one ${m.name}`} className="grid size-9 place-items-center hover:bg-olive/10" onClick={() => set(m.id, -1, m.stock)}><Minus className="size-3.5" /></button>
                          <span key={n} className="anim-pop w-7 text-center text-sm font-bold tabular-nums">{n}</span>
                          <button type="button" aria-label={`Add one ${m.name}`} className="grid size-9 place-items-center hover:bg-olive/10" onClick={() => set(m.id, 1, m.stock)}><Plus className="size-3.5" /></button>
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="sticky top-24 border border-line bg-chalk p-5" aria-label="Your order">
          <p className="eyebrow text-olive-mid">Your order</p>
          <h2 className="display mt-1 text-2xl">{count ? `${count} item${count > 1 ? 's' : ''}` : 'Nothing yet'}</h2>
          {lines.length === 0 ? (
            <div className="mt-4"><Empty icon={UtensilsCrossed} title="Pick something tasty" body="Your member price is applied automatically." /></div>
          ) : (
            <div className="mt-4 space-y-4">
              <ul className="divide-y divide-line border-y border-line text-sm">
                {lines.map((l) => (
                  <li key={l.m.id} className="anim-fade flex justify-between gap-3 py-2"><span>{l.qty} × {l.m.name}</span><span className="tabular-nums">{formatMoney(l.m.price * l.qty)}</span></li>
                ))}
              </ul>
              <Select label="Where should we bring it?" value={table} onChange={setTable} options={TABLES.map((t) => ({ value: t, label: t }))} />
              <Segmented size="sm" value={payNow} onChange={setPayNow} className="w-full" options={[{ value: 'NOW', label: 'Pay now · UPI' }, { value: 'TAB', label: 'Add to my tab' }]} />
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(subtotal)}</dd></div>
                {pct > 0 && <div className="flex justify-between text-olive"><dt>{me.plan_name} discount ({pct}%)</dt><dd className="tabular-nums">− {formatMoney(discount)}</dd></div>}
                <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">Total</dt><dd className="display text-3xl tabular-nums">{formatMoney(total)}</dd></div>
              </dl>
              {error && <p role="alert" className="anim-pop border-l-2 border-primary bg-terracotta/10 px-3 py-2 text-sm text-primary">{error}</p>}
              <button type="button" className={cn(btn.primary, 'w-full')} onClick={place}><ChefHat className="size-4" /> Send to kitchen</button>
            </div>
          )}
        </aside>
      </div>

      <Section eyebrow="Earlier" title="Order history & receipts" className="mt-6" delay={80}>
        {past.length === 0 ? (
          <Empty icon={Receipt} title="No past orders" body="Served orders and their receipts will be listed here." />
        ) : (
          <ul>
            {past.map((o) => (
              <li key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-3 last:border-0">
                <div className="min-w-0">
                  <p className="font-semibold">{o.number} <span className="font-normal text-muted">· {formatDateIst(o.created_at)} {formatClockIst(o.created_at)}</span></p>
                  <p className="truncate text-sm text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right"><Pill tone={KITCHEN_STATUS[o.status].tone}>{KITCHEN_STATUS[o.status].label}</Pill><p className="mt-1 text-sm tabular-nums">{formatMoney(o.total)}</p></div>
                  <button type="button" className={btn.quiet} onClick={() => setReceipt(kitchenReceipt(o, me.code))}><Receipt className="size-3.5" /> Receipt</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
