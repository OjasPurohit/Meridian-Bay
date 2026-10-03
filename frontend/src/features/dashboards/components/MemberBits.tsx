import { CalendarClock, Crown, Percent, Printer, Shield, Sprout } from 'lucide-react';

import type { PaymentMethod } from '@shared/constants/enums';
import { formatClockIst, formatDateIst, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { memberDiscount } from '../store/demoStore';
import { memberById } from '../store/staticData';
import type { DMember, OrderLine } from '../store/types';
import { btn, CountUp, Modal, Pill } from '../ui/kit';
import { useDemoIdentity } from '../layout/useIdentity';

/** The signed-in demo member (Aarav Kapoor, Gold). */
export function useMe(): DMember {
  const { member } = useDemoIdentity('MEMBER');
  return member!;
}

const PLAN_ICON = { GOLD: Crown, SILVER: Shield, JUNIOR: Sprout } as const;

export function MembershipCard({ member, compact = false }: { member: DMember; compact?: boolean }) {
  const Icon = member.type ? PLAN_ICON[member.type] : Shield;
  const active = member.status === 'ACTIVE';
  const pct = active && member.days_left !== null ? Math.max(0, Math.min(1, member.days_left / 365)) : 0;
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <div className="card-lift relative overflow-hidden border border-olive bg-olive p-5 text-chalk">
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-sun/20 blur-2xl" />
      <div className="flex items-start gap-4">
        <div className="relative size-[4.5rem] shrink-0">
          <svg viewBox="0 0 72 72" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(252,250,246,0.15)" strokeWidth="6" />
            <circle cx="36" cy="36" r={r} fill="none" stroke="var(--color-sun)" strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} className="transition-[stroke-dashoffset] duration-1000 ease-[var(--ease-soft)]" />
          </svg>
          <Icon className="absolute inset-0 m-auto size-6 text-sun" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-chalk/65">Membership</p>
          <p className="display mt-1 text-3xl leading-none">{member.plan_name}</p>
          <p className="mt-2 text-sm text-chalk/75">{active ? <>Valid until {formatDateIst(member.end_date!)} · <span className="font-semibold text-sun"><CountUp value={member.days_left ?? 0} /> days left</span></> : member.status === 'NONE' ? 'No active plan — walk-in prices apply' : `Membership ${member.status.toLowerCase()}`}</p>
        </div>
      </div>
      {!compact && (
        <ul className="mt-5 grid grid-cols-3 gap-px bg-chalk/15 text-center">
          {[
            ['Courts', member.court_pct, 'off'],
            ['Store', member.shop_pct, 'off'],
            ['Kitchen', member.bar_pct, 'off'],
          ].map(([l, v]) => (
            <li key={l as string} className="bg-olive px-2 py-3">
              <p className="display text-2xl leading-none">{v === 100 ? 'Free' : `${v}%`}</p>
              <p className="mt-1 text-[0.65rem] tracking-wider text-chalk/65 uppercase">{l as string}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-chalk/55">Member no. {member.code}</p>
    </div>
  );
}

/** "Gold member prices applied" strip shown at the top of Store / Kitchen. */
export function DiscountBanner({ member, area }: { member: DMember; area: 'shop' | 'bar' }) {
  const pct = memberDiscount(member, area);
  return (
    <div className="anim-rise flex flex-wrap items-center gap-3 border border-sun/50 bg-sun/15 px-4 py-3 text-sm">
      <span className="grid size-8 place-items-center rounded-full bg-sun text-ink"><Percent className="size-4" aria-hidden="true" /></span>
      {pct > 0 ? (
        <p><span className="font-semibold">{member.plan_name} member prices applied.</span> You save {pct}% on everything {area === 'shop' ? 'in the store' : 'from the kitchen'} — shown at checkout automatically.</p>
      ) : (
        <p><span className="font-semibold">No active membership.</span> Prices shown are standard; a plan unlocks member discounts.</p>
      )}
    </div>
  );
}

/** Original price struck through next to the member price (only when a discount applies). */
export function PriceTag({ price, pct, size = 'md' }: { price: number; pct: number; size?: 'md' | 'lg' }) {
  const member = Math.round(price * (100 - pct)) / 100;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={cn('display tabular-nums', size === 'lg' ? 'text-3xl' : 'text-xl')}>{formatMoney(member).replace(/\.00$/, '')}</span>
      {pct > 0 && (
        <>
          <s className="text-sm text-muted tabular-nums">{formatMoney(price).replace(/\.00$/, '')}</s>
          <Pill tone="green">−{pct}%</Pill>
        </>
      )}
    </p>
  );
}

export interface ReceiptData {
  title: string;
  number: string;
  at: string;
  customer: string;
  memberCode?: string | null;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  delivery?: number;
  total: number;
  method: PaymentMethod | null;
  paid: boolean;
  note?: string | null;
}

export function ReceiptModal({ data, onClose }: { data: ReceiptData | null; onClose: () => void }) {
  if (!data) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const row = 'flex items-baseline justify-between gap-4';
  return (
    <Modal open onClose={onClose} eyebrow="Receipt" title={data.title} width="max-w-md">
      <div className="print-area bg-chalk p-6 font-mono text-[0.82rem]">
        <div className="text-center">
          <p className="font-display text-2xl">Meridian Bay</p>
          <p className="text-xs text-muted">The Champions Club · Sports Enclave, Baner Road, Pune</p>
        </div>
        <div className="my-4 border-t border-dashed border-ink/40" />
        <p className={row}><span>No.</span><span className="font-semibold">{data.number}</span></p>
        <p className={row}><span>Date</span><span>{formatDateIst(data.at)} {formatClockIst(data.at)}</span></p>
        <p className={row}><span>Customer</span><span className="text-right">{data.customer}</span></p>
        {data.memberCode && <p className={row}><span>Member no.</span><span>{data.memberCode}</span></p>}
        <div className="my-4 border-t border-dashed border-ink/40" />
        <ul className="space-y-1.5">
          {data.lines.map((l, i) => (
            <li key={`${l.id}-${i}`} className={row}>
              <span className="min-w-0">{l.qty} × {l.name}</span>
              <span className="tabular-nums">{formatMoney(l.qty * l.unit)}</span>
            </li>
          ))}
        </ul>
        <div className="my-4 border-t border-dashed border-ink/40" />
        <p className={row}><span>Subtotal</span><span className="tabular-nums">{formatMoney(data.subtotal)}</span></p>
        {data.discount > 0 && <p className={cn(row, 'text-olive')}><span>Member discount</span><span className="tabular-nums">− {formatMoney(data.discount)}</span></p>}
        {!!data.delivery && <p className={row}><span>Delivery</span><span className="tabular-nums">{formatMoney(data.delivery)}</span></p>}
        <p className={cn(row, 'mt-2 border-t border-ink/60 pt-2 text-base font-bold')}><span>Total</span><span className="tabular-nums">{formatMoney(data.total)}</span></p>
        <p className="mt-3 text-center text-xs text-muted">{data.paid ? `Paid${data.method ? ` · ${data.method}` : ''}` : 'Payment pending'} · prices include GST</p>
        {data.note && <p className="mt-2 text-center text-xs text-muted">{data.note}</p>}
        <p className="mt-4 text-center text-xs">Thank you — see you on court.</p>
      </div>
      <div className="no-print mt-4 flex justify-end">
        <button type="button" onClick={() => window.print()} className={btn.secondary}><Printer className="size-4" /> Print / Save PDF</button>
      </div>
    </Modal>
  );
}

export function UpcomingChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full bg-olive/10 text-olive"><CalendarClock className="size-5" aria-hidden="true" /></span>
      <div>
        <p className="eyebrow text-olive-mid">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

export { memberById };
