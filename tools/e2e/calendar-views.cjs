// Browser e2e (scratch clone, API :4001, web :5175): trial request -> Owner "Trial requests" panel -> approve -> Day/Week/Month
// owner calendar (month day click drills into day view, sport filter) -> Front Desk sees it; decline books nothing.
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const rootReq = createRequire(path.join(ROOT, 'package.json'));
rootReq('dotenv').config({ path: path.join(ROOT, '.env') });
const pg = rootReq('pg');
const WEB = process.env.E2E_WEB || 'http://localhost:5175';
const API = process.env.E2E_API || 'http://localhost:4001/api/v1';
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.pathname = '/' + (process.env.E2E_DB || 'champions_club_e2e');
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); if (!ok) failures++; };
const stamp = Date.now().toString().slice(-6);
const text = (p) => p.locator('body').innerText();

async function actor(browser, demoLabel) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(demoLabel) }).first().click();
  await page.waitForTimeout(2500);
  return page;
}
const pub = async (body) => (await fetch(API + '/bookings/trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  const ymd = new Date(Date.now() + 5.5 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
  let n30 = Math.floor(Math.random() * 28);
  let hm = `${String(6 + Math.floor(n30 / 2)).padStart(2, '0')}:${n30 % 2 ? '30' : '00'}`;
  const name = 'Cal Trial ' + stamp;
  const declineName = 'Cal Decline ' + stamp;
  let r1, r2;
  for (let tries = 0; tries < 8; tries++) {
    // a random half-hour on the clone can already hold a padel / tennis booking: try another slot until both requests are accepted
    r1 = await pub({ name, phone: '9' + stamp + '111', email: `cal.${stamp}@example.com`, sport_type: 'PADEL', start_at: `${ymd}T${hm}:00+05:30` });
    r2 = r1.success ? await pub({ name: declineName, phone: '8' + stamp + '222', sport_type: 'TENNIS', start_at: `${ymd}T${hm}:00+05:30` }) : r1;
    if (r1.success && r2.success) break;
    if (r1.success) await db.query('DELETE FROM enquiries WHERE name = $1', [name]);
    n30 = (n30 + 3) % 28;
    hm = `${String(6 + Math.floor(n30 / 2)).padStart(2, '0')}:${n30 % 2 ? '30' : '00'}`;
  }
  check('public requests are stored as pending enquiries', r1.success && r2.success && (await q("SELECT count(*)::int n FROM enquiries WHERE name = ANY($1) AND handled_at IS NULL AND trial_booking_id IS NULL", [[name, declineName]]))[0].n === 2, JSON.stringify([r1.error?.code, r2.error?.code]));

  const owner = await actor(browser, 'Demo Admin / Owner');
  await owner.goto(WEB + '/owner/bookings', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  let t = await text(owner);
  check('Courts & bookings shows the Trial requests panel with both pending requests', /Trial requests/i.test(t) && t.includes(name) && t.includes(declineName) && /awaiting approval/i.test(t), t.match(/needs your approval[\s\S]{0,160}/i)?.[0].replace(/\s+/g, ' ') ?? 'panel missing');
  check('no court booking exists before approval', (await q("SELECT count(*)::int n FROM court_bookings WHERE guest_name = ANY($1)", [[name, declineName]]))[0].n === 0);

  await owner.getByRole('button', { name: `Decline ${declineName}'s trial` }).click();
  await owner.waitForTimeout(2500);
  check('decline: request closed, no booking, shown as declined', (await q("SELECT handled_at IS NOT NULL h, trial_booking_id FROM enquiries WHERE name = $1", [declineName]))[0].h === true && (await q("SELECT count(*)::int n FROM court_bookings WHERE guest_name = $1", [declineName]))[0].n === 0 && /declined/i.test(await text(owner)));

  await owner.getByRole('button', { name: `Approve ${name}'s trial` }).click();
  await owner.waitForTimeout(3000);
  const bk = await q("SELECT b.id, c.name court, to_char(b.start_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') d FROM court_bookings b JOIN courts c ON c.id = b.court_id WHERE b.guest_name = $1 AND b.booking_type = 'TRIAL'", [name]);
  check('approve: a real TRIAL court booking exists and the request is linked to it', bk.length === 1 && (await q("SELECT trial_booking_id FROM enquiries WHERE name = $1", [name]))[0].trial_booking_id === bk[0].id);
  check('approved request shows as approved', /approved/i.test(await text(owner)));

  // ---- day view (default) keeps working; week view
  await owner.getByRole('button', { name: 'Week', exact: true }).click();
  const inGrid = (txt) => owner.locator('[role=gridcell]', { hasText: txt });
  for (let i = 0; i < 3 && (await inGrid(name).count()) === 0; i++) { await owner.getByRole('button', { name: 'Next week' }).click(); await owner.waitForTimeout(300); }
  t = await text(owner);
  check('week view: 7 weekday columns and the approved trial with name, time and court', ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].every((d) => new RegExp(d, 'i').test(t)) && t.includes(name) && t.includes(bk[0].court) && new RegExp(`Trial · ${name}`, 'i').test(t), (t.match(new RegExp(`.{0,40}${name}.{0,40}`)) ?? ['name not found'])[0].replace(/\s+/g, ' '));
  check('week view: the declined request is not on the calendar', !t.includes(declineName + '\n') && (await owner.locator('[role=gridcell]', { hasText: declineName }).count()) === 0);
  await owner.getByRole('button', { name: 'Previous week' }).click();
  await owner.getByRole('button', { name: 'This week' }).click();
  check('week view: previous / this-week controls work', /–/.test(await text(owner)));

  // ---- month view
  await owner.getByRole('button', { name: 'Month', exact: true }).click();
  for (let i = 0; i < 2 && (await owner.locator('[role=gridcell]', { hasText: /trials?/i }).count()) === 0; i++) { await owner.getByRole('button', { name: 'Next month' }).click(); await owner.waitForTimeout(300); }
  const cell = owner.locator('[role=gridcell]', { hasText: /trials?/i }).first();
  check('month view: the day with the trial is marked', (await cell.count()) === 1);
  await owner.getByRole('button', { name: 'Padel', exact: true }).click();
  check('month view + Padel filter keeps the padel trial', (await owner.locator('[role=gridcell]', { hasText: /trials?/i }).count()) >= 1);
  await owner.getByRole('button', { name: 'Cricket', exact: true }).click();
  check('month view + Cricket filter hides it', (await owner.locator('[role=gridcell]', { hasText: /trials?/i }).count()) === 0);
  await owner.getByRole('button', { name: 'All courts', exact: true }).click();
  await owner.locator('[role=gridcell]', { hasText: /trials?/i }).first().getByRole('button', { name: /in day view/ }).click();
  await owner.waitForTimeout(1200);
  t = await text(owner);
  check('clicking a month day opens the detailed Day view for it', /start times free/.test(t) && t.includes(name));
  await owner.getByRole('button', { name: 'Day', exact: true }).click();

  // ---- front desk sees the same booking
  const desk = await actor(browser, 'Demo Front Desk');
  await desk.goto(WEB + '/front-desk/bookings', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);
  check('front desk Courts & bookings lists the approved trial from the same database row', (await text(desk)).includes(name));
  check('front desk has no approve/decline controls', (await desk.getByRole('button', { name: /Approve .*trial/ }).count()) === 0);

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nCALENDAR VIEW CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
