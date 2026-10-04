// Member court calendar geometry + booking (scratch clone, API :4001, web :5175):
// compact equal court rows, one block per real booking (no overlapping/stacked blocks), blocks match court_bookings,
// date navigation, sport filter, free slot -> booking -> block in the right row/time -> reload; Front Desk unchanged.
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const rootReq = createRequire(path.join(ROOT, 'package.json'));
rootReq('dotenv').config({ path: path.join(ROOT, '.env') });
const pg = rootReq('pg');
const WEB = process.env.E2E_WEB || 'http://localhost:5175';
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.pathname = '/' + (process.env.E2E_DB || 'champions_club_e2e');
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); if (!ok) failures++; };

async function actor(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
  await page.waitForTimeout(2800);
  return page;
}
/** Heights of the court label cells (one per court row) and every booking block's box, inside the grid. */
const geometry = (page) => page.evaluate(() => {
  const labels = [...document.querySelectorAll('div.sticky.flex-col')].map((e) => ({ name: e.querySelector('span')?.textContent ?? '', h: e.getBoundingClientRect().height, top: e.getBoundingClientRect().top }));
  const blocks = [...document.querySelectorAll('[title^="Booked ·"], [title^="Your booking"], [title="Closed for maintenance"], [title*="· 1"]')].filter((e) => /Booked ·|Your booking|maintenance/.test(e.getAttribute('title') || '')).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, title: e.getAttribute('title') }; });
  return { labels, blocks };
});
const overlaps = (blocks) => { for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) { const a = blocks[i], b = blocks[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) return [a.title, b.title]; } return null; };
const ist = (off = 0) => new Date(Date.now() + 5.5 * 3600000 + off * 86400000).toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const member = await actor(browser, 'Demo Member');
  await member.goto(WEB + '/member', { waitUntil: 'networkidle' });
  await member.waitForTimeout(2500);

  const checkDay = async (label, date) => {
    const g = await geometry(member);
    const hs = g.labels.map((l) => l.h);
    check(`${label}: every court is one compact row (heights ${hs.map((h) => Math.round(h)).join('/')})`, hs.length >= 5 && hs.every((h) => h > 40 && h < 72) && Math.max(...hs) - Math.min(...hs) < 2);
    const ov = overlaps(g.blocks);
    check(`${label}: no overlapping or stacked blocks`, !ov, ov ? ov.join(' | ') : '');
    // availability only lists upcoming starts to a member, so hours already played today are not drawn: expect every future booking and never more than exist
    const r = (await q("SELECT count(*)::int n, count(*) FILTER (WHERE start_at > now())::int future FROM court_bookings WHERE cancelled_at IS NULL AND (start_at AT TIME ZONE 'Asia/Kolkata')::date = $1", [date]))[0];
    check(`${label}: one block per real booking (${r.future} upcoming of ${r.n} in PostgreSQL)`, g.blocks.length >= r.future && g.blocks.length <= r.n, `${g.blocks.length} shown`);
  };
  await checkDay('today', ist());

  // date navigation: tomorrow and a day with several bookings
  for (const off of [1, 2]) {
    await member.locator('[role=tablist][aria-label="Choose a day"] [role=tab]').nth(3 + off).click();
    await member.waitForTimeout(900);
    await checkDay(`+${off} day`, ist(off));
  }
  await member.locator('[role=tablist][aria-label="Choose a day"] [role=tab]').nth(3).click();
  await member.waitForTimeout(700);

  // sport filter
  await member.getByRole('button', { name: 'Tennis', exact: true }).click();
  await member.waitForTimeout(600);
  const tg = await geometry(member);
  check('Tennis filter shows only the tennis courts, still compact', tg.labels.length === 2 && tg.labels.every((l) => /Tennis/.test(l.name)) && tg.labels.every((l) => l.h < 72));
  await member.getByRole('button', { name: 'All courts', exact: true }).click();
  await member.waitForTimeout(600);

  // horizontal scroll container keeps working at a narrow width
  await member.setViewportSize({ width: 800, height: 1200 });
  await member.waitForTimeout(600);
  const sc = await member.evaluate(() => { const e = document.querySelector('div.overflow-x-auto'); return e ? { sw: e.scrollWidth, cw: e.clientWidth } : null; });
  const gn = await geometry(member);
  check('narrow screen: the grid scrolls horizontally and rows stay compact', !!sc && sc.sw > sc.cw && gn.labels.every((l) => l.h < 72), JSON.stringify(sc));
  await member.setViewportSize({ width: 1440, height: 1200 });
  await member.waitForTimeout(500);

  // book a free slot on a day the member still has plays left (today is used up in the seed)
  await member.locator('[role=tablist][aria-label="Choose a day"] [role=tab]').nth(3 + 6).click();
  await member.waitForTimeout(900);
  const slots = member.locator('button[aria-label^="Book Badminton Court 2 at"]');
  const cnt = await slots.count();
  check('free slots are clickable targets', cnt > 0, String(cnt));
  const slot = slots.nth(cnt - 1);
  const label = await slot.getAttribute('aria-label');
  const at = label.split(' at ')[1];
  await slot.click();
  await member.getByRole('button', { name: /Pay .* & book|Confirm booking/ }).click();
  await member.waitForTimeout(3000);
  check('booking is confirmed by the server', /You’re booked/.test(await member.locator('body').innerText()));
  await member.getByRole('button', { name: 'Done' }).click();
  await member.waitForTimeout(1500);
  const mine = await q("SELECT b.id, to_char(b.start_at AT TIME ZONE 'Asia/Kolkata','HH24:MI') hm FROM court_bookings b JOIN courts c ON c.id = b.court_id JOIN members m ON m.id = b.member_id JOIN users u ON u.id = m.user_id WHERE u.email = 'aarav.kapoor@example.com' AND c.name = 'Badminton Court 2' AND b.cancelled_at IS NULL ORDER BY b.created_at DESC LIMIT 1");
  check('the booking is a court_bookings row at the clicked time', mine.length === 1 && mine[0].hm === at, JSON.stringify(mine[0]));
  const own = member.locator(`button[title^="Your booking"][title*="${at}"]`);
  check('"Your booking" block appears at that time', (await own.count()) >= 1);
  const ob = await own.first().boundingBox();
  const lab = await member.locator('div.sticky.flex-col', { hasText: 'Badminton Court 2' }).first().boundingBox();
  check('and sits inside the Badminton Court 2 row', !!ob && !!lab && ob.y >= lab.y - 1 && ob.y + ob.height <= lab.y + lab.height + 1, JSON.stringify([ob?.y, lab?.y, lab?.height]));
  await checkDay('after booking', ist(6));
  await member.reload({ waitUntil: 'networkidle' });
  await member.waitForTimeout(2800);
  await member.locator('[role=tablist][aria-label="Choose a day"] [role=tab]').nth(3 + 6).click();
  await member.waitForTimeout(900);
  check('after a reload the booking is still there', (await member.locator(`button[title^="Your booking"][title*="${at}"]`).count()) >= 1);
  await checkDay('after reload', ist(6));

  // front desk unchanged
  const desk = await actor(browser, 'Demo Front Desk');
  await desk.goto(WEB + '/front-desk', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2500);
  const dg = await desk.evaluate(() => [...document.querySelectorAll('div.sticky.flex-col')].map((e) => e.getBoundingClientRect().height));
  check('front desk calendar: compact equal rows', dg.length >= 5 && dg.every((h) => h > 40 && h < 72) && Math.max(...dg) - Math.min(...dg) < 2, dg.map(Math.round).join('/'));

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nMEMBER CALENDAR CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
