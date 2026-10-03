import { useEffect, useRef, useState } from 'react';

import type { MembershipPlan } from '@shared/types/rows';
import { getWalkInInfo, listPlans, SPORT_LABEL, type WalkInInfo } from '@/api/public';
import { ActionLink } from '@/components/ui/button';
import { formatRupees } from '@/lib/format';
import { useReveal } from '@/lib/useReveal';
import { cn } from '@/lib/utils';
import { ageLine, applyHref, DAY_PASS_SLUG, planShortName, planSlug } from '../plans';

function PlanCard({ plan, featured }: { plan: MembershipPlan; featured: boolean }) {
  const name = planShortName(plan);
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={cn('flex flex-col p-7 xl:p-8', featured ? 'on-dark bg-olive text-chalk' : 'border border-line bg-chalk')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`plan-${plan.id}`} className="display text-4xl">
          {name}
        </h2>
        <span className={cn('text-[0.68rem] font-semibold tracking-[0.14em] whitespace-nowrap uppercase', featured ? 'text-sun' : 'text-olive-mid')}>{ageLine(plan)}</span>
      </div>
      <p className={cn('mt-4 min-h-[3lh] leading-relaxed', featured ? 'text-chalk/75' : 'text-muted')}>{plan.description}</p>
      <p className="mt-6">
        <span className="display text-[2.6rem] leading-none tabular-nums">{formatRupees(plan.price)}</span>
        <span className={cn('ml-2 text-sm', featured ? 'text-chalk/60' : 'text-muted')}>/ {plan.duration_months} months</span>
      </p>
      <ul className={cn('mt-7 flex-1 space-y-3 border-t pt-6 text-[0.95rem]', featured ? 'border-chalk/20' : 'border-line')}>
        {plan.benefits.map((b) => (
          <li key={b} className="flex gap-3">
            <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', featured ? 'bg-sun' : 'bg-terracotta')} aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
      <ActionLink to={applyHref(planSlug(plan))} tone={featured ? 'dark' : 'light'} className="mt-9 self-start" aria-label={`Apply now for ${name}`}>
        Apply now
      </ActionLink>
    </article>
  );
}

function DayPassCard({ info }: { info: WalkInInfo | null }) {
  const lowest = info?.rates.length ? Math.min(...info.rates.map((r) => parseFloat(r.from))) : null;
  return (
    <article aria-labelledby="plan-day-pass" className="flex flex-col border border-dashed border-ink/30 bg-sand p-7 xl:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="plan-day-pass" className="display text-4xl">
          Day Pass
        </h2>
        <span className="text-[0.68rem] font-semibold tracking-[0.14em] whitespace-nowrap text-olive-mid uppercase">Walk-in</span>
      </div>
      <p className="mt-4 min-h-[3lh] leading-relaxed text-muted">
        For visitors and occasional players. Not a membership — no account, no annual fee. You pay as you play.
      </p>
      <p className="mt-6">
        {lowest != null ? (
          <>
            <span className="text-sm text-muted">Courts from </span>
            <span className="display text-[2.6rem] leading-none tabular-nums">{formatRupees(lowest)}</span>
            <span className="ml-2 text-sm text-muted">/ hour</span>
          </>
        ) : (
          <span className="display text-[2.6rem] leading-none">Pay as you play</span>
        )}
      </p>
      <ul className="mt-7 flex-1 space-y-3 border-t border-line pt-6 text-[0.95rem]">
        {info?.rates.map((r) => (
          <li key={r.sport} className="flex items-baseline justify-between gap-3">
            <span>{SPORT_LABEL[r.sport]}</span>
            <span className="text-muted tabular-nums">from {formatRupees(r.from)} / hour</span>
          </li>
        ))}
        {info?.social_guest_fee && (
          <li className="flex items-baseline justify-between gap-3">
            <span>Friday social play</span>
            <span className="text-muted tabular-nums">{formatRupees(info.social_guest_fee)} per guest</span>
          </li>
        )}
        <li className="text-muted">Shop and bar &amp; café at list prices. Booked and paid at the front desk.</li>
      </ul>
      <ActionLink to={applyHref(DAY_PASS_SLUG)} variant="secondary" className="mt-9 self-start">
        Plan a day visit
      </ActionLink>
    </article>
  );
}

export default function MembershipPage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [info, setInfo] = useState<WalkInInfo | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listPlans().then(setPlans);
    getWalkInInfo().then(setInfo);
  }, []);
  useReveal(root, [plans.length]);

  return (
    <div ref={root} className="bg-sand pt-18">
      <section aria-labelledby="membership-title" className="mx-auto w-full max-w-[1440px] px-5 pt-20 pb-24 md:px-10 md:pt-28 md:pb-32">
        <div className="grid gap-6 md:grid-cols-12" data-reveal>
          <p className="eyebrow text-olive-mid md:col-span-3 md:pt-4">Membership</p>
          <div className="md:col-span-9">
            <h1 id="membership-title" className="display text-[clamp(2.6rem,6vw,5.25rem)] leading-[0.96] text-balance">
              Three ways to belong. One way to drop in.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
              Every plan runs for a year and its benefits apply on their own — at the courts, in the shop and at the bar. Just visiting? The Day Pass is for you.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 xl:grid-cols-4 md:mt-20">
          {plans.map((p, i) => (
            <PlanCard key={p.id} plan={p} featured={i === 0} />
          ))}
          <DayPassCard info={info} />
        </div>

        <p className="mt-8 max-w-2xl text-sm text-muted">
          Membership prices include GST. Junior is for players under 18. Applying starts a conversation with the front desk — they confirm your details and send a quote before anything is charged.
        </p>
      </section>
    </div>
  );
}
