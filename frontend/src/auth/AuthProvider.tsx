import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AuthSession } from '@shared/types/api';
import type { AuthLoginRequest, AuthSignupRequest } from '@shared/types/requests.generated';
import type { UserRole } from '@shared/constants/enums';
import * as authApi from '@/api/auth';
import { isBackendConfigured, setAuthToken } from '@/api/client';
import { buildDemoSession, DEMO_TOKEN } from '@/features/demo/session'; // DEMO (temporary)

/**
 * Session state. A session only ever comes from the server's AuthSession response; the role is the server's,
 * never the browser's. The JWT is kept for the tab only (sessionStorage) and passwords are never stored.
 */
const STORAGE_KEY = 'mb.session';

interface AuthContextValue {
  session: AuthSession | null;
  /** True while a stored token is being re-validated with /auth/me. */
  restoring: boolean;
  login: (body: AuthLoginRequest) => Promise<AuthSession>;
  signup: (body: AuthSignupRequest) => Promise<AuthSession>;
  logout: () => Promise<void>;
  /** DEMO (temporary): one-click sign-in as a mock-data identity. */
  demoLogin: (role: UserRole) => AuthSession;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const s = readStored(); // DEMO: a demo session survives a page reload
    return s?.token === DEMO_TOKEN ? s : null;
  });
  const [restoring, setRestoring] = useState(isBackendConfigured);

  const store = useCallback((s: AuthSession | null) => {
    setAuthToken(s?.token ?? null);
    setSession(s);
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) return;
    const stored = readStored();
    if (!stored || stored.token === DEMO_TOKEN) {
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

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      restoring,
      login: async (body) => {
        const s = await authApi.login(body);
        store(s);
        return s;
      },
      signup: async (body) => {
        const s = await authApi.signup(body);
        store(s);
        return s;
      },
      demoLogin: (role) => {
        const s = buildDemoSession(role);
        store(s);
        return s;
      },
      logout: async () => {
        await authApi.logout().catch(() => undefined);
        store(null);
      },
    }),
    [session, restoring, store],
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
