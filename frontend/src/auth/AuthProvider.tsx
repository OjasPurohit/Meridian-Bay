import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AuthSession, EmployeeApplicationPending, LoginResult } from '@shared/types/api';
import type { AuthLoginRequest, AuthSignupRequest, StaffApplicationCreateRequest } from '@shared/types/requests.generated';
import type { UserRole } from '@shared/constants/enums';
import * as authApi from '@/api/auth';
import { isBackendConfigured, SESSION_ENDED_EVENT, setAuthToken } from '@/api/client';
import { demoAccount, DEMO_PASSWORD } from '@/features/demo/accounts'; // DEMO (temporary)
import { buildDemoSession, DEMO_TOKEN } from '@/features/demo/session'; // DEMO (temporary)

/**
 * Session state. A session only ever comes from the server's AuthSession response; the role is the server's,
 * never the browser's. The JWT is kept for the tab only (sessionStorage) and passwords are never stored.
 *
 * A person whose only record is a PENDING job application can log in but gets no session at all: the server answers
 * EMPLOYEE_APPLICATION_PENDING, which is kept here (name, email, date: nothing privileged) so the "under review" page
 * can show it. There is no token and no role in that state, so no dashboard or employee API opens.
 */
const STORAGE_KEY = 'mb.session';
const PENDING_KEY = 'mb.pending';

interface AuthContextValue {
  session: AuthSession | null;
  /** The pending job application of the person who just logged in / applied (no session, no privileges). */
  pending: EmployeeApplicationPending | null;
  /** Set when the server ended a signed-in session (expired token or deactivated account). */
  endedReason: string | null;
  /** True while a stored token is being re-validated with /auth/me. */
  restoring: boolean;
  login: (body: AuthLoginRequest) => Promise<LoginResult>;
  /** Member sign-up: with a plan id the membership is bought (paid online) in the same step. */
  signup: (body: AuthSignupRequest) => Promise<AuthSession>;
  /** Employee sign-up: creates a PENDING job application for the owner to decide. */
  applyAsEmployee: (body: StaffApplicationCreateRequest) => Promise<EmployeeApplicationPending>;
  logout: () => Promise<void>;
  /** DEMO (temporary): one-click sign-in. With a backend it is the real login of the seeded demo account; without one, a mock-data identity. */
  demoLogin: (role: UserRole) => Promise<AuthSession>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as AuthSession) : null;
    return s && new Date(s.expires_at) > new Date() ? s : null;
  } catch {
    return null;
  }
}

function readPending(): EmployeeApplicationPending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    const p = raw ? (JSON.parse(raw) as EmployeeApplicationPending) : null;
    return p?.state === 'EMPLOYEE_APPLICATION_PENDING' ? p : null;
  } catch {
    return null;
  }
}

export const isPendingResult = (r: LoginResult): r is EmployeeApplicationPending => 'state' in r && r.state === 'EMPLOYEE_APPLICATION_PENDING';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const s = readStored(); // DEMO: a preview-mode demo session survives a page reload (never with a backend: there the token is checked by /auth/me)
    return !isBackendConfigured && s?.token === DEMO_TOKEN ? s : null;
  });
  const [pending, setPendingState] = useState<EmployeeApplicationPending | null>(readPending);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(isBackendConfigured);

  const store = useCallback((s: AuthSession | null) => {
    setAuthToken(s?.token ?? null);
    setSession(s);
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const setPending = useCallback((p: EmployeeApplicationPending | null) => {
    setPendingState(p);
    try {
      if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state: p.state, full_name: p.full_name, email: p.email, applied_at: p.applied_at, redirect_to: p.redirect_to }));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* private mode: the page still works for this visit */
    }
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) return;
    const stored = readStored();
    if (!stored || stored.token === DEMO_TOKEN) {
      if (stored) store(null); // a leftover preview session has no server behind it
      setRestoring(false);
      return;
    }
    setAuthToken(stored.token);
    authApi
      .me()
      .then(store)
      .catch(() => store(null))
      .finally(() => setRestoring(false));
  }, [store]);

  // The live dashboards tell us when the server ended the session: sign out once, with the reason.
  useEffect(() => {
    const onEnded = (e: Event) => {
      setEndedReason((e as CustomEvent<string>).detail ?? 'AUTH_UNAUTHORIZED');
      store(null);
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [store]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      pending,
      endedReason,
      restoring,
      login: async (body) => {
        const r = await authApi.login(body);
        setEndedReason(null);
        if (isPendingResult(r)) {
          store(null); // no token, no role: nothing to sign in to
          setPending(r);
        } else {
          setPending(null);
          store(r);
        }
        return r;
      },
      signup: async (body) => {
        const s = await authApi.signup(body);
        setEndedReason(null);
        setPending(null);
        store(s);
        return s;
      },
      applyAsEmployee: async (body) => {
        const p = await authApi.applyAsEmployee(body);
        store(null);
        setPending(p);
        return p;
      },
      demoLogin: async (role) => {
        if (!isBackendConfigured) {
          const s = buildDemoSession(role);
          store(s);
          return s;
        }
        const r = await authApi.login({ email: demoAccount(role).user.email, password: DEMO_PASSWORD }); // the normal login: bcrypt, real JWT, server-side role
        if (isPendingResult(r)) throw new Error('This demo account is not available right now.');
        setEndedReason(null);
        setPending(null);
        store(r);
        return r;
      },
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        setPending(null);
        store(null);
      },
    }),
    [session, pending, endedReason, restoring, store, setPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const OPEN_LOGIN_EVENT = 'auth:open-login';

/** Opens the header login menu from anywhere (e.g. "Already a member? Log in"). */
export function openLoginMenu() {
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new Event(OPEN_LOGIN_EVENT));
}
