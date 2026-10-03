import type { UserRole } from '@shared/constants/enums';
import type { AuthSession } from '@shared/types/api';
import { demoAccount } from './accounts';

/** Marker token: lets AuthProvider tell a demo session from a real one (a real server never issues it). */
export const DEMO_TOKEN = 'demo-session';

/** An AuthSession for a mock-data identity. Never sent to a server; the password hash is stripped. */
export function buildDemoSession(role: UserRole): AuthSession {
  const a = demoAccount(role);
  const { password_hash: _hash, ...user } = a.user;
  return {
    token: DEMO_TOKEN,
    expires_at: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    user,
    redirect_to: a.home,
    member: null,
    staff: null,
    business_client: null,
  };
}
