import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { SETTING_KEYS } from '@shared/constants/rules';
import type { SettingKey } from '@shared/constants/rules';
import { query } from '../db';
import { SettingsService, SETTINGS_CACHE_TTL_MS, setSettingsClockForTests } from '../settings';
import { startTestDb, useTestEnv, type TestDb } from './helpers';

useTestEnv();

let t: TestDb;
let clock = 1_000_000;

before(async () => {
  t = await startTestDb();
});
after(async () => {
  setSettingsClockForTests();
  await t.close();
});
beforeEach(() => {
  clock = 1_000_000;
  setSettingsClockForTests(() => clock);
});

const setRaw = (key: string, json: string) => query(`UPDATE club_settings SET value = $2::jsonb WHERE key = $1`, [key, json]);

describe('SettingsService', () => {
  it('cache TTL is 30 seconds (documented contract)', () => {
    assert.equal(SETTINGS_CACHE_TTL_MS, 30_000);
  });

  it('returns the raw jsonb scalar: numbers, money strings and times keep their stored type', async () => {
    assert.equal(await SettingsService.get<number>('cancellation_cutoff_hours'), 2);
    assert.equal(await SettingsService.get<string>('tax_rate_court'), '18.00');
    assert.equal(await SettingsService.get<string>('delivery_fee'), '50.00');
    assert.equal(await SettingsService.get<string>('club_open_time'), '06:00:00');
  });

  it('every documented SETTING_KEY exists in the database', async () => {
    for (const key of SETTING_KEYS) assert.notEqual(await SettingsService.get(key), undefined, key);
  });

  it('serves from cache until the TTL passes, then re-reads', async () => {
    assert.equal(await SettingsService.get<string>('tax_rate_court'), '18.00');
    await setRaw('tax_rate_court', '"12.00"');
    assert.equal(await SettingsService.get<string>('tax_rate_court'), '18.00', 'still cached');
    clock += SETTINGS_CACHE_TTL_MS - 1;
    assert.equal(await SettingsService.get<string>('tax_rate_court'), '18.00', 'one ms before expiry');
    clock += 1;
    assert.equal(await SettingsService.get<string>('tax_rate_court'), '12.00', 'after expiry');
    await setRaw('tax_rate_court', '"18.00"');
  });

  it('invalidate() makes the next read see the change immediately', async () => {
    await SettingsService.get('delivery_fee'); // warm
    await setRaw('delivery_fee', '"75.00"');
    assert.equal(await SettingsService.get('delivery_fee'), '50.00');
    SettingsService.invalidate();
    assert.equal(await SettingsService.get('delivery_fee'), '75.00');
    await setRaw('delivery_fee', '"50.00"');
    SettingsService.invalidate();
  });

  it('concurrent first reads share one query', async () => {
    SettingsService.invalidate();
    const values = await Promise.all((['club_name', 'club_email', 'tax_rate_bar'] as SettingKey[]).map((k) => SettingsService.get(k)));
    assert.equal(values[2], '5.00');
  });

  it('unknown key, or a known key missing from the table => SETTING_NOT_FOUND', async () => {
    await assert.rejects(SettingsService.get('not_a_setting' as SettingKey), (e) => (e as { code: string }).code === 'SETTING_NOT_FOUND');
    await query(`DELETE FROM club_settings WHERE key = 'club_tagline'`);
    SettingsService.invalidate();
    await assert.rejects(SettingsService.get('club_tagline'), (e) => (e as { code: string }).code === 'SETTING_NOT_FOUND');
  });
});
