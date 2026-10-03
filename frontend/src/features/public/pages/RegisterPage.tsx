import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';

import type { UserRole } from '@shared/constants/enums';
import type { MembershipPlan } from '@shared/types/rows';
import { ApiError, isBackendConfigured } from '@/api/client';
import { listPlans } from '@/api/public';
import { openLoginMenu, useAuth } from '@/auth/AuthProvider';
import { ROLES } from '@/auth/roles';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { field, label } from '@/features/public/components/EnquirySection';
import { DAY_PASS_SLUG, planShortName, planSlug } from '@/features/membership/plans';
import { formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';

type Errors = Partial<Record<'full_name' | 'email' | 'phone' | 'password' | 'confirm' | 'date_of_birth' | 'form', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{8,20}$/;

function validate(v: Record<string, string>, needsDob: boolean): Errors {
  const e: Errors = {};
  if (v.full_name.length < 2 || v.full_name.length > 120) e.full_name = 'Enter your full name (2–120 characters).';
  if (!EMAIL.test(v.email)) e.email = 'Enter a valid email address.';
  if (!PHONE.test(v.phone)) e.phone = 'Enter a phone number with at least 8 digits.';
  if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Use at least 8 characters, including a letter and a number.';
  if (v.confirm !== v.password) e.confirm = 'Passwords don’t match.';
  if (needsDob && !v.date_of_birth) e.date_of_birth = 'Junior membership needs the player’s date of birth.';
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

export default function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [role, setRole] = useState<UserRole>('MEMBER');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listPlans().then(setPlans);
  }, []);

  const requested = params.get('plan') ?? '';
  const plan = useMemo(() => plans.find((p) => planSlug(p) === requested) ?? null, [plans, requested]);
  const dayPass = requested === DAY_PASS_SLUG;
  const needsDob = plan?.max_age != null;
  const selected = ROLES.find((r) => r.role === role)!;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected.selfService) return;
    const f = new FormData(e.currentTarget);
    const v = Object.fromEntries(['full_name', 'email', 'phone', 'password', 'confirm', 'date_of_birth'].map((k) => [k, String(f.get(k) ?? '').trim()]));
    v.password = String(f.get('password') ?? '');
    v.confirm = String(f.get('confirm') ?? '');
    const found = validate(v, needsDob);
    setErrors(found);
    if (Object.keys(found).length) {
      const form = e.currentTarget;
      window.setTimeout(() => (form.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const s = await signup({ full_name: v.full_name, email: v.email, phone: v.phone, password: v.password, date_of_birth: v.date_of_birth || undefined });
      navigate(plan ? `${s.redirect_to}?plan=${planSlug(plan)}` : s.redirect_to);
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const invalid = (k: keyof Errors) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `err-${k}` : undefined });

  return (
    <div className="bg-clay pt-18">
      <section aria-labelledby="signup-title" className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 pt-16 pb-24 md:px-10 md:pt-24 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow text-olive-mid">Create an account</p>
          <h1 id="signup-title" className="display mt-6 text-[clamp(2.6rem,5.6vw,4.75rem)] leading-[0.96] text-balance">
            Join Meridian Bay.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            A member account lets you book courts, join Friday social play and order gear. Until you buy a plan you play at walk-in rates.
          </p>

          {plan && (
            <div className="mt-10 border-t border-ink/15 pt-6">
              <p className="eyebrow text-olive-mid">Chosen plan</p>
              <p className="display mt-2 text-3xl">{planShortName(plan)}</p>
              <p className="mt-1 text-sm text-muted">
                {formatRupees(plan.price)} / {plan.duration_months} months. You’ll buy the plan from your dashboard (or at the front desk) after your account is created.
              </p>
              <Link to="/membership" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
                Change plan
              </Link>
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
          <form onSubmit={onSubmit} noValidate className="bg-sand p-6 shadow-[0_30px_80px_-40px_rgba(30,37,32,0.45)] sm:p-10">
            <fieldset>
              <legend className={label}>I’m joining as</legend>
              <p className="mt-1 text-sm text-muted">Members can sign up here. Staff and business accounts are created by the club owner, so they can’t be requested from this page.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ROLES.map((r) => (
                  <label
                    key={r.role}
                    className={cn(
                      'flex min-h-16 cursor-pointer flex-col justify-center border px-4 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                      role === r.role ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk hover:border-olive-mid',
                      r.role === 'MEMBER' && 'sm:col-span-2',
                    )}
                  >
                    <input type="radio" name="role" value={r.role} checked={role === r.role} onChange={() => setRole(r.role)} className="sr-only" />
                    <span className="flex items-center gap-2 font-semibold">
                      {r.label}
                      {!r.selfService && <Lock className="size-3.5 opacity-70" aria-label="Invitation only" />}
                    </span>
                    <span className={cn('text-xs', role === r.role ? 'text-chalk/75' : 'text-muted')}>{r.summary}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {selected.selfService ? (
              <>
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={label}>{needsDob ? 'Player or guardian full name' : 'Full name'}</span>
                    <input name="full_name" required autoComplete="name" maxLength={120} className={field} {...invalid('full_name')} />
                    <FieldError id="err-full_name" msg={errors.full_name} />
                  </label>
                  <label>
                    <span className={label}>Email</span>
                    <input name="email" type="email" required autoComplete="email" className={field} {...invalid('email')} />
                    <FieldError id="err-email" msg={errors.email} />
                  </label>
                  <label>
                    <span className={label}>Phone</span>
                    <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" className={field} {...invalid('phone')} />
                    <FieldError id="err-phone" msg={errors.phone} />
                  </label>
                  <label>
                    <span className={label}>Password</span>
                    <input name="password" type="password" required autoComplete="new-password" className={field} {...invalid('password')} />
                    <FieldError id="err-password" msg={errors.password ?? undefined} />
                    {!errors.password && <p className="mt-1.5 text-xs text-muted">At least 8 characters, with a letter and a number.</p>}
                  </label>
                  <label>
                    <span className={label}>Confirm password</span>
                    <input name="confirm" type="password" required autoComplete="new-password" className={field} {...invalid('confirm')} />
                    <FieldError id="err-confirm" msg={errors.confirm} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className={label}>
                      Date of birth {!needsDob && <span className="font-normal text-muted">(optional)</span>}
                    </span>
                    <input name="date_of_birth" type="date" required={needsDob} className={field} {...invalid('date_of_birth')} />
                    <FieldError id="err-date_of_birth" msg={errors.date_of_birth} />
                  </label>
                </div>

                {errors.form && (
                  <p role="alert" className="mt-6 border-l-2 border-primary bg-chalk px-4 py-3 text-sm text-primary">
                    {errors.form}
                  </p>
                )}

                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <InteractiveHoverButton type="submit" disabled={busy} className="px-8">
                    {busy ? 'Creating account…' : 'Create member account'}
                  </InteractiveHoverButton>
                  {!isBackendConfigured && <p className="text-xs text-muted sm:max-w-[15rem] sm:text-right">Accounts aren’t connected yet, so no account can be created today.</p>}
                </div>
              </>
            ) : (
              <div role="status" className="mt-8 border border-line bg-chalk p-5">
                <p className="font-semibold">{selected.label} accounts are invitation only.</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  The club owner creates {selected.label.toLowerCase()} accounts and shares a temporary password, which you change when you first log in. If you already have one, log in instead.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={openLoginMenu} className="inline-flex min-h-11 items-center rounded-full border border-ink/25 px-5 font-semibold hover:border-ink">
                    Log in
                  </button>
                  <button type="button" onClick={() => setRole('MEMBER')} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-4">
                    Sign up as a member
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
