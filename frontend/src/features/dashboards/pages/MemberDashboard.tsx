import { Link, useSearchParams } from 'react-router-dom';

import { getMemberDashboard, PREVIEW_MEMBER_ID, PREVIEW_NOW, type MemberBooking } from '@/api/dashboards';
import { listPlans } from '@/api/public';
import { ActionLink } from '@/components/ui/button';
import { discountLabel } from '@/features/membership/components/DiscountTable';
import { planShortName, planSlug } from '@/features/membership/plans';
import { formatClockIst, formatDateIst, formatMoney, formatRupees, istDateKey } from '@/lib/format';
import { Badge, DashboardShell, EmptyState, ErrorState, Loading, Panel, useLoad } from '../components/DashboardShell';
import { MonthCalendar } from '../components/MonthCalendar';
import { BOOKING_STATUS_LABEL, KITCHEN_STATUS, SHOP_STATUS } from '../status';

const SECTIONS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'membership', label: 'Membership' },
  { id: 'events', label: 'Events' },
  { id: 'shop-orders', label: 'Shop orders' },
  { id: 'kitchen-orders', label: 'Café orders' },
];

function BookingRow({ b }: { b: MemberBooking }) {
  const s = BOOKING_STATUS_LABEL[b.status];
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-line py-3 last:border-0">
      <div>
        <p className="font-semibold">{b.kind === 'SOCIAL' ? b.title : b.court_name}</p>
        <p className="text-sm text-muted">
          {formatDateIst(b.start_at)} · {formatClockIst(b.start_at)}–{formatClockIst(b.end_at)}
          {b.kind === 'SOCIAL' && ` · ${b.court_name}`}
        </p>
      </div>
      <div className="text-right">
        <Badge tone={s.tone}>{b.kind === 'SOCIAL' && b.status === 'CONFIRMED' ? 'Joined' : s.label}</Badge>
        {b.amount_due && <p className="mt-1 text-xs text-muted tabular-nums">{parseFloat(b.amount_due) === 0 ? 'Free with plan' : formatMoney(b.amount_due)}</p>}
      </div>
    </li>
  );
}

export default function MemberDashboard() {
  const state = useLoad(() => Promise.all([getMemberDashboard(PREVIEW_MEMBER_ID), listPlans()]));
  const [d, plans] = state.data ?? [null, []];
  const [params] = useSearchParams();
  const chosenPlan = plans.find((p) => planSlug(p) === params.get('plan')) ?? null;
  const now = PREVIEW_NOW.toISOString();
  const today = istDateKey(now);

  const upcoming = d?.bookings.filter((b) => b.end_at >= now && b.status !== 'CANCELLED') ?? [];
  const past = d?.bookings.filter((b) => b.end_at < now || b.status === 'CANCELLED').reverse() ?? [];

  return (
    <DashboardShell
      role="MEMBER"
      title={d ? `Good to see you, ${d.first_name}.` : 'Your club, at a glance.'}
      intro="Your bookings, plan, orders and what’s on at the club."
      sections={SECTIONS}
      previewOf="Showing the fictional member Aarav Kapoor (Gold)."
    >
      {state.loading && <Loading label="Loading your dashboard" />}
      {state.error && <ErrorState message={state.error} />}
      {!state.loading && !state.error && !d && <EmptyState>We couldn’t find a member profile for this account.</EmptyState>}

      {chosenPlan && (
        <div role="status" className="mb-6 border border-olive/30 bg-chalk px-5 py-4 text-sm">
          <span className="font-semibold">You picked {planShortName(chosenPlan)} ({formatRupees(chosenPlan.price)} / {chosenPlan.duration_months} months).</span> Buying a plan online needs the payments service, which isn’t
          connected yet — the front desk can sell it to you in person.
        </div>
      )}

      {d && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Panel id="calendar" title="Calendar" className="lg:col-span-5">
            <MonthCalendar
              month={today.slice(0, 7)}
              today={today}
              marks={[
                ...d.bookings.filter((b) => b.status !== 'CANCELLED').map((b) => ({ date: istDateKey(b.start_at), kind: b.kind === 'SOCIAL' ? ('event' as const) : ('booking' as const), label: `${b.kind === 'SOCIAL' ? b.title : b.court_name} at ${formatClockIst(b.start_at)}` })),
              ]}
            />
          </Panel>

          <Panel id="bookings" title="Bookings" className="lg:col-span-7" action={<Badge tone="green">{upcoming.length} upcoming</Badge>}>
            <h3 className="eyebrow text-olive-mid">Upcoming</h3>
            {upcoming.length ? (
              <ul className="mt-2">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </ul>
            ) : (
              <div className="mt-3">
                <EmptyState>No upcoming bookings.</EmptyState>
              </div>
            )}
            <h3 className="eyebrow mt-8 text-olive-mid">Past &amp; cancelled</h3>
            {past.length ? (
              <ul className="mt-2">
                {past.slice(0, 6).map((b) => (
                  <BookingRow key={b.id} b={b} />
                ))}
              </ul>
            ) : (
              <div className="mt-3">
                <EmptyState>No past bookings yet.</EmptyState>
              </div>
            )}
          </Panel>

          <Panel id="membership" title="Membership" className="lg:col-span-5">
            {d.membership ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="display text-4xl">{planShortName(d.membership.plan)}</p>
                  <Badge tone="green">Active</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {d.member_code} · until {formatDateIst(d.membership.end_date)} · {d.membership.days_left} days left
                </p>
                <dl className="mt-6 border-t border-line text-sm">
                  {[
                    ['Courts', discountLabel(d.membership.plan.court_discount_percent, true)],
                    ['Gear shop', discountLabel(d.membership.plan.shop_discount_percent)],
                    ['Bar & café', discountLabel(d.membership.plan.bar_discount_percent)],
                    ['Plays per day', `Up to ${d.membership.plan.max_plays_per_day}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-line py-2.5">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-xs text-muted">Discounts apply automatically to your own bookings and orders.</p>
                <ActionLink to="/membership" variant="text" className="mt-2 text-sm">
                  Compare plans
                </ActionLink>
              </>
            ) : (
              <>
                <p className="text-muted">You don’t have an active plan, so you play at walk-in rates and pay list prices.</p>
                <p className="mt-3 text-sm text-muted">
                  Available plans:{' '}
                  {plans.map((p, i) => (
                    <span key={p.id}>
                      {planShortName(p)} {formatRupees(p.price)}
                      {i < plans.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </p>
                <ActionLink to="/membership" className="mt-5">
                  Choose a plan
                </ActionLink>
              </>
            )}
          </Panel>

          <Panel id="events" title="Friday social play" className="lg:col-span-7">
            {d.events.length ? (
              <ul>
                {d.events.map((e) => (
                  <li key={e.id} className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-line py-3 last:border-0">
                    <div>
                      <p className="font-semibold">{e.title}</p>
                      <p className="text-sm text-muted">
                        {formatDateIst(e.start_at)} · {formatClockIst(e.start_at)}–{formatClockIst(e.end_at)} · {e.court_name}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      {e.joined ? <Badge tone="green">You’re in</Badge> : e.spots_left > 0 ? <Badge tone="sun">{e.spots_left} spots left</Badge> : <Badge>Full</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No social sessions are open right now.</EmptyState>
            )}
          </Panel>

          <Panel id="shop-orders" title="Shop orders" className="lg:col-span-6">
            {d.shop_orders.length ? (
              <ul>
                {d.shop_orders.map((o) => (
                  <li key={o.id} className="border-b border-line last:border-0">
                    <Link to={`/member/orders/${o.id}`} className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-x-4 py-3 hover:bg-sand/60">
                      <span>
                        <span className="block font-semibold">{o.order_number}</span>
                        <span className="text-sm text-muted">
                          {formatDateIst(o.created_at)} · {o.item_count} {o.item_count === 1 ? 'item' : 'items'} · {o.fulfillment === 'DELIVERY' ? 'Delivery' : o.fulfillment === 'PICKUP' ? 'Pickup' : 'At the counter'}
                        </span>
                      </span>
                      <span className="text-right">
                        <Badge tone={SHOP_STATUS[o.status].tone}>{SHOP_STATUS[o.status].label}</Badge>
                        <span className="mt-1 block text-xs text-muted tabular-nums">{formatMoney(o.total_amount)} · Track →</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No shop orders yet.</EmptyState>
            )}
          </Panel>

          <Panel id="kitchen-orders" title="Bar & café orders" className="lg:col-span-6">
            {d.kitchen_orders.length ? (
              <ul>
                {d.kitchen_orders.map((o) => {
                  const s = KITCHEN_STATUS[o.status];
                  return (
                    <li key={o.id} className="border-b border-line py-3 last:border-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">{o.order_number}</p>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</p>
                      <p className="mt-1 text-xs text-muted">
                        {o.timeline.map((t) => `${KITCHEN_STATUS[t.status].label} ${formatClockIst(t.at)}`).join(' → ')}
                        {' · '}
                        <span className="tabular-nums">{formatMoney(o.total_amount)}</span>
                        {parseFloat(o.discount_amount) > 0 && ` (saved ${formatMoney(o.discount_amount)})`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No bar &amp; café orders yet.</EmptyState>
            )}
            <p className="mt-4 text-xs text-muted">Orders are taken at your table by staff. Demo orders use the seed menu, which predates the current café menu.</p>
          </Panel>
        </div>
      )}
    </DashboardShell>
  );
}
