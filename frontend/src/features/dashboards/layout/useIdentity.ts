import type { UserRole } from '@shared/constants/enums';
import { demoAccount } from '@/features/demo/accounts';
import { ALL_MEMBERS } from '../store/staticData';
import { BUSINESS_CLIENT } from '../store/seed';

/** Who the dashboard is showing. Until a backend exists this is the role's mock-data identity. */
export function useDemoIdentity(role: UserRole) {
  const account = demoAccount(role);
  const member = role === 'MEMBER' ? ALL_MEMBERS.find((m) => m.user_id === account.user.id) : undefined;
  return { account, member, client: role === 'BUSINESS_CLIENT' ? BUSINESS_CLIENT : undefined };
}
