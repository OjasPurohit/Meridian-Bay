import { useEffect, useId, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';

import type { EnquiryType, SportType } from '@shared/constants/enums';
import type { MembershipPlan } from '@shared/types/rows';
import { createEnquiry, SPORT_LABEL, type PublicClubInfo } from '@/api/public';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { ENQUIRY_PRESET_EVENT, type EnquiryPreset } from '@/features/public/nav';
import { formatTimeOfDay } from '@/lib/format';
import { cn } from '@/lib/utils';

const TYPES: { value: EnquiryType; label: string }[] = [
  { value: 'TRIAL', label: 'A trial session' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'GENERAL', label: 'Something else' },
];

const field = 'mt-2 block min-h-12 w-full border border-line bg-chalk px-4 py-3 text-base text-ink placeholder:text-ink/40 focus:border-olive focus:outline-none focus-visible:outline-2';
const label = 'text-sm font-semibold';

function minLocalDateTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; name: string } | { kind: 'error'; message: string };

export function EnquirySection({ club, plans }: { club: PublicClubInfo | null; plans: MembershipPlan[] }) {
  const uid = useId();
  const [type, setType] = useState<EnquiryType>('TRIAL');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    const onPreset = (e: Event) => {
      const d = (e as CustomEvent<EnquiryPreset>).detail;
      setType(d.enquiry_type);
      if (d.membership_plan_id) setPlanId(d.membership_plan_id);
      setStatus({ kind: 'idle' });
    };
    window.addEventListener(ENQUIRY_PRESET_EVENT, onPreset);
    return () => window.removeEventListener(ENQUIRY_PRESET_EVENT, onPreset);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') ?? '').trim();
    const phone = String(f.get('phone') ?? '').trim();
    const when = String(f.get('preferred') ?? '');
    setStatus({ kind: 'sending' });
    try {
      await createEnquiry({
        name,
        phone,
        email: String(f.get('email') ?? '').trim() || undefined,
        enquiry_type: type,
        message: String(f.get('message') ?? '').trim() || undefined,
        membership_plan_id: type === 'MEMBERSHIP' && planId ? planId : undefined,
        sport_type: type === 'TRIAL' ? (String(f.get('sport')) as SportType) : undefined,
        preferred_start_at: type === 'TRIAL' && when ? new Date(when).toISOString() : undefined,
      });
      setStatus({ kind: 'sent', name: name.split(' ')[0] });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    }
  }

  const placeholder = (k: string) => club?.placeholders.includes(k);

  return (
    <section id="visit" aria-labelledby="visit-title" className="bg-clay py-24 md:py-36">
      <div className="mx-auto grid w-full max-w-[1440px] gap-14 px-5 md:px-10 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5" data-reveal>
          <p className="eyebrow text-olive-mid">Visit</p>
          <h2 id="visit-title" className="display mt-6 text-[clamp(2.6rem,5.6vw,5rem)] leading-[0.96] text-balance">
            Come and play a session.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            Ask for a free trial hour, a membership quote, or anything else. Every enquiry reaches the front desk, and someone will get back to you.
          </p>

          {club && (
            <dl className="mt-12 grid gap-6 border-t border-ink/15 pt-8 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <dt className="eyebrow text-olive-mid">Address</dt>
                <dd className="mt-2">
                  {club.club_address}
                  {placeholder('club_address') && <PlaceholderBadge />}
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-olive-mid">Court hours</dt>
                <dd className="mt-2">
                  {formatTimeOfDay(club.club_open_time)} – {formatTimeOfDay(club.club_close_time)} IST
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-olive-mid">Phone</dt>
                <dd className="mt-2">
                  <a className="underline decoration-ink/25 underline-offset-4 hover:decoration-ink" href={`tel:${club.club_phone.replace(/\s/g, '')}`}>
                    {club.club_phone}
                  </a>
                  {placeholder('club_phone') && <PlaceholderBadge />}
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-olive-mid">Email</dt>
                <dd className="mt-2 break-all">
                  <a className="underline decoration-ink/25 underline-offset-4 hover:decoration-ink" href={`mailto:${club.club_email}`}>
                    {club.club_email}
                  </a>
                  {placeholder('club_email') && <PlaceholderBadge />}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="lg:col-span-6 lg:col-start-7" data-reveal>
          <div className="bg-sand p-6 shadow-[0_30px_80px_-40px_rgba(30,37,32,0.45)] sm:p-10">
            {status.kind === 'sent' ? (
              <div role="status" className="py-10">
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-olive text-chalk">
                  <Check className="size-6" aria-hidden="true" />
                </span>
                <p className="display mt-6 text-4xl">Thank you, {status.name}.</p>
                <p className="mt-4 max-w-md leading-relaxed text-muted">
                  This is a preview of the website and isn&rsquo;t connected to the club yet, so your enquiry was <strong>not sent</strong>. Once it&rsquo;s live, the front desk will see it straight away.
                </p>
                <button type="button" onClick={() => setStatus({ kind: 'idle' })} className="mt-8 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  Send another enquiry
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate={false} aria-describedby={`${uid}-note`}>
                <fieldset>
                  <legend className={label}>I&rsquo;m interested in</legend>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {TYPES.map((t) => (
                      <label
                        key={t.value}
                        className={cn(
                          'flex min-h-12 cursor-pointer items-center justify-center border px-3 text-center text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                          type === t.value ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid',
                        )}
                      >
                        <input type="radio" name="enquiry_type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={label}>Full name</span>
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

                  {type === 'TRIAL' && (
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

                  {type === 'MEMBERSHIP' && (
                    <label className="sm:col-span-2">
                      <span className={label}>Plan</span>
                      <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                        <option value="">Not sure yet</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="sm:col-span-2">
                    <span className={label}>
                      Message <span className="font-normal text-muted">(optional)</span>
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
                  <InteractiveHoverButton type="submit" disabled={status.kind === 'sending'} className="px-8 disabled:cursor-wait disabled:opacity-70">
                    {status.kind === 'sending' ? 'Sending…' : 'Send enquiry'}
                  </InteractiveHoverButton>
                  <p id={`${uid}-note`} className="text-xs text-muted sm:max-w-[16rem] sm:text-right">
                    Preview only — enquiries are not sent anywhere yet.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlaceholderBadge() {
  return <span className="ml-2 inline-block bg-chalk/70 px-1.5 py-0.5 align-middle text-[0.62rem] font-semibold tracking-[0.12em] text-muted uppercase">Placeholder</span>;
}
