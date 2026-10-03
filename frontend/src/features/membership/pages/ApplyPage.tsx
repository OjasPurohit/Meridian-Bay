import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { MembershipPlan } from '@shared/types/rows';
import { getClubInfo, getWalkInInfo, listPlans, SPORT_LABEL, type PublicClubInfo, type WalkInInfo } from '@/api/public';
import { openLoginMenu, useAuth } from '@/auth/AuthProvider';
import { ActionLink } from '@/components/ui/button';
import { presetEnquiry } from '@/features/public/nav';
import { formatRupees, formatTimeOfDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { discountLabel } from '../components/DiscountTable';
import { DAY_PASS_SLUG, planShortName, planSlug } from '../plans';

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

function PlanDetails({ plan }: { plan: MembershipPlan }) {
  return (
    <>
      <p className="mt-6">
        <span className="display text-5xl tabular-nums">{formatRupees(plan.price)}</span>
        <span className="ml-2 text-muted">/ {plan.duration_months} months · GST included</span>
      </p>
      <p className="mt-4 max-w-lg leading-relaxed text-muted">{plan.description}</p>
      <dl className="mt-8 border-t border-line">
        <Detail k="Courts" v={discountLabel(plan.court_discount_percent, true)} />
        <Detail k="Gear shop" v={discountLabel(plan.shop_discount_percent)} />
        <Detail k="Bar & café" v={discountLabel(plan.bar_discount_percent)} />
        <Detail k="Plays per day" v={`Up to ${plan.max_plays_per_day}`} />
      </dl>
      <ul className="mt-8 space-y-2 text-[0.95rem]">
        {plan.benefits.map((b) => (
          <li key={b} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
    </>
  );
}

function DayPassDetails({ info, club }: { info: WalkInInfo | null; club: PublicClubInfo | null }) {
  return (
    <>
      <p className="mt-6 inline-block border border-dashed border-ink/30 px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase">Not a membership · no annual fee</p>
      <p className="mt-4 max-w-lg leading-relaxed text-muted">For visitors and occasional players. You pay walk-in rates for each session and list prices at the shop and bar &amp; café — there is no plan discount.</p>
      <dl className="mt-8 border-t border-line">
        {info?.rates.map((r) => (
          <Detail key={r.sport} k={SPORT_LABEL[r.sport]} v={`from ${formatRupees(r.from)} / hour`} />
        ))}
        {club && <Detail k="Court hours" v={`${formatTimeOfDay(club.club_open_time)} – ${formatTimeOfDay(club.club_close_time)} IST`} />}
        <Detail k="Gear shop · Bar & café" v="List prices" />
      </dl>
    </>
  );
}

export default function ApplyPage() {
  const [params, setParams] = useSearchParams();
  const { session } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [info, setInfo] = useState<WalkInInfo | null>(null);
  const [club, setClub] = useState<PublicClubInfo | null>(null);

  useEffect(() => {
    listPlans().then(setPlans);
    getWalkInInfo().then(setInfo);
    getClubInfo().then(setClub);
  }, []);

  const options = [...plans.map((p) => ({ slug: planSlug(p), title: planShortName(p), meta: `${formatRupees(p.price)} / ${p.duration_months} months` })), { slug: DAY_PASS_SLUG, title: 'Day Pass', meta: 'Walk-in · pay as you play' }];
  const requested = params.get('plan') ?? '';
  const selected = options.some((o) => o.slug === requested) || !plans.length ? requested : options[0].slug;
  const plan = plans.find((p) => planSlug(p) === selected);
  const isDayPass = selected === DAY_PASS_SLUG;
  const isMember = session?.user.role === 'MEMBER';

  return (
    <div className="bg-clay pt-18">
      <section aria-labelledby="apply-title" className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 pt-16 pb-24 md:px-10 md:pt-24 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <ActionLink to="/membership" variant="text" className="text-sm">
            All membership options
          </ActionLink>
          <h1 id="apply-title" className="display mt-8 text-[clamp(2.6rem,5.6vw,4.75rem)] leading-[0.96] text-balance">
            {isDayPass ? 'Day Pass / walk-in' : plan ? `${planShortName(plan)} membership` : 'Membership'}
          </h1>
          {plan && !isDayPass && <PlanDetails plan={plan} />}
          {isDayPass && <DayPassDetails info={info} club={club} />}
        </div>

        <div className="lg:col-span-5 lg:col-start-8">
          <div className="bg-sand p-6 shadow-[0_30px_80px_-40px_rgba(30,37,32,0.45)] sm:p-8">
            <fieldset>
              <legend className="text-sm font-semibold">Compare options</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {options.map((o) => (
                  <label
                    key={o.slug}
                    className={cn(
                      'flex min-h-16 cursor-pointer flex-col justify-center border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                      selected === o.slug ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid',
                    )}
                  >
                    <input type="radio" name="plan" value={o.slug} checked={selected === o.slug} onChange={() => setParams({ plan: o.slug }, { replace: true })} className="sr-only" />
                    <span className="font-semibold">{o.title}</span>
                    <span className={cn('text-xs', selected === o.slug ? 'text-chalk/70' : 'text-muted')}>{o.meta}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-8 border-t border-line pt-6">
              <h2 className="display text-2xl">Next step</h2>
              {isDayPass ? (
                <>
                  <p className="mt-3 leading-relaxed text-muted">No account or form needed. Come in during court hours and the front desk books your court and takes payment by cash, card or UPI.</p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <ActionLink to="/#visit" onClick={() => presetEnquiry({ enquiry_type: 'GENERAL' })}>
                      Ask the front desk
                    </ActionLink>
                    <ActionLink to={`/signup?plan=${DAY_PASS_SLUG}`} variant="text">
                      Create a free account
                    </ActionLink>
                  </div>
                </>
              ) : isMember ? (
                <>
                  <p className="mt-3 leading-relaxed text-muted">You’re logged in. Buy or change your plan from your member dashboard.</p>
                  <ActionLink to={`/member?plan=${selected}`} className="mt-6">
                    Go to my dashboard
                  </ActionLink>
                </>
              ) : (
                <>
                  <ol className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-muted">
                    <li>
                      <span className="font-semibold text-ink">1. Create a member account.</span> Your chosen plan comes with you.
                    </li>
                    <li>
                      <span className="font-semibold text-ink">2. Buy the plan</span> from your dashboard, or at the front desk.
                      {plan?.max_age != null && ' Junior needs the player’s date of birth.'}
                    </li>
                  </ol>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <ActionLink to={`/signup?plan=${selected}`}>Create an account</ActionLink>
                    <button type="button" onClick={openLoginMenu} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
                      I already have one — log in
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
