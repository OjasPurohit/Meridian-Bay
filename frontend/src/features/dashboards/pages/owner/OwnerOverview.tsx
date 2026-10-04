import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarCheck, CalendarClock, ChefHat, Clock3, CreditCard, Dumbbell, ShoppingBag, UserPlus, Users, Wallet } from 'lucide-react';

import { ROLE_HOME_ROUTE } from '@shared/constants/rules';
import { formatClockIst, formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isBackendConfigured } from '@/api/client';
import { StockStepper } from '../../components/StockStepper';
import { pendingItems } from '../../components/PaymentBits';
import { courtById, dayOf, demo, useDemo } from '../../store/demoStore';
import { delta, PERIOD_LABEL, periodTotals, trail, type Period } from '../../store/selectors';
import { ALL_MEMBERS, bucket, courts, enquiries, staff, type Grain } from '../../store/staticData';
import { DEMO_NOW, DEMO_TODAY } from '../../store/types';
import { AreaChart, C, Donut, Legend, rupeeCompact } from '../../ui/charts';
import { btn, Kpi, PageHeader, PageSkeleton, Pill, Section, Segmented, useToast, usePageReady } from '../../ui/kit';

const O = ROLE_HOME_ROUTE.OWNER_ADMIN;
const rupee = (n: number) => formatRupees(Math.round(n));

function Mini({ icon: Icon, label, value, note, to, tone = 'chalk' }: { icon: typeof Users; label: string; value: string | number; note?: string; to?: string; tone?: 'chalk' | 'rust' | 'sun' }) {
  const inner = (
    <div className={cn('card-lift flex items-center gap-3 border p-4', tone === 'rust' ? 'border-primary/40 bg-terracotta/8' : tone === 'sun' ? 'border-sun/50 bg-sun/12' : 'border-line bg-chalk')}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-olive/10 text-olive"><Icon className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0"><p className="display text-2xl leading-none tabular-nums">{value}</p><p className="mt-1 text-xs leading-tight text-muted">{label}{note ? ` · ${note}` : ''}</p></div>
      {to && <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />}
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

export default function OwnerOverview() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('MONTH');
  const [grain, setGrain] = useState<Grain>('DAY');
  const { cur, prev } = periodTotals(period);
  const series = useMemo(() => bucket(grain), [grain]);

  const members = ALL_MEMBERS;
  const active = members.filter((m) => m.status === 'ACTIVE').length;
  const expiring = members.filter((m) => m.status === 'ACTIVE' && (m.days_left ?? 99) <= 30).length;
  const todays = s.bookings.filter((b) => b.kind === 'REGULAR' && b.status !== 'CANCELLED' && dayOf(b.start_at) === DEMO_TODAY);
  const upcoming = s.bookings.filter((b) => b.kind === 'REGULAR' && b.status !== 'CANCELLED' && Date.parse(b.start_at) > Date.parse(DEMO_NOW)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const pending = pendingItems(s);
  const lowProducts = s.products.filter((p) => p.stock <= p.threshold);
  const lowMenu = isBackendConfigured ? [] : s.menu.filter((m) => m.available && m.stock <= m.threshold); // café items have no stock column in the database
  const lowCount = lowProducts.length + lowMenu.length;

  const recent = useMemo(
    () =>
      [
        ...s.shopOrders.map((o) => ({ id: o.id, kind: 'Store', no: o.number, who: o.customer, total: o.total, at: o.created_at, status: o.status.replace(/_/g, ' ').toLowerCase() })),
        ...s.kOrders.map((o) => ({ id: o.id, kind: 'Kitchen', no: o.number, who: o.customer, total: o.total, at: o.created_at, status: o.status.toLowerCase() })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 6),
    [s.shopOrders, s.kOrders],
  );

  const mix = [
    { label: 'Courts', value: cur.court, color: C.olive },
    { label: 'Memberships', value: cur.membership, color: C.terracotta },
    { label: 'Store', value: cur.shop, color: C.sun },
    { label: 'Kitchen & bar', value: cur.bar, color: C.moss },
    { label: 'Business', value: cur.business, color: C.sky },
  ];

  if (!ready) return <PageSkeleton rows={2} />;

  return (
    <>
      <PageHeader eyebrow="Owner control centre" title="How the club is doing">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'TODAY', label: 'Today' }, { value: 'WEEK', label: '7 days' }, { value: 'MONTH', label: '30 days' }]} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi key={`rev-${period}`} tone="olive" icon={Wallet} label="Total revenue" value={cur.revenue} format={rupee} delta={delta(cur.revenue, prev.revenue)} note={`vs previous · ${PERIOD_LABEL[period].toLowerCase()}`} spark={trail((d) => d.court + d.membership + d.shop + d.bar + d.business)} />
        <Kpi key={`exp-${period}`} icon={CreditCard} label="Expenses" value={cur.expenses} format={rupee} delta={delta(cur.expenses, prev.expenses)} goodWhen="down" note="payroll, stock, utilities" delay={70} />
        <Kpi key={`pl-${period}`} tone={cur.profit >= 0 ? 'sun' : 'rust'} icon={Dumbbell} label={cur.profit >= 0 ? 'Profit' : 'Loss'} value={Math.abs(cur.profit)} format={rupee} delta={delta(cur.profit, prev.profit)} note="revenue − expenses" delay={140} />
        <Kpi icon={Users} label="Active members" value={active} note={`${expiring} renewing in 30 days`} delta={4.2} delay={210} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi key={`m-${period}`} label="Membership revenue" value={cur.membership} format={rupee} delta={delta(cur.membership, prev.membership)} spark={trail((d) => d.membership)} delay={0} />
        <Kpi key={`c-${period}`} label="Court revenue" value={cur.court} format={rupee} delta={delta(cur.court, prev.court)} spark={trail((d) => d.court)} delay={70} />
        <Kpi key={`s-${period}`} label="Store revenue" value={cur.shop} format={rupee} delta={delta(cur.shop, prev.shop)} spark={trail((d) => d.shop)} delay={140} />
        <Kpi key={`k-${period}`} label="Kitchen & bar revenue" value={cur.bar} format={rupee} delta={delta(cur.bar, prev.bar)} spark={trail((d) => d.bar)} delay={210} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Mini icon={Dumbbell} label="Active courts" value={courts.length} to={`${O}/bookings`} />
        <Mini icon={UserPlus} label="New members" value={cur.newMembers} to={`${O}/members`} />
        <Mini icon={CalendarCheck} label="Today’s bookings" value={todays.length} to={`${O}/bookings`} />
        <Mini icon={CalendarClock} label="Upcoming bookings" value={upcoming.length} to={`${O}/bookings`} />
        <Mini icon={Clock3} label="Pending payments" value={rupee(pending.reduce((a, p) => a + p.amount, 0))} note={`${pending.length} items`} tone={pending.length ? 'sun' : 'chalk'} to={`${O}/payments`} />
        <Mini icon={AlertTriangle} label="Low-stock alerts" value={lowCount} tone={lowCount ? 'rust' : 'chalk'} to={`${O}/store`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Section eyebrow="Trend" title="Revenue" action={<Segmented size="sm" value={grain} onChange={setGrain} options={[{ value: 'DAY', label: 'Daily' }, { value: 'WEEK', label: 'Weekly' }, { value: 'MONTH', label: 'Monthly' }]} />}>
          <Legend items={[{ name: 'Revenue', color: C.olive }, { name: 'Expenses', color: C.terracotta }]} />
          <div className="mt-3"><AreaChart key={grain} labels={series.labels} fmt={rupeeCompact} fmtFull={rupee} series={[{ name: 'Revenue', color: C.olive, data: series.revenue }, { name: 'Expenses', color: C.terracotta, data: series.expenses }]} /></div>
        </Section>
        <Section eyebrow={PERIOD_LABEL[period]} title="Revenue by source" delay={80}><Donut key={period} slices={mix} fmt={rupee} sub="total revenue" /></Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <Section eyebrow="Latest" title="Recent orders" delay={60} action={<Link to={`${O}/store`} className="text-xs font-semibold text-primary hover:underline">All orders →</Link>}>
          <ul>{recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-olive/10 text-olive">{r.kind === 'Store' ? <ShoppingBag className="size-4" /> : <ChefHat className="size-4" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.no} · {r.who}</span><span className="block text-xs text-muted">{r.kind} · {r.status} · {r.at > DEMO_NOW ? 'just now' : `${formatDateIst(r.at).replace(/, \d{4}$/, '')} ${formatClockIst(r.at)}`}</span></span>
              <span className="text-sm font-semibold tabular-nums">{formatMoney(r.total).replace(/\.00$/, '')}</span>
            </li>))}</ul>
        </Section>

        <Section eyebrow="Needs attention" title="Low-stock alerts" delay={120} action={<Pill tone={lowCount ? 'rust' : 'green'}>{lowCount ? `${lowCount} items` : 'all good'}</Pill>}>
          {lowCount === 0 ? <p className="text-sm text-muted">Everything is well stocked.</p> : (
            <ul className="max-h-80 overflow-y-auto pr-1">
              {lowProducts.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="text-xs text-muted">Store · {p.stock === 0 ? 'out of stock' : `${p.stock} left (alert at ${p.threshold})`}</span></span>
                  <StockStepper name={p.name} stock={p.stock} onChange={(d) => demo.adjustProductStock(p.id, d)} />
                </li>
              ))}
              {lowMenu.map((m) => (
                <li key={m.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="text-xs text-muted">Kitchen · {m.stock} left</span></span>
                  <StockStepper name={m.name} stock={m.stock} onChange={(d) => demo.adjustMenuStock(m.id, d)} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section eyebrow="Pipeline" title="Recent enquiries" delay={180} action={<Link to={`${O}/enquiries`} className="text-xs font-semibold text-primary hover:underline">All →</Link>}>
          <ul>{enquiries.slice(0, 5).map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.name}</span><span className="block truncate text-xs text-muted">{e.type.toLowerCase()} · {e.message ?? 'enquiry'}</span></span>
              <Pill tone={e.status === 'HANDLED' ? 'green' : 'sun'}>{e.status.replace('_', ' ').toLowerCase()}</Pill>
            </li>))}</ul>
        </Section>

        <Section eyebrow="Today" title="Upcoming bookings" delay={100} action={<Link to={`${O}/bookings`} className="text-xs font-semibold text-primary hover:underline">Calendar →</Link>}>
          <ul>{upcoming.slice(0, 5).map((b) => (
            <li key={b.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{b.name}</span><span className="text-xs text-muted">{courtById(b.court_id)?.name} · {formatDateIst(b.start_at).replace(/, \d{4}$/, '')} {formatClockIst(b.start_at)}</span></span>
              <Pill tone={b.pay === 'PENDING' ? 'sun' : 'green'}>{b.pay === 'PENDING' ? 'unpaid' : b.pay === 'FREE' ? 'included' : 'paid'}</Pill>
            </li>))}</ul>
        </Section>

        <Section eyebrow="Operations" title="Staff on duty" delay={160} action={<Link to={`${O}/staff`} className="text-xs font-semibold text-primary hover:underline">Roster →</Link>}>
          <ul>{staff.filter((x) => x.on_duty).map((x) => (
            <li key={x.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="live-dot size-2 rounded-full bg-olive text-olive" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{x.name}</span><span className="text-xs text-muted">{x.designation}</span></span>
              <span className="text-xs text-muted">{x.shift}</span>
            </li>))}</ul>
          <p className="mt-3 text-xs text-muted">{staff.filter((x) => x.on_duty).length} of {staff.length} staff on shift · 1 leave request awaiting approval</p>
        </Section>

        <Section eyebrow="Membership" title="Renewals due" delay={220} action={<Link to={`${O}/memberships`} className="text-xs font-semibold text-primary hover:underline">Plans →</Link>}>
          <ul>{members.filter((m) => m.status === 'ACTIVE' && (m.days_left ?? 99) <= 30 && !m.synthetic).concat(members.filter((m) => m.status === 'ACTIVE' && (m.days_left ?? 99) <= 30 && m.synthetic).slice(0, 2)).slice(0, 5).map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="text-xs text-muted">{m.plan_name} · {m.code}</span></span>
              <Pill tone={(m.days_left ?? 99) <= 10 ? 'rust' : 'sun'}>{m.days_left} days</Pill>
            </li>))}</ul>
        </Section>
      </div>
    </>
  );
}
