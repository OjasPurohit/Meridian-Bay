import { useEffect, useId, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';

import type { EnquiryType, SportType } from '@shared/constants/enums';
import type { MembershipPlan } from '@shared/types/rows';
import { ApiError, isBackendConfigured } from '@/api/client';
import { bookTrial, createEnquiry, SPORT_LABEL, type PublicClubInfo, type TrialBookingResult } from '@/api/public';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { ENQUIRY_PRESET_EVENT, takePendingPreset, type EnquiryPreset } from '@/features/public/nav';
import { formatClockIst, formatDateIst, formatTimeOfDay } from '@/lib/format';
import { cn } from '@/lib/utils';

const TYPES: { value: EnquiryType; label: string }[] = [
  { value: 'TRIAL', label: 'A trial session' },
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'GENERAL', label: 'Something else' },
];

export const field = 'mt-2 block min-h-12 w-full border border-line bg-chalk px-4 py-3 text-base text-ink placeholder:text-ink/40 focus:border-olive focus:outline-none focus-visible:outline-2';
export const label = 'text-sm font-semibold';

function minLocalDateTime() {
  const d = new Date(Math.ceil((Date.now() + 60 * 60 * 1000) / 1_800_000) * 1_800_000); // next :00/:30 at least an hour away, so the 30-minute steps land on real slots
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; name: string; persisted: boolean; trial?: TrialBookingResult } | { kind: 'error'; message: string };

const TRIAL_ERRORS: Record<string, string> = {
  BOOKING_CONFLICT: 'No court is free for that sport at that time. Please pick another time.',
  INVALID_SLOT: 'Please choose a future time on the hour or half hour.',
  COURT_UNAVAILABLE: 'That time is outside our opening hours. Please pick another time.',
};

export function EnquirySection({ club, plans }: { club: PublicClubInfo | null; plans: MembershipPlan[] }) {
  const uid = useId();
  const [initial] = useState(takePendingPreset);
  const [type, setType] = useState<EnquiryType>(initial?.enquiry_type ?? 'TRIAL');
  const [planId, setPlanId] = useState(initial?.membership_plan_id ?? '');
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
      if (type === 'TRIAL') {
        const trial = await bookTrial({
          name,
          phone: phone.replace(/[\s()-]/g, ''),
          email: String(f.get('email') ?? '').trim() || undefined,
          sport_type: String(f.get('sport')) as SportType,
          start_at: new Date(when).toISOString(),
        });
        setStatus({ kind: 'sent', name: name.split(' ')[0], persisted: trial.persisted, trial });
        return;
      }
      const sentEnquiry = await createEnquiry({
        name,
        phone,
        email: String(f.get('email') ?? '').trim() || undefined,
        enquiry_type: type,
        message: String(f.get('message') ?? '').trim() || undefined,
        membership_plan_id: type === 'MEMBERSHIP' && planId ? planId : undefined,
      });
      setStatus({ kind: 'sent', name: name.split(' ')[0], persisted: sentEnquiry.persisted });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof ApiError && TRIAL_ERRORS[err.code] ? TRIAL_ERRORS[err.code]! : err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
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
                {status.trial?.persisted ? (
                  <>
                    <p className="display mt-6 text-4xl">You&rsquo;re booked, {status.name}.</p>
                    <p className="mt-4 max-w-md leading-relaxed text-muted">
                      Your free trial hour is on <strong>{status.trial.court_name}</strong>, {formatDateIst(status.trial.start_at)} at {formatClockIst(status.trial.start_at)} IST. Booking {status.trial.booking_number}. Just turn up; the front desk has it on the calendar.
                    </p>
                  </>
                ) : status.persisted ? (
                  <>
                    <p className="display mt-6 text-4xl">Thank you, {status.name}.</p>
                    <p className="mt-4 max-w-md leading-relaxed text-muted">Your enquiry is with the front desk, and someone will get back to you soon.</p>
                  </>
                ) : (
                  <>
                    <p className="display mt-6 text-4xl">Thank you, {status.name}.</p>
                    <p className="mt-4 max-w-md leading-relaxed text-muted">
                      This is a preview of the website and isn&rsquo;t connected to the club yet, so nothing was <strong>sent or booked</strong>. Once it&rsquo;s live, the front desk will see it straight away.
                    </p>
                  </>
                )}
                <button type="button" onClick={() => setStatus({ kind: 'idle' })} className="mt-8 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  {status.trial ? 'Book another trial' : 'Send another enquiry'}
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

                  {type !== 'TRIAL' && (
                    <label className="sm:col-span-2">
                      <span className={label}>
                        Message <span className="font-normal text-muted">(optional)</span>
                      </span>
                      <textarea name="message" rows={3} className={cn(field, 'resize-y')} />
                    </label>
                  )}
                </div>

                {status.kind === 'error' && (
                  <p role="alert" className="mt-5 border-l-2 border-primary bg-chalk px-4 py-3 text-sm text-primary">
                    {status.message}
                  </p>
                )}

                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <InteractiveHoverButton type="submit" disabled={status.kind === 'sending'} className="px-8 disabled:cursor-wait disabled:opacity-70">
                    {status.kind === 'sending' ? (type === 'TRIAL' ? 'Booking…' : 'Sending…') : type === 'TRIAL' ? 'Book my free trial' : 'Send enquiry'}
                  </InteractiveHoverButton>
                  <p id={`${uid}-note`} className="text-xs text-muted sm:max-w-[16rem] sm:text-right">
                    {isBackendConfigured ? (type === 'TRIAL' ? 'A free hour on a real court, held for you straight away.' : 'Goes straight to the front desk.') : 'Preview only — nothing is sent or booked yet.'}
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
