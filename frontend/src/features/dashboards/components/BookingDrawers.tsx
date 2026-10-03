import { useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, Phone, ShieldAlert, Smartphone, Banknote, Clock, UserRound, Footprints } from 'lucide-react';

import type { PaymentMethod } from '@shared/constants/enums';
import { formatClockIst, formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BOOKING_STATUS_LABEL } from '../status';
import { courtById, courtPrice, dayOf, demo, playsUsed, useDemo } from '../store/demoStore';
import { ALL_MEMBERS, memberById } from '../store/staticData';
import { DEMO_NOW, type DCourt, type DMember } from '../store/types';
import { Avatar, btn, Drawer, field, Field, Meter, Pill, Segmented, useToast } from '../ui/kit';
import type { CalendarMode } from './CourtCalendar';

const METHODS: { value: PaymentMethod | 'LATER'; label: string; icon: typeof Banknote }[] = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'LATER', label: 'Pay later', icon: Clock },
];

function MethodPicker({ value, onChange, online }: { value: PaymentMethod | 'LATER'; onChange: (v: PaymentMethod | 'LATER') => void; online?: boolean }) {
  const opts = online ? [{ value: 'ONLINE' as const, label: 'Pay online', icon: CreditCard }, { value: 'LATER' as const, label: 'Pay at desk', icon: Clock }] : METHODS;
  return (
    <div className={cn('grid gap-2', online ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')} role="radiogroup" aria-label="Payment method">
      {opts.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn('flex min-h-14 flex-col items-center justify-center gap-1 border text-xs font-semibold transition-[background-color,border-color,transform] duration-200 active:scale-95', value === o.value ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid')}>
          <o.icon className="size-4" aria-hidden="true" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PriceCard({ court, member }: { court: DCourt; member: DMember | undefined }) {
  const p = courtPrice(court, member);
  return (
    <div className="border border-line bg-chalk p-4">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted">1-hour session · walk-in rate</dt><dd className="tabular-nums">{formatMoney(p.list)}</dd></div>
        {member && (
          <div className="flex justify-between text-olive">
            <dt>{member.status === 'ACTIVE' ? `${member.plan_name} member · ${p.pct}% off courts` : 'No active membership'}</dt>
            <dd className="tabular-nums">{p.discount ? `− ${formatMoney(p.discount)}` : '—'}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="font-semibold">You pay</dt>
          <dd className="display text-3xl tabular-nums">{p.due === 0 ? 'Free' : formatMoney(p.due)}</dd>
        </div>
      </dl>
      {p.due === 0 && member && <p className="mt-2 text-xs text-olive-mid">Included with your {member.plan_name} membership.</p>}
    </div>
  );
}

function SuccessMark() {
  return (
    <svg viewBox="0 0 52 52" className="mx-auto size-20" aria-hidden="true">
      <circle cx="26" cy="26" r="23" fill="none" stroke="var(--color-olive)" strokeWidth="3" pathLength={1} className="anim-draw" />
      <path d="M15 27.5 L23 35 L38 18" fill="none" stroke="var(--color-olive)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="anim-draw" style={{ ['--d' as string]: '450ms' }} />
    </svg>
  );
}

/* ============================================================================ book a free slot */
export function BookDrawer({ mode, memberId, pick, onClose }: { mode: CalendarMode; memberId?: string; pick: { court: DCourt; start_at: string } | null; onClose: () => void }) {
  const s = useDemo();
  const toast = useToast();
  const [who, setWho] = useState<'member' | 'walkin'>('member');
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<PaymentMethod | 'LATER'>(mode === 'member' ? 'ONLINE' : 'CASH');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; free: boolean; due: number } | null>(null);

  useEffect(() => {
    // fresh form for every slot
    setError(null);
    setDone(null);
    setQ('');
    setChosen(null);
    setName('');
    setPhone('');
    setWho('member');
    setMethod(mode === 'member' ? 'ONLINE' : 'CASH');
  }, [pick?.court.id, pick?.start_at, mode]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pool = ALL_MEMBERS;
    return (t ? pool.filter((m) => m.name.toLowerCase().includes(t) || m.code.toLowerCase().includes(t) || m.phone.replace(/\s/g, '').includes(t.replace(/\s/g, ''))) : pool.filter((m) => !m.synthetic)).slice(0, 6);
  }, [q]);

  if (!pick) return <Drawer open={false} onClose={onClose} title="" children={null} />;
  const { court, start_at } = pick;
  const date = dayOf(start_at);
  const endIso = new Date(Date.parse(start_at) + 3_600_000).toISOString();
  const member: DMember | undefined = mode === 'member' ? memberById(memberId) : who === 'member' ? memberById(chosen) : undefined;
  const price = courtPrice(court, member);
  const used = member ? playsUsed(s, member.id, date) : 0;
  const atLimit = !!member && used >= member.max_plays;
  const needsGuest = mode === 'desk' && who === 'walkin';
  const canConfirm = !atLimit && (mode === 'member' || (who === 'member' ? !!chosen : name.trim().length > 1));
  const free = price.due === 0;

  const confirm = () => {
    const res = demo.bookCourt({
      court_id: court.id,
      start_at,
      member_id: member?.id ?? null,
      name: needsGuest ? name : undefined,
      phone: needsGuest ? phone : undefined,
      method: free || method === 'LATER' ? null : method,
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setDone({ number: res.value.number, free, due: price.due });
    toast(`Booked ${court.name} · ${formatClockIst(start_at)}`);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={mode === 'member' ? 'Book now' : 'New booking'}
      title={done ? 'You’re booked' : court.name}
      footer={
        done ? (
          <button type="button" className={cn(btn.primary, 'w-full')} onClick={onClose}>
            Done
          </button>
        ) : (
          <div className="space-y-2">
            {error && (
              <p role="alert" className="anim-pop flex gap-2 border-l-2 border-primary bg-terracotta/10 px-3 py-2 text-sm text-primary">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {error}
              </p>
            )}
            <button type="button" disabled={!canConfirm} onClick={confirm} className={cn(btn.primary, 'w-full')}>
              {atLimit ? 'Daily limit reached' : mode === 'member' ? (free ? 'Confirm booking' : method === 'ONLINE' ? `Pay ${formatRupees(price.due)} & book` : 'Confirm booking') : free ? 'Create booking' : method === 'LATER' ? 'Create booking · pay later' : `Create booking · ${formatRupees(price.due)}`}
            </button>
          </div>
        )
      }
    >
      {done ? (
        <div className="anim-fade space-y-5 text-center">
          <SuccessMark />
          <div>
            <p className="display text-2xl">{court.name}</p>
            <p className="mt-1 text-muted">
              {formatDateIst(start_at)} · {formatClockIst(start_at)}–{formatClockIst(endIso)}
            </p>
          </div>
          <p className="text-sm text-muted">
            Booking <span className="font-semibold text-ink">{done.number}</span> · {done.free ? 'included with the membership' : method === 'LATER' ? `${formatMoney(done.due)} due at the desk` : `${formatMoney(done.due)} paid`}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-px border border-line bg-line text-sm">
            <div className="bg-chalk p-3"><p className="eyebrow text-olive-mid">Date</p><p className="mt-1 font-semibold">{formatDateIst(start_at)}</p></div>
            <div className="bg-chalk p-3"><p className="eyebrow text-olive-mid">Time</p><p className="mt-1 font-semibold">{formatClockIst(start_at)}–{formatClockIst(endIso)} <span className="font-normal text-muted">(1 h)</span></p></div>
          </div>

          {mode === 'desk' && (
            <div className="space-y-3">
              <Segmented value={who} onChange={setWho} options={[{ value: 'member', label: <span className="inline-flex items-center gap-1.5"><UserRound className="size-4" /> Member</span> }, { value: 'walkin', label: <span className="inline-flex items-center gap-1.5"><Footprints className="size-4" /> Walk-in</span> }]} />
              {who === 'member' ? (
                <div className="space-y-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, member no. or phone" aria-label="Search members" className={field} />
                  <ul className="max-h-56 divide-y divide-line overflow-y-auto border border-line bg-chalk">
                    {results.length === 0 && <li className="p-3 text-sm text-muted">No member found.</li>}
                    {results.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => setChosen(m.id)} className={cn('flex min-h-14 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-olive/8', chosen === m.id && 'bg-olive/12')}>
                          <Avatar name={m.name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{m.name}</span>
                            <span className="block text-xs text-muted">{m.code} · {m.phone}</span>
                          </span>
                          <Pill tone={m.status === 'ACTIVE' ? 'green' : m.status === 'NONE' ? 'muted' : 'rust'}>{m.status === 'ACTIVE' ? m.plan_name : m.status === 'NONE' ? 'No plan' : m.status.toLowerCase()}</Pill>
                          {chosen === m.id && <Check className="size-4 text-olive" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Guest name"><input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="e.g. Deepak Chawla" autoComplete="off" /></Field>
                  <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="+91 …" inputMode="tel" autoComplete="off" /></Field>
                </div>
              )}
            </div>
          )}

          {member && (
            <div className="border border-line bg-chalk p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold">Plays on this day</span>
                <span className="tabular-nums text-muted">{used} of {member.max_plays} used</span>
              </div>
              <Meter value={used} max={member.max_plays} tone={atLimit ? 'rust' : 'olive'} />
              {atLimit ? <p className="mt-2 text-xs text-primary">Daily limit reached — choose another day.</p> : <p className="mt-2 text-xs text-muted">{member.max_plays - used} play{member.max_plays - used === 1 ? '' : 's'} left including this one.</p>}
            </div>
          )}

          {(member || needsGuest) && <PriceCard court={court} member={member} />}
          {mode === 'desk' && !member && !needsGuest && <p className="text-sm text-muted">Pick a member or switch to Walk-in to see the price.</p>}

          {!free && (member || needsGuest) && (
            <div className="space-y-2">
              <p className="eyebrow text-olive-mid">Payment</p>
              <MethodPicker value={method} onChange={setMethod} online={mode === 'member'} />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ============================================================================ an existing booking */
export function BookingDrawer({ mode, memberId, bookingId, onClose, allowDeskActions = true }: { mode: CalendarMode; memberId?: string; bookingId: string | null; onClose: () => void; allowDeskActions?: boolean }) {
  const s = useDemo();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const b = s.bookings.find((x) => x.id === bookingId);
  useEffect(() => setConfirmCancel(false), [bookingId]);
  if (!b) return <Drawer open={false} onClose={onClose} title="" children={null} />;

  const court = courtById(b.court_id);
  const member = memberById(b.member_id);
  const status = BOOKING_STATUS_LABEL[b.status];
  const upcoming = Date.parse(b.start_at) > Date.parse(DEMO_NOW) && b.status !== 'CANCELLED';
  const own = mode === 'member' && b.member_id === memberId;
  const canAct = (mode === 'desk' && allowDeskActions) || own;

  return (
    <Drawer open onClose={onClose} eyebrow={`Booking ${b.number}`} title={b.kind === 'MAINTENANCE' ? 'Maintenance block' : b.kind === 'SOCIAL' ? (b.title ?? 'Social play') : (court?.name ?? 'Booking')}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={status.tone}>{status.label}</Pill>
          <Pill tone={b.pay === 'PENDING' ? 'sun' : b.pay === 'REFUNDED' ? 'rust' : 'green'}>{b.pay === 'FREE' ? 'Included' : b.pay === 'PENDING' ? 'Payment pending' : b.pay === 'REFUNDED' ? 'Refunded' : 'Paid'}</Pill>
          {b.kind !== 'REGULAR' && <Pill tone="muted">{b.kind.toLowerCase()}</Pill>}
        </div>

        <dl className="grid grid-cols-2 gap-px border border-line bg-line text-sm">
          <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Court</dt><dd className="mt-1 font-semibold">{court?.name}</dd></div>
          <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Date</dt><dd className="mt-1 font-semibold">{formatDateIst(b.start_at)}</dd></div>
          <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Time</dt><dd className="mt-1 font-semibold">{formatClockIst(b.start_at)}–{formatClockIst(b.end_at)}</dd></div>
          <div className="bg-chalk p-3"><dt className="eyebrow text-olive-mid">Amount</dt><dd className="mt-1 font-semibold">{b.amount_due === 0 ? 'Free' : formatMoney(b.amount_due)}</dd></div>
        </dl>

        {mode === 'desk' && b.kind !== 'MAINTENANCE' && (
          <div className="border border-line bg-chalk p-4">
            <p className="eyebrow text-olive-mid">Customer</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={b.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{b.name}</p>
                {member ? (
                  <p className="text-xs text-muted">{member.code} · {member.status === 'ACTIVE' ? `${member.plan_name} · ${member.days_left} days left` : member.status === 'NONE' ? 'No membership' : `Membership ${member.status.toLowerCase()}`}</p>
                ) : (
                  <p className="text-xs text-muted">Walk-in guest</p>
                )}
              </div>
              {b.phone && (
                <a href={`tel:${b.phone.replace(/\s/g, '')}`} className={cn(btn.secondary, '!min-h-10 !px-3')} aria-label={`Call ${b.name}`}>
                  <Phone className="size-4" /> <span className="hidden sm:inline">{b.phone}</span>
                </a>
              )}
            </div>
          </div>
        )}

        {b.discount > 0 && (
          <p className="text-sm text-muted">Walk-in rate {formatMoney(b.list_price)} − member discount {formatMoney(b.discount)}.</p>
        )}

        {canAct && b.status !== 'CANCELLED' && b.status !== 'COMPLETED' && (
          <div className="space-y-4 border-t border-line pt-5">
            {mode === 'desk' && b.pay === 'PENDING' && (
              <div className="space-y-2">
                <p className="eyebrow text-olive-mid">Collect {formatMoney(b.amount_due)}</p>
                <Segmented size="sm" value={method} onChange={setMethod} options={[{ value: 'CASH', label: 'Cash' }, { value: 'CARD', label: 'Card' }, { value: 'UPI', label: 'UPI' }]} />
                <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => { demo.markBookingPaid(b.id, method); toast(`Payment of ${formatMoney(b.amount_due)} recorded.`); }}>
                  Mark as paid
                </button>
              </div>
            )}
            {mode === 'desk' && !upcoming && (
              <button type="button" className={cn(btn.secondary, 'w-full')} onClick={() => { demo.patchBooking(b.id, { status: 'COMPLETED' }); toast('Marked as played.'); }}>
                Mark as played
              </button>
            )}
            {upcoming &&
              (confirmCancel ? (
                <div className="anim-pop space-y-2 border border-primary/40 bg-terracotta/8 p-4">
                  <p className="text-sm">Cancel this booking{b.pay === 'PAID' ? ` and refund ${formatMoney(b.amount_due)}` : ''}? The slot becomes available again.</p>
                  <div className="flex gap-2">
                    <button type="button" className={cn(btn.accent, 'flex-1')} onClick={() => { const r = demo.cancelBooking(b.id); if (r.ok) { toast('Booking cancelled — slot released.'); onClose(); } }}>
                      Yes, cancel
                    </button>
                    <button type="button" className={cn(btn.secondary, 'flex-1')} onClick={() => setConfirmCancel(false)}>
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className={cn(btn.danger, 'w-full border border-primary/30 !min-h-11')} onClick={() => setConfirmCancel(true)}>
                  Cancel booking
                </button>
              ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
