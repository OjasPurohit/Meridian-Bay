/** Public website data (PUBLIC): auto-discovered by app.ts, mounted at /api/v1/public. */
import { Router } from 'express';
import type { PublicClubInfo } from '@shared/types/api';
import { query } from '../../kernel/db';
import { asyncHandler, ok } from '../../kernel/http';

export const router = Router();

router.get('/club', asyncHandler(async (_req, res) => {
  const settings = new Map((await query<{ key: string; value: unknown }>('SELECT key, value FROM club_settings WHERE is_public')).rows.map((r) => [r.key, r.value]));
  const courts = (await query<{ sport_type: PublicClubInfo['sports'][number] }>('SELECT sport_type FROM courts WHERE is_active')).rows;
  const s = (k: string) => (settings.has(k) ? String(settings.get(k)) : null);
  const info: PublicClubInfo = {
    name: s('club_name') ?? '',
    tagline: s('club_tagline'),
    description: s('club_description'),
    address: s('club_address'),
    phone: s('club_phone'),
    email: s('club_email'),
    open_time: s('club_open_time') ?? '06:00:00',
    close_time: s('club_close_time') ?? '22:00:00',
    sports: [...new Set(courts.map((c) => c.sport_type))],
    court_count: courts.length,
  };
  ok(res, info);
}));

export default { basePath: '/public', router };
