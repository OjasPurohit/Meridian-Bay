import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';

import type { SportType } from '@shared/constants/enums';
import type { MembershipPlan } from '@shared/types/rows';
import { createEnquiry, listPlans, SPORT_LABEL } from '@/api/public';
import { ActionLink } from '@/components/ui/button';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { field, label } from '@/features/public/components/EnquirySection';
import { formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ageLine, DAY_PASS_SLUG, planShortName, planSlug } from '../plans';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; name: string } | { kind: 'error'; message: string };

function minLocalDateTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function ApplyPage() {
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    listPlans().then(setPlans);
  }, []);

  const options = [...plans.map((p) => ({ slug: planSlug(p), title: planShortName(p), meta: `${formatRupees(p.price)} / ${p.duration_months} months` })), { slug: DAY_PASS_SLUG, title: 'Day Pass', meta: 'Walk-in · pay as you play' }];
  const requested = params.get('plan') ?? '';
  const selected = options.some((o) => o.slug === requested) || !plans.length ? requested : options[0].slug;
  const plan = plans.find((p) => planSlug(p) === selected);
  const isDayPass = selected === DAY_PASS_SLUG;
  const isJunior = plan?.max_age != null;

  const choose = (slug: string) => {
    setParams({ plan: slug }, { replace: true });
    setStatus({ kind: 'idle' });
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') ?? '').trim();
    const notes = [
      isDayPass && `Day visit — ${SPORT_LABEL[String(f.get('sport')) as SportType]}, preferred ${String(f.get('preferred') ?? '')}`,
      isJunior && f.get('dob') && `Player date of birth: ${String(f.get('dob'))}`,
      String(f.get('message') ?? '').trim(),
    ].filter(Boolean);
    setStatus({ kind: 'sending' });
    try {
      await createEnquiry({
        name,
        phone: String(f.get('phone') ?? '').trim(),
        email: String(f.get('email') ?? '').trim() || undefined,
        enquiry_type: isDayPass ? 'GENERAL' : 'MEMBERSHIP',
        membership_plan_id: plan?.id,
        message: notes.join('\n') || undefined,
      });
      setStatus({ kind: 'sent', name: name.split(' ')[0] });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    }
  }

  const title = isDayPass ? 'Plan a day visit' : plan ? `Apply for ${planShortName(plan)}` : 'Apply';

  return (
    <div className="bg-clay pt-18">
      <section aria-labelledby="apply-title" className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 pt-16 pb-24 md:px-10 md:pt-24 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <ActionLink to="/membership" variant="text" className="text-sm">
            All membership options
          </ActionLink>
          <h1 id="apply-title" className="display mt-8 text-[clamp(2.6rem,5.6vw,4.75rem)] leading-[0.96] text-balance">
            {title}
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            {isDayPass
              ? 'Tell us when you would like to come and what you want to play. Day visits are booked and paid at the front desk — no account needed.'
              : 'Send your details and the front desk will confirm eligibility, answer questions and send a quote. Nothing is charged online.'}
          </p>

          {plan && !isDayPass && (
            <div className="mt-10 border-t border-ink/15 pt-6">
              <p className="eyebrow text-olive-mid">{ageLine(plan)}</p>
              <ul className="mt-4 space-y-2 text-[0.95rem]">
                {plan.benefits.map((b) => (
                  <li key={b} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <div className="bg-sand p-6 shadow-[0_30px_80px_-40px_rgba(30,37,32,0.45)] sm:p-10">
            {status.kind === 'sent' ? (
              <div role="status" className="py-8">
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-olive text-chalk">
                  <Check className="size-6" aria-hidden="true" />
                </span>
                <p className="display mt-6 text-4xl">Thank you, {status.name}.</p>
                <p className="mt-4 max-w-md leading-relaxed text-muted">
                  This is a preview of the website and isn&rsquo;t connected to the club yet, so your {isDayPass ? 'request' : 'application'} was <strong>not sent</strong>.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ActionLink to="/membership" variant="secondary">
                    Back to membership
                  </ActionLink>
                  <button type="button" onClick={() => setStatus({ kind: 'idle' })} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
                    Start again
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <fieldset>
                  <legend className={label}>Choose an option</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {options.map((o) => (
                      <label
                        key={o.slug}
                        className={cn(
                          'flex min-h-16 cursor-pointer flex-col justify-center border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                          selected === o.slug ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid',
                        )}
                      >
                        <input type="radio" name="plan" value={o.slug} checked={selected === o.slug} onChange={() => choose(o.slug)} className="sr-only" />
                        <span className="font-semibold">{o.title}</span>
                        <span className={cn('text-xs', selected === o.slug ? 'text-chalk/70' : 'text-muted')}>{o.meta}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={label}>{isJunior ? 'Parent or guardian name' : 'Full name'}</span>
                    <input name="name" required autoComplete="name" className={field} />
                  </label>
                  <label>
                    <span className={label}>Phone</span>
                    <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" pattern="[+0-9 ()-]{8,}" className={field} />
                  </label>
                  <label>
                    <span className={label}>
                      Email <span className="font-normal text-muted">(optional)</span>
                    </span>
                    <input name="email" type="email" autoComplete="email" className={field} />
                  </label>

                  {isJunior && (
                    <label className="sm:col-span-2">
                      <span className={label}>Player&rsquo;s date of birth</span>
                      <input name="dob" type="date" required className={field} />
                    </label>
                  )}

                  {isDayPass && (
                    <>
                      <label>
                        <span className={label}>Sport</span>
                        <select name="sport" className={field} defaultValue="TENNIS">
                          {(Object.keys(SPORT_LABEL) as SportType[]).map((s) => (
                            <option key={s} value={s}>
                              {SPORT_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={label}>Preferred time</span>
                        <input name="preferred" type="datetime-local" required min={minLocalDateTime()} step={1800} className={field} />
                      </label>
                    </>
                  )}

                  <label className="sm:col-span-2">
                    <span className={label}>
                      Anything we should know? <span className="font-normal text-muted">(optional)</span>
                    </span>
                    <textarea name="message" rows={3} className={cn(field, 'resize-y')} />
                  </label>
                </div>

                {status.kind === 'error' && (
                  <p role="alert" className="mt-5 border-l-2 border-primary bg-chalk px-4 py-3 text-sm text-primary">
                    {status.message}
                  </p>
                )}

                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <InteractiveHoverButton type="submit" disabled={status.kind === 'sending'} className="px-8">
                    {status.kind === 'sending' ? 'Sending…' : isDayPass ? 'Send request' : 'Send application'}
                  </InteractiveHoverButton>
                  <p className="text-xs text-muted sm:max-w-[16rem] sm:text-right">Preview only — nothing is sent anywhere yet.</p>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
