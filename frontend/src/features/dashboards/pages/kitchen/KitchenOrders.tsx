import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChefHat, Flame, Hourglass, Undo2, Utensils, X } from 'lucide-react';

import type { OrderStatus } from '@shared/constants/enums';
import { formatClockIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { KITCHEN_STATUS } from '../../status';
import { dayOf, demo, useDemo } from '../../store/demoStore';
import { DEMO_NOW, DEMO_TODAY, type DKOrder } from '../../store/types';
import { btn, Empty, Kpi, PageHeader, PageSkeleton, Pill, usePageReady, useToast } from '../../ui/kit';

const COLUMNS: { status: OrderStatus; title: string; next: OrderStatus; cta: string; icon: typeof Flame }[] = [
  { status: 'NEW', title: 'New', next: 'PREPARING', cta: 'Start preparing', icon: Hourglass },
  { status: 'PREPARING', title: 'Preparing', next: 'READY', cta: 'Mark ready', icon: Flame },
  { status: 'READY', title: 'Ready', next: 'SERVED', cta: 'Served', icon: Utensils },
];

function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}

/** Minutes the ticket has been waiting. Seed tickets age from the demo clock; new ones from the real clock. */
const ageMin = (o: DKOrder) => {
  const created = Date.parse(o.created_at);
  const ref = created > Date.parse(DEMO_NOW) ? Date.now() : Date.parse(DEMO_NOW);
  return Math.max(0, Math.round((ref - created) / 60_000));
};

export function OrderBoard({ readOnly = false }: { readOnly?: boolean }) {
  const s = useDemo();
  const toast = useToast();
  useTick();
  const open = useMemo(() => s.kOrders.filter((o) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)), [s.kOrders]);

  const advance = (o: DKOrder, next: OrderStatus) => {
    demo.setKitchenStatus(o.id, next);
    toast(`${o.number} → ${KITCHEN_STATUS[next].label.toLowerCase()}`);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const list = open.filter((o) => o.status === col.status).sort((a, b) => a.created_at.localeCompare(b.created_at));
        return (
          <section key={col.status} aria-label={col.title} className="min-w-0 border border-line bg-sand/70">
            <header className="flex items-center justify-between border-b border-line bg-chalk px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold"><col.icon className="size-4 text-olive" aria-hidden="true" /> {col.title}</h2>
              <Pill tone={list.length ? 'dark' : 'muted'}>{list.length}</Pill>
            </header>
            <ul className="space-y-3 p-3">
              {list.length === 0 && <li className="px-2 py-8 text-center text-sm text-muted">Nothing {col.title.toLowerCase()}</li>}
              {list.map((o) => {
                const age = ageMin(o);
                return (
                  <li key={`${o.id}-${o.status}`} className="anim-pop border border-line bg-chalk p-3.5 shadow-[0_8px_20px_-16px_rgba(30,37,32,0.6)]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{o.number}</p>
                        <p className="text-xs text-muted">{o.table ?? 'Counter'} · {o.customer}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', age >= 15 ? 'bg-primary text-chalk' : age >= 8 ? 'bg-sun text-ink' : 'bg-olive/12 text-olive')}>{age} min</span>
                    </div>
                    <ul className="mt-3 space-y-1 border-y border-dashed border-line py-2.5 text-sm">
                      {o.lines.map((l, i) => (
                        <li key={i}><span className="font-semibold">{l.qty}×</span> {l.name}{l.notes && <span className="block text-xs text-primary">↳ {l.notes}</span>}</li>
                      ))}
                    </ul>
                    {o.notes && <p className="mt-2 text-xs text-primary">Note: {o.notes}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted">
                      <span>{formatClockIst(o.created_at)}</span>
                      <Pill tone={o.source === 'MEMBER' ? 'green' : 'muted'}>{o.source === 'MEMBER' ? 'member app' : o.source === 'POS' ? 'pos' : 'bar'}</Pill>
                      {o.pay === 'PENDING' ? <Pill tone="sun">unpaid</Pill> : <span>{formatMoney(o.total)}</span>}
                    </div>
                    {!readOnly && (
                      <div className="mt-3 flex items-center gap-2">
                        <button type="button" className={cn(btn.primary, 'min-w-0 flex-1 whitespace-nowrap !min-h-10')} onClick={() => advance(o, col.next)}>{col.cta} <ArrowRight className="size-4 shrink-0" /></button>
                        {o.status === 'READY' && <button type="button" aria-label={`Send ${o.number} back to preparing`} title="Back to preparing" className={cn(btn.secondary, 'shrink-0 whitespace-nowrap !min-h-10 !px-3.5')} onClick={() => advance(o, 'PREPARING')}><Undo2 className="size-4 shrink-0" /> Back</button>}
                        {o.status === 'NEW' && <button type="button" aria-label={`Reject ${o.number}`} className={cn(btn.danger, 'shrink-0 border border-primary/30 !min-h-10')} onClick={() => advance(o, 'CANCELLED')}><X className="size-4" /></button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function KitchenOrders() {
  const ready = usePageReady();
  const s = useDemo();
  const served = s.kOrders.filter((o) => o.status === 'SERVED' && dayOf(o.created_at) === DEMO_TODAY).length;
  const open = s.kOrders.filter((o) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status));
  if (!ready) return <PageSkeleton rows={1} />;
  const oldest = Math.max(0, ...open.map(ageMin));
  return (
    <>
      <PageHeader eyebrow="Kitchen manager" title="Live order board">
        <Pill tone="green"><span className="live-dot size-1.5 rounded-full bg-olive text-olive" /> Live · updates as orders arrive</Pill>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={ChefHat} label="Open orders" value={open.length} note="being handled" />
        <Kpi icon={Hourglass} label="Longest wait" value={oldest} format={(n) => `${Math.round(n)} min`} note={oldest >= 15 ? 'needs attention' : 'on track'} delay={70} tone={oldest >= 15 ? 'sun' : 'chalk'} />
        <Kpi icon={Check} label="Served today" value={served} note="orders completed" delay={140} />
      </div>
      {open.length === 0 && <div className="mb-4"><Empty icon={ChefHat} title="All caught up" body="New orders from the POS and member app appear here instantly." /></div>}
      <OrderBoard />
    </>
  );
}
