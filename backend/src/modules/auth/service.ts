/**
 * Authentication (FR-AUTH-*): login, member sign-up (+ paid membership), session restore (me), change password.
 * Uses the kernel's signToken(); one JWT claim set per role (member_id | staff_id).
 * A person who only has a PENDING job application can log in, but gets the EMPLOYEE_APPLICATION_PENDING state
 * instead of a session: no token, no role (FR-AUTH-008).
 * Not implemented yet by decision: login rate limiting and must_change_password enforcement.
 */
import bcrypt from 'bcryptjs';
import type { AuthSession, EmployeeApplicationPending, LoginResult } from '@shared/types/api';
import type { AuthChangePasswordRequest, AuthLoginRequest, AuthSignupRequest } from '@shared/types/requests.generated';
import { ROLE_HOME_ROUTE } from '@shared/constants/rules';
import { USER_ROLE } from '@shared/constants/enums';
import type { User } from '@shared/types/rows';
import { getConfig } from '../../config';
import { signToken, type TokenClaims } from '../../kernel/auth';
import { withTransaction } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import * as members from '../members/repo';
import { buyMembership } from '../members/service';
import * as repo from './repo';

/** A hash to compare against when the email is unknown, so "no such user" and "wrong password" take the same time. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 4);

async function buildSession(user: User): Promise<AuthSession> {
  const db = members.pool;
  const claims: TokenClaims = { sub: user.id, role: user.role };
  let member = null;
  let staff = null;
  if (user.role === USER_ROLE.MEMBER) {
    member = await members.summaryByUserId(db, user.id);
    if (member) claims.member_id = member.id;
  } else {
    staff = await repo.staffByUserId(db, user.id);
    if (staff) claims.staff_id = staff.id;
  }
  const { token, expires_at } = signToken(claims);
  const { id, email, full_name, phone, role, is_active, must_change_password, created_at } = user;
  return {
    token,
    expires_at,
    user: { id, email, full_name, phone, role, is_active, must_change_password, created_at } as AuthSession['user'],
    redirect_to: ROLE_HOME_ROUTE[user.role],
    member,
    staff,
  };
}

export const AuthService = {
  async login(body: AuthLoginRequest): Promise<LoginResult> {
    const user = await repo.findUserByEmail(members.pool, body.email);
    if (user) {
      const ok = await bcrypt.compare(body.password, user.password_hash);
      if (!ok) throw new AppError('AUTH_INVALID');
      if (!user.is_active) throw new AppError('ACCOUNT_DISABLED');
      return buildSession(user);
    }
    // No such user: is this a PENDING job applicant? (the hash is compared either way, so timing does not tell)
    const app = await repo.pendingApplicationByEmail(members.pool, body.email);
    const ok = await bcrypt.compare(body.password, app?.password_hash ?? DUMMY_HASH);
    if (!app || !ok) throw new AppError('AUTH_INVALID');
    const pending: EmployeeApplicationPending = { state: 'EMPLOYEE_APPLICATION_PENDING', full_name: app.full_name, email: app.email, applied_at: app.applied_at, redirect_to: '/employee-application-pending' };
    return pending;
  },

  /**
   * Self-service sign-up creates a MEMBER (never staff / owner). With a plan, the membership and its online payment are
   * created in the SAME transaction (mock gateway, ADR-011): if anything fails nothing is created.
   */
  async signup(body: AuthSignupRequest): Promise<AuthSession> {
    const password_hash = await bcrypt.hash(body.password, getConfig().bcrypt_rounds);
    const user_id = await withTransaction(async (tx) => {
      if (await repo.pendingApplicationByEmail(tx, body.email)) throw new AppError('APPLICATION_PENDING');
      const id = await members.insertMemberUser(tx, { email: body.email, password_hash, full_name: body.full_name, phone: body.phone, must_change_password: false });
      const member_id = await members.insertMember(tx, { user_id: id, date_of_birth: body.date_of_birth ?? null, address: body.address ?? null, emergency_contact_name: null, emergency_contact_phone: null });
      if (body.membership_plan_id) await buyMembership(tx, { member_id, plan_id: body.membership_plan_id, method: 'ONLINE', received_by_user_id: null });
      return id;
    });
    return buildSession((await repo.findUserById(members.pool, user_id))!);
  },

  async me(user_id: string): Promise<AuthSession> {
    const user = await repo.findUserById(members.pool, user_id);
    if (!user) throw new AppError('AUTH_UNAUTHORIZED');
    return buildSession(user);
  },

  async changePassword(user_id: string, body: AuthChangePasswordRequest): Promise<void> {
    const user = await repo.findUserById(members.pool, user_id);
    if (!user) throw new AppError('AUTH_UNAUTHORIZED');
    if (!(await bcrypt.compare(body.current_password, user.password_hash))) throw new AppError('AUTH_INVALID');
    await repo.setPassword(members.pool, user_id, await bcrypt.hash(body.new_password, getConfig().bcrypt_rounds));
  },
};
