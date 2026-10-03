/**
 * Authentication + authorisation infrastructure (ADR-002). The auth *module* (signup/login/me) is a separate task and
 * will use signToken(); this file only provides the shared pieces:
 *   signToken / verifyToken   HS256 JWT, 8 h (config), claims: sub, role, member_id | staff_id | business_client_id
 *   requireAuth               Bearer token -> req.user; re-checks users.is_active (short cache) => ACCOUNT_DISABLED
 *   optionalAuth              same, but anonymous callers pass (PUBLIC endpoints that vary by role)
 *   requireRole(...roles)     copy of the `roles` of the endpoint in tools/api/endpoints.mjs (own-record scoping
 *                             `:own` is applied in the service with callerScope)
 *   callerScope(req)          { member_id } | { staff_id } | { business_client_id }
 */
import jwt from 'jsonwebtoken';
import type { RequestHandler, Request } from 'express';
import { USER_ROLE, type UserRole } from '@shared/constants/enums';
import { getConfig } from '../config';
import { query } from './db';
import { AppError } from './errors';
import { asyncHandler } from './http';

export interface TokenClaims {
  sub: string; // users.id
  role: UserRole;
  member_id?: string;
  staff_id?: string;
  business_client_id?: string;
}

export interface AuthUser {
  id: string;
  role: UserRole;
  member_id?: string;
  staff_id?: string;
  business_client_id?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth / optionalAuth. */
      user?: AuthUser;
    }
  }
}

const ROLES = new Set<string>(Object.values(USER_ROLE));

// ------------------------------------------------------------------ tokens
export function signToken(claims: TokenClaims): { token: string; expires_at: string } {
  const { sub, ...payload } = claims;
  const { jwt_secret, jwt_expires_in } = getConfig();
  const token = jwt.sign(payload, jwt_secret, {
    algorithm: 'HS256',
    subject: sub,
    expiresIn: jwt_expires_in as jwt.SignOptions['expiresIn'],
  });
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, expires_at: new Date(exp * 1000).toISOString() };
}

/** Any problem (malformed, expired, wrong signature, unknown role) is AUTH_UNAUTHORIZED. */
export function verifyToken(token: string): TokenClaims {
  let decoded: jwt.JwtPayload;
  try {
    const result = jwt.verify(token, getConfig().jwt_secret, { algorithms: ['HS256'] });
    if (typeof result === 'string') throw new Error('unexpected payload');
    decoded = result;
  } catch {
    throw new AppError('AUTH_UNAUTHORIZED');
  }
  if (typeof decoded.sub !== 'string' || typeof decoded.role !== 'string' || !ROLES.has(decoded.role)) {
    throw new AppError('AUTH_UNAUTHORIZED');
  }
  const claims: TokenClaims = { sub: decoded.sub, role: decoded.role as UserRole };
  for (const key of ['member_id', 'staff_id', 'business_client_id'] as const) {
    if (typeof decoded[key] === 'string') claims[key] = decoded[key];
  }
  return claims;
}

// ------------------------------------------------------------------ "is this account still active?" (short cache)
interface UserState {
  is_active: boolean;
  role: UserRole;
}

/** Short on purpose: deactivation must bite almost immediately (INTEGRATION_CHECKLIST C7). */
export const USER_CACHE_TTL_MS = 5_000;

const userCache = new Map<string, { state: UserState | null; expires: number }>();

export type UserStateLoader = (user_id: string) => Promise<UserState | null>;

const loadUserStateFromDb: UserStateLoader = async (user_id) => {
  const { rows } = await query<UserState>('SELECT is_active, role FROM users WHERE id = $1', [user_id]);
  return rows[0] ?? null;
};

let loadUserState: UserStateLoader = loadUserStateFromDb;

/** Test hook: replace the DB lookup. Call with no argument to restore. */
export function setUserStateLoader(loader?: UserStateLoader): void {
  loadUserState = loader ?? loadUserStateFromDb;
  userCache.clear();
}

/** Call after a user is (de)activated or their role changes so the change applies immediately. */
export function invalidateUserCache(user_id?: string): void {
  if (user_id) userCache.delete(user_id);
  else userCache.clear();
}

async function currentUserState(user_id: string): Promise<UserState | null> {
  const hit = userCache.get(user_id);
  if (hit && hit.expires > Date.now()) return hit.state;
  const state = await loadUserState(user_id);
  userCache.set(user_id, { state, expires: Date.now() + USER_CACHE_TTL_MS });
  return state;
}

// ------------------------------------------------------------------ middleware
function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token, extra] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra) throw new AppError('AUTH_UNAUTHORIZED');
  return token;
}

async function authenticate(req: Request, token: string): Promise<void> {
  const claims = verifyToken(token);
  const state = await currentUserState(claims.sub);
  if (!state) throw new AppError('AUTH_UNAUTHORIZED'); // user no longer exists
  if (!state.is_active) throw new AppError('ACCOUNT_DISABLED');
  if (state.role !== claims.role) throw new AppError('AUTH_UNAUTHORIZED'); // role changed since the token was issued
  const user: AuthUser = { id: claims.sub, role: claims.role };
  if (claims.member_id) user.member_id = claims.member_id;
  if (claims.staff_id) user.staff_id = claims.staff_id;
  if (claims.business_client_id) user.business_client_id = claims.business_client_id;
  req.user = user;
}

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw new AppError('AUTH_UNAUTHORIZED');
  await authenticate(req, token);
  next();
});

/** For PUBLIC endpoints whose answer depends on who is asking (member price, staff-only fields). An invalid token on
 *  such an endpoint is still rejected — silently ignoring it would hide an expired session from the client. */
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (token) await authenticate(req, token);
  next();
});

export type RoleGuard = RequestHandler & { roles: readonly UserRole[] };

/** Must run after requireAuth. The `roles` property lets the contract test compare guards with endpoints.mjs. */
export function requireRole(...roles: UserRole[]): RoleGuard {
  const guard: RequestHandler = (req, _res, next) => {
    if (!req.user) return next(new AppError('AUTH_UNAUTHORIZED'));
    if (!roles.includes(req.user.role)) return next(new AppError('FORBIDDEN'));
    next();
  };
  return Object.assign(guard, { roles: Object.freeze([...roles]) as readonly UserRole[] });
}

// ------------------------------------------------------------------ own-record scoping
export type CallerScope = { member_id: string } | { staff_id: string } | { business_client_id: string };

/** The profile id of the caller, for `WHERE member_id = :id` style scoping in services (PERMISSIONS_MATRIX §3.1).
 *  Which key is present follows the role: MEMBER -> member_id, BUSINESS_CLIENT -> business_client_id, staff -> staff_id. */
export function callerScope(req: Request): CallerScope {
  const user = req.user;
  if (!user) throw new AppError('AUTH_UNAUTHORIZED');
  if (user.role === USER_ROLE.MEMBER && user.member_id) return { member_id: user.member_id };
  if (user.role === USER_ROLE.BUSINESS_CLIENT && user.business_client_id) return { business_client_id: user.business_client_id };
  if (user.staff_id && user.role !== USER_ROLE.MEMBER && user.role !== USER_ROLE.BUSINESS_CLIENT) return { staff_id: user.staff_id };
  throw new AppError('FORBIDDEN'); // the account has no profile of the kind its role requires
}
