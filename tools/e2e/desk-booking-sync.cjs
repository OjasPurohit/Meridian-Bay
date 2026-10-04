// Front desk books an empty slot and takes payment -> PostgreSQL rows -> calendar, KPIs, owner calendar, reload.
//   scratch: node tools/e2e/desk-booking-sync.cjs                (E2E_WEB :5175, E2E_API :4001, DB champions_club_e2e)
//   real:    E2E_WEB=http://localhost:5173 E2E_DB=champions_club node tools/e2e/desk-booking-sync.cjs   (writes ONE booking + payment)
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
const text = (p) => p.locator('body').innerText();
const kpi = async (page, label) => {
  const t = (await text(page)).replace(/\s+/g, ' ');
  const m = t.match(new RegExp(label + ' ₹?([\\d,]+)', 'i'));
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
};

async function actor(browser, demoLabel) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(demoLabel) }).first().click();
  await page.waitForTimeout(2500);
  return page;
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const guest = 'Desk Sync ' + Date.now().toString().slice(-6);

  const desk = await actor(browser, 'Demo Front Desk');
  await desk.goto(WEB + '/front-desk', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2000);
  const istToday = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  const header = await text(desk);
  const dbToday = (await q("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text d"))[0].d;
  check('dashboard "today" is the real IST date, not the frozen sample date', new RegExp(new Date(istToday + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(/^(\w+), (\d+) (\w+)$/, '$1, $2 $3'), 'i').test(header) || header.includes(String(Number(istToday.slice(8)))), dbToday);
  const collectedBefore = await kpi(desk, 'Collected today');
  const bookingsBefore = await kpi(desk, 'Bookings today');
  const dbPaidBefore = Number((await q("SELECT COALESCE(sum(amount),0) s FROM payments WHERE received_by_user_id = (SELECT id FROM users WHERE email = 'neha.sharma@championsclub.example') AND refunded_amount < amount AND (paid_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date"))[0].s);
  check('Collected today equals the payments this desk took on the real IST day in PostgreSQL', collectedBefore === Math.round(dbPaidBefore), `${collectedBefore} vs ${dbPaidBefore}`);

  const slots = desk.locator('button[aria-label^="Book Badminton Court"]');
  const n = await slots.count();
  check('there are empty future slots to book today', n > 0, String(n));
  const slot = slots.nth(n - 1);
  const label = await slot.getAttribute('aria-label');
  await slot.click();
  await desk.getByText('Walk-in', { exact: false }).first().click();
  await desk.getByPlaceholder('e.g. Deepak Chawla').fill(guest);
  await desk.getByRole('button', { name: /^Create booking/ }).click();
  await desk.waitForTimeout(2500);
  check('success is shown only after the server accepted it', /You’re booked/.test(await text(desk)));
  const row = await q("SELECT b.id, b.guest_name, (b.list_price - b.discount_amount)::float due, c.name court, to_char(b.start_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') ist FROM court_bookings b JOIN courts c ON c.id = b.court_id WHERE b.guest_name = $1 AND b.cancelled_at IS NULL", [guest]);
  check('PostgreSQL court_bookings row exists for the guest', row.length === 1, JSON.stringify(row[0]));
  const pay = row.length ? await q("SELECT amount::float a, method::text m, refunded_amount::float r FROM payments WHERE source_type = 'COURT_BOOKING' AND source_id = $1", [row[0].id]) : [];
  check('PostgreSQL payments row exists (cash, succeeded)', pay.length === 1 && pay[0].m === 'CASH' && pay[0].r === 0, JSON.stringify(pay[0]));
  await desk.getByRole('button', { name: 'Done' }).click();
  await desk.waitForTimeout(1500);
  const t = await text(desk);
  check('front desk calendar shows the guest in the slot', t.includes(guest.slice(0, 6)));
  check('Collected today rose by the payment amount', pay.length === 1 && (await kpi(desk, 'Collected today')) === collectedBefore + Math.round(pay[0].a), `${collectedBefore} -> ${await kpi(desk, 'Collected today')}`);
  check('Bookings today rose by one', (await kpi(desk, 'Bookings today')) === bookingsBefore + 1, `${bookingsBefore} -> ${await kpi(desk, 'Bookings today')}`);

  await desk.reload({ waitUntil: 'networkidle' });
  await desk.waitForTimeout(2500);
  check('after a reload the booking and the totals are still there', (await text(desk)).includes(guest.slice(0, 6)) && (await kpi(desk, 'Collected today')) === collectedBefore + Math.round(pay[0]?.a ?? 0));

  const owner = await actor(browser, 'Demo Admin / Owner');
  await owner.goto(WEB + '/owner/bookings', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(2500);
  check('owner Courts & bookings shows the same booking in today\'s calendar', (await text(owner)).includes(guest.slice(0, 6)) && /Paid/.test(await text(owner)));

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED  (guest ${guest}, ${label})` : `\nDESK BOOKING SYNC CHECKS PASSED  (guest ${guest}, ${label})`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
