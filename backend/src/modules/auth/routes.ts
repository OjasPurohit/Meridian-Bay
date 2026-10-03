/**
 * HTTP mapping for auth. Roles copy tools/api/endpoints.mjs:
 *   auth.signup / auth.login  PUBLIC
 *   auth.logout / auth.me / auth.changePassword  every authenticated role
 */
import { Router } from 'express';
import type { AuthChangePasswordRequest, AuthLoginRequest, AuthSignupRequest } from '@shared/types/requests.generated';
import { requireAuth } from '../../kernel/auth';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok } from '../../kernel/http';
import { strictObject, validateBody, z, type Schema } from '../../kernel/validate';
import { AuthService } from './service';

export const router = Router();

const email = z.string().trim().toLowerCase().email('Must be a valid email address.').max(254);
const password = z
  .string()
  .min(8, 'Must be at least 8 characters.')
  .refine((v) => /[A-Za-z]/.test(v), 'Must contain at least one letter.')
  .refine((v) => /\d/.test(v), 'Must contain at least one digit.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Must be at most 72 bytes (bcrypt limit).');

const loginBody: Schema<AuthLoginRequest> = strictObject({ email, password: z.string().min(1).max(200) });
const signupBody: Schema<AuthSignupRequest> = strictObject({
  full_name: z.string().trim().min(2).max(120),
  email,
  phone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number: E.164 (+919820000006) or 10 digits.'),
  password,
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date (YYYY-MM-DD).')
    .refine((v) => v < new Date().toISOString().slice(0, 10), 'Must be in the past.')
    .optional(),
});
const changePasswordBody: Schema<AuthChangePasswordRequest> = strictObject({ current_password: z.string().min(1).max(200), new_password: password });

const userId = (req: Express.Request): string => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user.id;
};

router.post('/login', validateBody(loginBody), asyncHandler(async (req, res) => ok(res, await AuthService.login(req.body as AuthLoginRequest))));
router.post('/signup', validateBody(signupBody), asyncHandler(async (req, res) => created(res, await AuthService.signup(req.body as AuthSignupRequest))));
router.post('/logout', requireAuth, asyncHandler(async (_req, res) => ok(res, null)));
router.get('/me', requireAuth, asyncHandler(async (req, res) => ok(res, await AuthService.me(userId(req)))));
router.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordBody),
  asyncHandler(async (req, res) => {
    await AuthService.changePassword(userId(req), req.body as AuthChangePasswordRequest);
    ok(res, null);
  }),
);
