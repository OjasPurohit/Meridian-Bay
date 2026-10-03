import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { OPEN_LOGIN_EVENT, useAuth } from './AuthProvider';
import { LoginForm } from './LoginForm';
import { roleInfo } from './roles';

/** Header "Log in" control with an anchored dropdown panel (never a full-page overlay). */
export function LoginMenu() {
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LOGIN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => firstField.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const firstName = session?.user.full_name.split(' ')[0];

  return (
    <div ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1 px-2 text-[0.9rem] font-medium sm:px-3"
      >
        {session ? firstName : 'Log in'}
        <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
      </button>

      <div
        id={panelId}
        role="dialog"
        aria-label={session ? 'Your account' : 'Log in'}
        hidden={!open}
        className="fixed inset-x-4 top-[4.75rem] z-50 max-h-[calc(100svh-5.5rem)] overflow-y-auto border border-line bg-sand p-5 text-ink shadow-[0_24px_60px_-28px_rgba(30,37,32,0.5)] sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[21rem]"
      >
        {session ? (
          <div>
            <p className="eyebrow text-olive-mid">{roleInfo(session.user.role).label}</p>
            <p className="display mt-2 text-2xl">{session.user.full_name}</p>
            <p className="mt-1 text-sm break-all text-muted">{session.user.email}</p>
            <div className="mt-5 flex flex-col gap-2">
              <Link to={session.redirect_to} className="inline-flex min-h-11 items-center justify-center rounded-full bg-olive px-5 font-semibold text-chalk">
                Go to dashboard
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  close();
                  navigate('/');
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/25 px-5 font-semibold hover:border-ink"
              >
                Log out
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="display mb-4 text-2xl">Welcome back</p>
            <LoginForm idPrefix={panelId} firstFieldRef={firstField} onDone={() => close(false)} compact />
          </>
        )}
      </div>
    </div>
  );
}
