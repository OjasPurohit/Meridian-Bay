import { useMemo, useState } from 'react';
import { BadgeCheck, Banknote, ChefHat, CreditCard, Minus, Plus, Search, Smartphone, UserCheck, UserX, UtensilsCrossed } from 'lucide-react';

import type { MenuCategory, PaymentMethod } from '@shared/constants/enums';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReceiptModal, type ReceiptData } from '../../components/MemberBits';
import { demo, memberDiscount, useDemo } from '../../store/demoStore';
import { findMember } from '../../store/staticData';
import type { DMember } from '../../store/types';
import { btn, Chips, Empty, field, PageHeader, PageSkeleton, Pill, SearchInput, Segmented, Select, usePageReady, useToast } from '../../ui/kit';
import { kitchenReceipt } from '../member/MemberKitchen';

const CATS: { value: MenuCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRINK', label: 'Drinks' },
  { value: 'SNACK', label: 'Snacks' },
  { value: 'FOOD', label: 'Mains' },
];
const TABLES = ['Counter', ...Array.from({ length: 7 }, (_, i) => `Table ${i + 1}`)];

export default function KitchenPos() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [cat, setCat] = useState<MenuCategory | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [kind, setKind] = useState<'WALKIN' | 'MEMBER'>('WALKIN');
  const [guest, setGuest] = useState('');
  const [memberQ, setMemberQ] = useState('CCM-00001');
  const [table, setTable] = useState('Counter');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const member: DMember | undefined = kind === 'MEMBER' ? findMember(memberQ) : undefined;
  const pct = memberDiscount(member, 'bar');
  const items = useMemo(() => s.menu.filter((m) => (cat === 'ALL' || m.category === cat) && (!q || m.name.toLowerCase().includes(q.toLowerCase()))), [s.menu, cat, q]);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ m: s.menu.find((x) => x.id === id)!, qty })).filter((l) => l.m);
  const subtotal = lines.reduce((a, l) => a + l.m.price * l.qty, 0);
  const discount = Math.round(subtotal * pct) / 100;
  const total = subtotal - discount;
  const count = lines.reduce((a, l) => a + l.qty, 0);

  const bump = (id: string, d: number, max: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(max, (c[id] ?? 0) + d)) }));

  const charge = () => {
    if (kind === 'MEMBER' && !member) return setError('Enter a valid member number first.');
    const r = demo.placeKitchenOrder({ member_id: member?.id ?? null, customer: member?.name ?? (guest.trim() || 'Walk-in guest'), lines: lines.map((l) => ({ menu_id: l.m.id, qty: l.qty })), source: 'POS', table: table === 'Counter' ? null : table, method, payNow: true });
    if (!r.ok) return setError(r.message);
    setError(null);
    setCart({});
    setReceipt(kitchenReceipt(r.value, member?.code));
    toast(`Order ${r.value.number} paid and sent to the kitchen`);
  };

  if (!ready) return <PageSkeleton rows={2} />;

  return (
    <>
      <PageHeader eyebrow="Kitchen manager" title="Point of sale">
        <Pill tone="green"><span className="live-dot size-1.5 rounded-full bg-olive text-olive" /> Orders go straight to the board</Pill>
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_26rem]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Chips value={cat} onChange={setCat} options={CATS} />
            <SearchInput value={q} onChange={setQ} placeholder="Find an item" className="w-full sm:w-64" />
          </div>
          {items.length === 0 ? <Empty icon={UtensilsCrossed} title="No items" body="Try another category or search." /> : (
            <ul key={cat + q} className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {items.map((m, i) => {
                const n = cart[m.id] ?? 0;
                const out = !m.available || m.stock === 0;
                const mp = Math.round(m.price * (100 - pct)) / 100;
                return (
                  <li key={m.id} style={{ ['--d' as string]: `${Math.min(i, 14) * 30}ms` }} className="anim-rise">
                    <button type="button" disabled={out} onClick={() => bump(m.id, 1, m.stock)} className={cn('group relative flex h-full min-h-32 w-full flex-col justify-between border bg-chalk p-4 text-left transition-[transform,border-color,box-shadow,background-color] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50', n > 0 ? 'border-olive bg-olive/6 shadow-[0_12px_26px_-18px_rgba(30,37,32,0.7)]' : 'border-line hover:-translate-y-0.5 hover:border-olive-mid')}>
                      {n > 0 && <span key={n} className="anim-pop absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-olive text-xs font-bold text-chalk">{n}</span>}
                      <span>
                        <span className="eyebrow !text-[0.6rem] text-olive-mid">{m.category.toLowerCase()}</span>
                        <span className="mt-1 block pr-6 font-semibold leading-snug">{m.name}</span>
                      </span>
                      <span className="mt-3 flex items-end justify-between">
                        <span>
                          <span className="display text-xl tabular-nums">{formatMoney(mp).replace(/\.00$/, '')}</span>
                          {pct > 0 && <s className="ml-1.5 text-xs text-muted">{formatMoney(m.price).replace(/\.00$/, '')}</s>}
                        </span>
                        {out ? <Pill tone="rust">Out</Pill> : m.stock <= m.threshold ? <Pill tone="sun">{m.stock} left</Pill> : <Plus className="size-5 text-olive transition-transform group-hover:rotate-90" aria-hidden="true" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="sticky top-24 space-y-4 border border-line bg-chalk p-5" aria-label="Current order">
          <Segmented value={kind} onChange={(k) => { setKind(k); setError(null); }} className="w-full" options={[{ value: 'WALKIN', label: <span className="inline-flex items-center gap-1.5"><UserX className="size-4" /> Walk-in</span> }, { value: 'MEMBER', label: <span className="inline-flex items-center gap-1.5"><UserCheck className="size-4" /> Member</span> }]} />

          {kind === 'MEMBER' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Member no. e.g. CCM-00003 or name" aria-label="Member number" className={cn(field, 'pl-10')} />
              </div>
              {member ? (
                <div key={member.id} className="anim-pop flex items-start gap-3 border border-olive/40 bg-olive/8 p-3">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-olive" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-xs text-muted">{member.code} · {member.status === 'ACTIVE' ? `${member.plan_name} member` : member.status === 'NONE' ? 'No plan' : `Membership ${member.status.toLowerCase()}`}</p>
                  </div>
                  <Pill tone={pct > 0 ? 'green' : 'muted'}>{pct > 0 ? `${pct}% off` : 'No discount'}</Pill>
                </div>
              ) : <p className="text-sm text-muted">{memberQ.trim() ? 'No member found for that number.' : 'Type a member number to apply their discount.'}</p>}
            </div>
          ) : (
            <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Guest name (optional)" aria-label="Guest name" className={field} />
          )}

          <Select label="Serve at" value={table} onChange={setTable} options={TABLES.map((t) => ({ value: t, label: t }))} />

          <div className="border-y border-line py-1">
            {lines.length === 0 ? <p className="py-6 text-center text-sm text-muted">Tap items to add them to the order.</p> : (
              <ul className="divide-y divide-line">
                {lines.map((l) => (
                  <li key={l.m.id} className="anim-fade flex items-center gap-2 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.m.name}</span>
                    <span className="inline-flex items-center border border-line">
                      <button type="button" aria-label={`Remove one ${l.m.name}`} className="grid size-8 place-items-center hover:bg-olive/10" onClick={() => bump(l.m.id, -1, l.m.stock)}><Minus className="size-3.5" /></button>
                      <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                      <button type="button" aria-label={`Add one ${l.m.name}`} className="grid size-8 place-items-center hover:bg-olive/10" onClick={() => bump(l.m.id, 1, l.m.stock)}><Plus className="size-3.5" /></button>
                    </span>
                    <span className="w-16 text-right tabular-nums">{formatMoney(l.m.price * l.qty).replace(/\.00$/, '')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal · {count} item{count === 1 ? '' : 's'}</dt><dd className="tabular-nums">{formatMoney(subtotal)}</dd></div>
            <div className={cn('flex justify-between transition-colors', pct > 0 ? 'font-semibold text-olive' : 'text-muted')}><dt>{pct > 0 ? `Member discount (${pct}%)` : 'Member discount'}</dt><dd className="tabular-nums">{pct > 0 ? `− ${formatMoney(discount)}` : '—'}</dd></div>
            <div className="flex items-baseline justify-between border-t border-line pt-3"><dt className="font-semibold">Final amount</dt><dd key={total} className="display anim-pop text-4xl tabular-nums">{formatMoney(total)}</dd></div>
          </dl>

          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
            {([['CASH', Banknote, 'Cash'], ['CARD', CreditCard, 'Card'], ['UPI', Smartphone, 'UPI']] as const).map(([v, I, l]) => (
              <button key={v} type="button" role="radio" aria-checked={method === v} onClick={() => setMethod(v)} className={cn('flex min-h-14 flex-col items-center justify-center gap-1 border text-xs font-semibold transition-[background-color,transform] active:scale-95', method === v ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid')}><I className="size-4" aria-hidden="true" />{l}</button>
            ))}
          </div>
          {error && <p role="alert" className="anim-pop border-l-2 border-primary bg-terracotta/10 px-3 py-2 text-sm text-primary">{error}</p>}
          <button type="button" disabled={lines.length === 0} onClick={charge} className={cn(btn.primary, 'w-full !min-h-12 text-base')}><ChefHat className="size-5" /> Charge {formatMoney(total)}</button>
        </aside>
      </div>
      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
