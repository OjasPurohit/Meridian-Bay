/**
 * Club settings (FR-SET-001): OWNER_ADMIN reads and edits the whitelisted keys (SETTING_KEYS). Writes go through the
 * kernel's SettingsService cache invalidation so the change applies at once.
 */
import { Router } from 'express';
import { USER_ROLE } from '@shared/constants/enums';
import { SETTING_KEYS, type SettingKey } from '@shared/constants/rules';
import type { SettingView } from '@shared/types/api';
import { requireAuth, requireRole } from '../../kernel/auth';
import { query } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { asyncHandler, ok } from '../../kernel/http';
import { SettingsService } from '../../kernel/settings';
import { strictObject, validateBody, z } from '../../kernel/validate';

export const router = Router();

const ownerOnly = [requireAuth, requireRole(USER_ROLE.OWNER_ADMIN)];

const SELECT = 'SELECT key, value, description, is_public, updated_at FROM club_settings';

const TIME = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const MONEY = /^\d+\.\d{2}$/;

/** The new value must keep the type of the stored one and make sense for the key (rates 0-100, hours 0-48, times HH:mm:ss). */
function coerce(key: SettingKey, current: unknown, raw: string | number | boolean): string | number | boolean {
  const bad = (message: string): never => {
    throw new AppError('VALIDATION_ERROR', { fields: { value: message } });
  };
  if (typeof current === 'number') {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n < 0) return bad('Must be a non-negative number.');
    if (!Number.isInteger(n)) return bad('Must be a whole number.');
    if (n > 1000) return bad('Too large.');
    return n;
  }
  if (typeof current === 'boolean') {
    if (typeof raw !== 'boolean') return bad('Must be true or false.');
    return raw;
  }
  if (typeof raw !== 'string' || raw.trim() === '') return bad('Must be a non-empty text value.');
  const text = raw.trim();
  if (key.endsWith('_time')) {
    if (!TIME.test(text)) return bad('Must be a time (HH:mm:ss).');
  } else if (key.startsWith('tax_rate_')) {
    if (!MONEY.test(text) || Number(text) > 100) return bad('Must be a percentage with 2 decimals between 0.00 and 100.00.');
  } else if (key === 'delivery_fee' || key === 'free_delivery_above') {
    if (!MONEY.test(text)) return bad('Must be an amount with 2 decimals, e.g. "50.00".');
  } else if (text.length > 1000) return bad('Too long.');
  return text;
}

router.get(
  '/',
  ...ownerOnly,
  asyncHandler(async (_req, res) => {
    const { rows } = await query<SettingView>(`${SELECT} WHERE key = ANY($1) ORDER BY key`, [SETTING_KEYS as unknown as string[]]);
    ok(res, rows);
  }),
);

const updateBody = strictObject({ value: z.union([z.string(), z.number(), z.boolean()]) });

router.patch(
  '/:key',
  ...ownerOnly,
  validateBody(updateBody),
  asyncHandler(async (req, res) => {
    const key = req.params.key as SettingKey;
    if (!(SETTING_KEYS as readonly string[]).includes(key)) throw new AppError('SETTING_NOT_FOUND', { key });
    const { rows } = await query<{ value: unknown }>('SELECT value FROM club_settings WHERE key = $1', [key]);
    if (!rows[0]) throw new AppError('SETTING_NOT_FOUND', { key });
    const value = coerce(key, rows[0].value, (req.body as { value: string | number | boolean }).value);
    const updated = await query<SettingView>('UPDATE club_settings SET value = $2::jsonb WHERE key = $1 RETURNING key, value, description, is_public, updated_at', [key, JSON.stringify(value)]);
    SettingsService.invalidate();
    await SettingsService.get('club_name'); // reload now, outside any transaction
    ok(res, updated.rows[0]!);
  }),
);
