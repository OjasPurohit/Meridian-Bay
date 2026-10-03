import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info, Loader2 } from 'lucide-react';

import type { UserRole } from '@shared/constants/enums';
import type { AuthSession } from '@shared/types/api';
import { isBackendConfigured } from '@/api/client';
import { openLoginMenu, useAuth } from '@/auth/AuthProvider';
import { roleInfo } from '@/auth/roles';
import { cn } from '@/lib/utils';
import { isLive, startLive, stopLive } from '../store/live';

const wrap = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';

/** Loads once and exposes loading / error / data. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => live && setState({ data: null, error: e instanceof Error ? e.message : 'Could not load this dashboard.', loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/**
 * Role gate. With a backend configured it requires a real session with the matching role (UX only — the API
 * enforces access). Without one, dashboards open as clearly labelled previews of seed data.
 */
export function Gate({ role, children }: { role: UserRole; children: ReactNode }) {
  const { session, restoring } = useAuth();
  if (!isBackendConfigured) return <>{children}</>;
  if (restoring) return <Loading label="Checking your session" />;
  if (!session)
    return (
      <Notice title="Please log in" body={`The ${roleInfo(role).label.toLowerCase()} dashboard needs a signed-in account.`}>
        <button type="button" onClick={openLoginMenu} className="inline-flex min-h-11 items-center rounded-full border border-ink/25 px-5 font-semibold hover:border-ink">
          Log in
        </button>
      </Notice>
    );
  if (session.user.role !== role)
    return (
      <Notice title="Not available for your account" body={`This page is for ${roleInfo(role).label.toLowerCase()} accounts.`}>
        <Link to={session.redirect_to} className="inline-flex min-h-11 items-center rounded-full border border-ink/25 px-5 font-semibold hover:border-ink">
          Go to my dashboard
        </Link>
      </Notice>
    );
  return <LiveData session={session}>{children}</LiveData>;
}

/** With a backend: load what this role may see from the API before the page renders (store/live.ts). */
function LiveData({ session, children }: { session: AuthSession; children: ReactNode }) {
  const [ready, setReady] = useState(isLive());
  useEffect(() => {
    let on = true;
    void startLive(session).then(() => on && setReady(true));
    return () => {
      on = false;
      stopLive();
    };
  }, [session]);
  if (!ready) return <Loading label="Loading your data" />;
  return <>{children}</>;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-muted">
      <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function Notice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className={cn(wrap, 'py-24')}>
      <div className="max-w-lg border border-line bg-chalk p-8">
        <h1 className="display text-3xl">{title}</h1>
        <p className="mt-3 text-muted">{body}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-ink/20 px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="border-l-2 border-primary bg-chalk px-4 py-3 text-sm text-primary">
      {message}
    </p>
  );
}

export function Panel({ id, title, action, children, className }: { id?: string; title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn('min-w-0 scroll-mt-40 border border-line bg-chalk p-5 sm:p-7', className)}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id ? `${id}-title` : undefined} className="display text-2xl sm:text-[1.75rem]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="border border-line bg-chalk p-5">
      <p className="eyebrow text-olive-mid">{label}</p>
      <p className="display mt-3 text-4xl leading-none tabular-nums">{value}</p>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

const TONES = {
  green: 'bg-olive/10 text-olive',
  sun: 'bg-sun/20 text-ink',
  rust: 'bg-terracotta/12 text-primary',
  muted: 'bg-ink/6 text-muted',
} as const;

export function Badge({ tone = 'muted', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn('inline-flex items-center px-2 py-0.5 text-[0.7rem] font-semibold tracking-[0.08em] whitespace-nowrap uppercase', TONES[tone])}>{children}</span>;
}

interface ShellProps {
  role: UserRole;
  title: string;
  intro: string;
  sections?: { id: string; label: string }[];
  /** Explains which preview identity the data belongs to. */
  previewOf?: string;
  children: ReactNode;
}

export function DashboardShell({ role, title, intro, sections = [], previewOf, children }: ShellProps) {
  const info = roleInfo(role);
  return (
    <Gate role={role}>
      <div className="bg-sand pt-18">
        <div className={cn(wrap, 'pt-12 pb-8 md:pt-16')}>
          <p className="eyebrow text-olive-mid">{info.label} dashboard</p>
          <h1 className="display mt-4 text-[clamp(2.4rem,5vw,4.25rem)] leading-[0.98] text-balance">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{intro}</p>
          <div role="note" className="mt-6 flex max-w-3xl gap-3 border border-sun/50 bg-sun/12 px-4 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">Preview with demo data.</span> {previewOf ? `${previewOf} ` : ''}
              Records are fictional seed data; nothing here is saved, and live data arrives with the club’s backend.
            </p>
          </div>
        </div>
        {sections.length > 0 && (
          <nav aria-label={`${info.label} dashboard sections`} className="sticky top-18 z-30 border-y border-line bg-sand/95">
            <ul className={cn(wrap, 'flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]')}>
              {sections.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-ink/75 transition-colors hover:bg-chalk hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className={cn(wrap, 'pt-8 pb-24')}>{children}</div>
      </div>
    </Gate>
  );
}
