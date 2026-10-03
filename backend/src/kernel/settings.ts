/**
 * SettingsService — read-only access to club_settings for every module (hours, tax rates, cut-offs, fees …).
 * Nothing owner-editable is hard-coded anywhere else. Values are the raw jsonb scalar: numbers for
 * cancellation_cutoff_hours etc., strings for money ("50.00") and times ("06:00:00"); callers convert
 * (toPaise for money). Writes belong to the settings module, which must call SettingsService.invalidate().
 */
import { SETTING_KEYS, type SettingKey } from '@shared/constants/rules';
import { query } from './db';
import { AppError } from './errors';

/** Contract: cached 30 s (SYSTEM_ARCHITECTURE §5). */
export const SETTINGS_CACHE_TTL_MS = 30_000;

const KNOWN_KEYS: ReadonlySet<string> = new Set(SETTING_KEYS);

let cache: { values: Map<string, unknown>; expires: number } | undefined;
let inflight: Promise<Map<string, unknown>> | undefined;
let now: () => number = () => Date.now();

async function load(): Promise<Map<string, unknown>> {
  if (cache && cache.expires > now()) return cache.values;
  inflight ??= (async () => {
    try {
      const { rows } = await query<{ key: string; value: unknown }>('SELECT key, value FROM club_settings');
      const values = new Map(rows.map((r) => [r.key, r.value]));
      cache = { values, expires: now() + SETTINGS_CACHE_TTL_MS };
      return values;
    } finally {
      inflight = undefined;
    }
  })();
  return inflight;
}

export const SettingsService = {
  /** One setting. Unknown or missing key => SETTING_NOT_FOUND. */
  async get<T = unknown>(key: SettingKey): Promise<T> {
    if (!KNOWN_KEYS.has(key)) throw new AppError('SETTING_NOT_FOUND', { key });
    const values = await load();
    if (!values.has(key)) throw new AppError('SETTING_NOT_FOUND', { key });
    return values.get(key) as T;
  },

  /** Drop the cache so the next get() re-reads the table (call after any write to club_settings). */
  invalidate(): void {
    cache = undefined;
  },
};

/** Test hook: replace the clock used for TTL expiry. Call with no argument to restore. */
export function setSettingsClockForTests(clock?: () => number): void {
  now = clock ?? (() => Date.now());
  cache = undefined;
}
