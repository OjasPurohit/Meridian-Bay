import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Check, Lock } from 'lucide-react';

import type { MembershipPlan } from '@shared/types/rows';
import { ApiError, isBackendConfigured } from '@/api/client';
import { listPlans } from '@/api/public';
import { openLoginMenu, useAuth } from '@/auth/AuthProvider';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { field, label } from '@/features/public/components/EnquirySection';
import { DAY_PASS_SLUG, planShortName, planSlug } from '@/features/membership/plans';
import { formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';

type Details = { full_name: string; email: string; phone: string; password: string; confirm: string; date_of_birth: string; address: string };
type Errors = Partial<Record<keyof Details | 'form', string>>;
/** The four ways to sign up: three memberships (paid at checkout) or an employee application (decided by the owner). */
type Choice = { kind: 'PLAN'; planId: string } | { kind: 'EMPLOYEE' };
type Step = 'details' | 'choose' | 'checkout';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{8,20}$/;
const EMPTY: Details = { full_name: '', email: '', phone: '', password: '', confirm: '', date_of_birth: '', address: '' };

function validate(v: Details): Errors {
  const e: Errors = {};
  if (v.full_name.length < 2 || v.full_name.length > 120) e.full_name = 'Enter your full name (2–120 characters).';
  if (!EMAIL.test(v.email)) e.email = 'Enter a valid email address.';
  if (!PHONE.test(v.phone)) e.phone = 'Enter a phone number with at least 8 digits.';
  if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Use at least 8 characters, including a letter and a number.';
  if (v.confirm !== v.password) e.confirm = 'Passwords don’t match.';
  if (v.date_of_birth && new Date(v.date_of_birth) >= new Date()) e.date_of_birth = 'Date of birth must be in the past.';
  return e;
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-primary">
      {msg}
    </p>
  );
}

/** The API takes a phone as E.164 or 10 digits: strip the spaces and punctuation the form allows. */
const apiPhone = (p: string) => p.replace(/[\s()-]/g, '');

export default function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signup, applyAsEmployee } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [step, setStep] = useState<Step>('details');
  const [values, setValues] = useState<Details>(EMPTY);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPlans().then(setPlans);
  }, []);

  const requested = params.get('plan') ?? '';
  const dayPass = requested === DAY_PASS_SLUG;
  // a plan chosen on the membership page is preselected once the plans are known
  useEffect(() => {
    if (!choice && requested) {
      const p = plans.find((x) => planSlug(x) === requested);
      if (p) setChoice({ kind: 'PLAN', planId: p.id });
    }
  }, [plans, requested, choice]);

  const chosenPlan = useMemo(() => (choice?.kind === 'PLAN' ? (plans.find((p) => p.id === choice.planId) ?? null) : null), [choice, plans]);
  const set = (k: keyof Details) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const invalid = (k: keyof Errors) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `err-${k}` : undefined });

  function onDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed: Details = { ...values, full_name: values.full_name.trim(), email: values.email.trim(), phone: values.phone.trim(), address: values.address.trim() };
    const found = validate(trimmed);
    setValues(trimmed);
    setErrors(found);
    if (Object.keys(found).length) {
      const form = e.currentTarget;
      window.setTimeout(() => (form.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 0);
      return;
    }
    setStep('choose');
  }

  function onChoose() {
    if (!choice) return setErrors({ form: 'Choose a membership or apply as an employee.' });
    if (chosenPlan && chosenPlan.max_age != null && !values.date_of_birth) {
      setErrors({ date_of_birth: 'Junior membership needs the player’s date of birth.' });
      return setStep('details');
    }
    setErrors({});
    if (choice.kind === 'EMPLOYEE') void submitApplication();
    else setStep('checkout');
  }

  const fail = (err: unknown) => setErrors({ form: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' });

  async function submitApplication() {
    setBusy(true);
    try {
      await applyAsEmployee({ full_name: values.full_name, email: values.email, phone: apiPhone(values.phone), password: values.password });
      navigate('/employee-application-pending?submitted=1');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  /** Checkout: ONE request creates the account, the membership and the online payment; if payment fails nothing is created. */
  async function pay() {
    if (!chosenPlan) return;
    setBusy(true);
    setErrors({});
    try {
      const s = await signup({
        full_name: values.full_name,
        email: values.email,
        phone: apiPhone(values.phone),
        password: values.password,
        membership_plan_id: chosenPlan.id,
        ...(values.date_of_birth ? { date_of_birth: values.date_of_birth } : {}),
        ...(values.address ? { address: values.address } : {}),
      });
      navigate(s.redirect_to);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const planChoices = plans.slice().sort((a, b) => a.sort_order - b.sort_order);
  const summaryFor = chosenPlan;

  return (
    <div className="bg-clay pt-18">
      <section aria-labelledby="signup-title" className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 pt-16 pb-24 md:px-10 md:pt-24 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow text-olive-mid">Create an account</p>
          <h1 id="signup-title" className="display mt-6 text-[clamp(2.6rem,5.6vw,4.75rem)] leading-[0.96] text-balance">
            Join Meridian Bay.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            Join as a Gold, Silver or Junior member to book courts, order gear and eat at the café, or apply to work with us.
          </p>

          {summaryFor && step !== 'details' && (
            <div className="mt-10 border-t border-ink/15 pt-6">
              <p className="eyebrow text-olive-mid">Chosen plan</p>
              <p className="display mt-2 text-3xl">{planShortName(summaryFor)}</p>
              <p className="mt-1 text-sm text-muted">
                {formatRupees(summaryFor.price)} / {summaryFor.duration_months} months, paid online at checkout.
              </p>
            </div>
          )}
          {dayPass && (
            <p className="mt-10 max-w-md border-t border-ink/15 pt-6 text-sm leading-relaxed text-muted">
              Day Pass visitors don’t need an account — you can simply walk in and book at the front desk. Creating a member account is optional.
            </p>
          )}

          <p className="mt-10 text-sm text-muted">
            Already have an account?{' '}
            <button type="button" onClick={openLoginMenu} className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">
              Log in
            </button>
          </p>
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <div className="bg-sand p-6 shadow-[0_30px_80px_-40px_rgba(30,37,32,0.45)] sm:p-10">
            <ol className="mb-8 flex gap-2 text-xs font-semibold tracking-wide text-muted uppercase" aria-label="Sign-up steps">
              {(['details', 'choose', 'checkout'] as Step[]).map((s, i) => (
                <li key={s} aria-current={step === s ? 'step' : undefined} className={cn('flex-1 border-t-2 pt-2', step === s ? 'border-olive text-ink' : 'border-line')}>
                  {i + 1}. {s === 'details' ? 'Your details' : s === 'choose' ? 'Choose' : choice?.kind === 'EMPLOYEE' ? 'Apply' : 'Checkout'}
                </li>
              ))}
            </ol>

            {step === 'details' && (
              <form onSubmit={onDetails} noValidate>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={label}>Full name</span>
                    <input name="full_name" value={values.full_name} onChange={set('full_name')} required autoComplete="name" maxLength={120} className={field} {...invalid('full_name')} />
                    <FieldError id="err-full_name" msg={errors.full_name} />
                  </label>
                  <label>
                    <span className={label}>Email</span>
                    <input name="email" type="email" value={values.email} onChange={set('email')} required autoComplete="email" className={field} {...invalid('email')} />
                    <FieldError id="err-email" msg={errors.email} />
                  </label>
                  <label>
                    <span className={label}>Phone</span>
                    <input name="phone" type="tel" value={values.phone} onChange={set('phone')} required autoComplete="tel" inputMode="tel" className={field} {...invalid('phone')} />
                    <FieldError id="err-phone" msg={errors.phone} />
                  </label>
                  <label>
                    <span className={label}>Password</span>
                    <input name="password" type="password" value={values.password} onChange={set('password')} required autoComplete="new-password" className={field} {...invalid('password')} />
                    <FieldError id="err-password" msg={errors.password} />
                    {!errors.password && <p className="mt-1.5 text-xs text-muted">At least 8 characters, with a letter and a number.</p>}
                  </label>
                  <label>
                    <span className={label}>Confirm password</span>
                    <input name="confirm" type="password" value={values.confirm} onChange={set('confirm')} required autoComplete="new-password" className={field} {...invalid('confirm')} />
                    <FieldError id="err-confirm" msg={errors.confirm} />
                  </label>
                  <label>
                    <span className={label}>
                      Date of birth <span className="font-normal text-muted">(needed for Junior)</span>
                    </span>
                    <input name="date_of_birth" type="date" value={values.date_of_birth} onChange={set('date_of_birth')} className={field} {...invalid('date_of_birth')} />
                    <FieldError id="err-date_of_birth" msg={errors.date_of_birth} />
                  </label>
                  <label>
                    <span className={label}>
                      Address <span className="font-normal text-muted">(optional)</span>
                    </span>
                    <input name="address" value={values.address} onChange={set('address')} autoComplete="street-address" maxLength={500} className={field} />
                  </label>
                </div>
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <InteractiveHoverButton type="submit" className="px-8">
                    Continue
                  </InteractiveHoverButton>
                  {!isBackendConfigured && <p className="text-xs text-muted sm:max-w-[15rem] sm:text-right">Accounts aren’t connected yet, so no account can be created today.</p>}
                </div>
              </form>
            )}

            {step === 'choose' && (
              <div>
                <fieldset>
                  <legend className={label}>How would you like to join?</legend>
                  <div className="mt-4 grid gap-2">
                    {planChoices.map((p) => {
                      const selected = choice?.kind === 'PLAN' && choice.planId === p.id;
                      return (
                        <label
                          key={p.id}
                          className={cn(
                            'flex min-h-16 cursor-pointer items-center justify-between gap-4 border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                            selected ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid',
                          )}
                        >
                          <input type="radio" name="choice" checked={selected} onChange={() => setChoice({ kind: 'PLAN', planId: p.id })} className="sr-only" />
                          <span>
                            <span className="block font-semibold">Apply for {planShortName(p)} membership</span>
                            <span className={cn('block text-xs', selected ? 'text-chalk/75' : 'text-muted')}>
                              {formatRupees(p.price)} for {p.duration_months} months{p.max_age != null ? ` · players under ${p.max_age + 1}` : ''}
                            </span>
                          </span>
                          {selected && <Check className="size-5 shrink-0" aria-hidden="true" />}
                        </label>
                      );
                    })}
                    <label
                      className={cn(
                        'flex min-h-16 cursor-pointer items-center justify-between gap-4 border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                        choice?.kind === 'EMPLOYEE' ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid',
                      )}
                    >
                      <input type="radio" name="choice" checked={choice?.kind === 'EMPLOYEE'} onChange={() => setChoice({ kind: 'EMPLOYEE' })} className="sr-only" />
                      <span>
                        <span className="flex items-center gap-2 font-semibold">
                          <Briefcase className="size-4" aria-hidden="true" /> Apply as an employee
                        </span>
                        <span className={cn('block text-xs', choice?.kind === 'EMPLOYEE' ? 'text-chalk/75' : 'text-muted')}>The owner reviews your application and gives you a role.</span>
                      </span>
                      {choice?.kind === 'EMPLOYEE' && <Check className="size-5 shrink-0" aria-hidden="true" />}
                    </label>
                  </div>
                </fieldset>
                {errors.date_of_birth && <FieldError id="err-dob" msg={errors.date_of_birth} />}
                {errors.form && (
                  <p role="alert" className="mt-6 border-l-2 border-primary bg-chalk px-4 py-3 text-sm text-primary">
                    {errors.form}
                  </p>
                )}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                  <button type="button" onClick={() => setStep('details')} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
                    Back
                  </button>
                  <InteractiveHoverButton type="button" disabled={busy || !isBackendConfigured} onClick={onChoose} className="px-8">
                    {busy ? 'Sending…' : choice?.kind === 'EMPLOYEE' ? 'Submit job application' : 'Continue to payment'}
                  </InteractiveHoverButton>
                </div>
                {!isBackendConfigured && <p className="mt-4 text-xs text-muted">Accounts aren’t connected yet, so no account can be created today.</p>}
              </div>
            )}

            {step === 'checkout' && chosenPlan && (
              <div>
                <p className="display text-2xl">Checkout</p>
                <dl className="mt-5 space-y-2 border border-line bg-chalk p-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Member</dt>
                    <dd className="font-semibold">{values.full_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Plan</dt>
                    <dd>
                      {planShortName(chosenPlan)} · {chosenPlan.duration_months} months
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-line pt-3">
                    <dt className="font-semibold">Total (GST included)</dt>
                    <dd className="display text-2xl tabular-nums">{formatRupees(chosenPlan.price)}</dd>
                  </div>
                </dl>
                <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Lock className="size-3.5" aria-hidden="true" /> Paid online. Your account and membership are created only after the payment succeeds; no card details are stored.
                </p>
                {errors.form && (
                  <p role="alert" className="mt-6 border-l-2 border-primary bg-chalk px-4 py-3 text-sm text-primary">
                    {errors.form}
                  </p>
                )}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                  <button type="button" onClick={() => { setErrors({}); setStep('choose'); }} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
                    Back
                  </button>
                  <InteractiveHoverButton type="button" disabled={busy} onClick={() => void pay()} className="px-8">
                    {busy ? 'Processing payment…' : `Pay ${formatRupees(chosenPlan.price)} online`}
                  </InteractiveHoverButton>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            Prefer to talk first? <Link to="/membership" className="font-semibold underline underline-offset-4">See the membership plans</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
