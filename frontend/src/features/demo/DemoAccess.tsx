import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChefHat, ConciergeBell, Crown, Loader2, Store, UserRound, type LucideIcon } from 'lucide-react';

import type { UserRole } from '@shared/constants/enums';
import { useAuth } from '@/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { DEMO_ACCOUNTS } from './accounts';

export const DEMO_ICON: Record<UserRole, LucideIcon> = {
  MEMBER: UserRound,
  FRONT_DESK: ConciergeBell,
  STORE_MANAGER: Store,
  KITCHEN_MANAGER: ChefHat,
  OWNER_ADMIN: Crown,
};

/** One-click demo login. `compact` = the header dropdown; default = the /demo page cards. */
export function DemoAccess({ compact = false, onPicked }: { compact?: boolean; onPicked?: () => void }) {
  const { demoLogin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<UserRole | null>(null);

  const [error, setError] = useState<string | null>(null);

  const pick = async (role: UserRole) => {
    setBusy(role);
    setError(null);
    try {
      const s = await demoLogin(role);
      onPicked?.();
      navigate(s.redirect_to);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
      setBusy(null);
    }
  };

  if (compact) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <p className="eyebrow text-olive-mid">Demo access</p>
        <p className="mt-1 mb-3 text-xs text-muted">Temporary one-click sign-in for the presentation.</p>
        {error && <p role="alert" className="mb-2 text-xs text-primary">{error}</p>}
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {DEMO_ACCOUNTS.map((a) => {
            const Icon = DEMO_ICON[a.role];
            return (
              <li key={a.role}>
                <button type="button" onClick={() => void pick(a.role)} disabled={busy !== null} className="group flex min-h-11 w-full items-center gap-3 overflow-hidden border border-line bg-chalk px-3 text-left transition-[border-color,transform,background-color] duration-200 hover:border-olive hover:bg-olive/6 active:scale-[0.98] disabled:opacity-60">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-olive/10 text-olive transition-colors group-hover:bg-olive group-hover:text-chalk">{busy === a.role ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" aria-hidden="true" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{a.label}</span>
                    <span className="block truncate text-xs text-muted">{a.tagline}</span>
                  </span>
                  <ArrowRight className="size-4 -translate-x-1 text-olive opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <>
    {error && <p role="alert" className="mb-4 text-sm text-primary">{error}</p>}
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {DEMO_ACCOUNTS.map((a, i) => {
        const Icon = DEMO_ICON[a.role];
        return (
          <li key={a.role} style={{ ['--d' as string]: `${i * 80}ms` }} className={cn('anim-rise', i === 4 && 'sm:col-span-2 xl:col-span-1')}>
            <button type="button" onClick={() => void pick(a.role)} disabled={busy !== null} className="card-lift group flex h-full w-full flex-col border border-line bg-chalk p-6 text-left disabled:opacity-60">
              <span className="grid size-12 place-items-center rounded-full bg-olive text-chalk transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">{busy === a.role ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" aria-hidden="true" />}</span>
              <p className="display mt-5 text-2xl">{a.label}</p>
              <p className="mt-1 text-sm text-muted">{a.tagline}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-ink/80">
                {a.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sun" />
                    {h}
                  </li>
                ))}
              </ul>
              <span className="mt-6 inline-flex items-center gap-2 pt-2 font-semibold text-primary">
                Enter dashboard <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}
