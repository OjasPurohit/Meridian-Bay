import { useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, isBackendConfigured } from '@/api/client';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { field, label } from '@/features/public/components/EnquirySection';
import { cn } from '@/lib/utils';
import { useAuth } from './AuthProvider';
import { ROLES } from './roles';

interface Props {
  idPrefix: string;
  firstFieldRef?: RefObject<HTMLInputElement | null>;
  onDone?: () => void;
  compact?: boolean;
}

/** Email + password sign-in against POST /auth/login. Success only ever comes from the server. */
export function LoginForm({ idPrefix, firstFieldRef, onDone, compact }: Props) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    setBusy(true);
    try {
      const s = await login({ email: String(f.get('email') ?? '').trim(), password: String(f.get('password') ?? '') });
      onDone?.();
      navigate(s.redirect_to);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputCls = cn(field, compact && 'min-h-11 py-2.5');

  return (
    <div>
      <form onSubmit={onSubmit} noValidate={false} aria-describedby={error ? `${idPrefix}-error` : undefined}>
        <label className="block">
          <span className={label}>Email</span>
          <input ref={firstFieldRef} name="email" type="email" required autoComplete="email" className={inputCls} />
        </label>
        <label className="mt-4 block">
          <span className={label}>Password</span>
          <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
        </label>
        {error && (
          <p id={`${idPrefix}-error`} role="alert" className="mt-4 border-l-2 border-primary bg-chalk px-3 py-2 text-sm text-primary">
            {error}
          </p>
        )}
        <InteractiveHoverButton type="submit" disabled={busy} className="mt-5 w-full">
          {busy ? 'Logging in…' : 'Log in'}
        </InteractiveHoverButton>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        New to Meridian Bay?{' '}
        <Link to="/signup" onClick={onDone} className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">
          Sign up
        </Link>
      </p>

      {!isBackendConfigured && (
        <div className="mt-2 border-t border-line pt-4">
          <p className="text-xs leading-relaxed text-muted">Sign-in isn’t connected yet. Meanwhile, explore each dashboard with demo data:</p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0">
            {ROLES.map((r) => (
              <li key={r.role}>
                <Link to={r.home} onClick={onDone} className="inline-flex min-h-9 items-center text-xs font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
