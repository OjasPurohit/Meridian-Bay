import type { UserRole } from '@shared/constants/enums';
import { demoAccount } from '@/features/demo/accounts';
import { useAuth } from '@/auth/AuthProvider';
import { ALL_MEMBERS } from '../store/staticData';

/** Who the dashboard is showing. Until a backend exists this is the role's mock-data identity. */
export function useDemoIdentity(role: UserRole) {
  const { session } = useAuth();
  const live = !!session && session.token !== 'demo-session';
  const account = demoAccount(role);
  const userId = live ? session.user.id : account.user.id;
  const member = role === 'MEMBER' ? ALL_MEMBERS.find((m) => m.user_id === userId) : undefined;
  return { account, member };
}
