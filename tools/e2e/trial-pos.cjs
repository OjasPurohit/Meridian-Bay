// Browser e2e (scratch clone, API :4001, web :5175): public Book a trial -> PostgreSQL -> owner + front desk calendars,
// owner court count / deactivate / reactivate, kitchen POS member lookup + authoritative member price, the 12 owner pages.
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
const api = async (method, p, token, body) => {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
const apiLogin = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Password@123' })).data.token;
let browser;

async function actor(label, demoLabel) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  page.__label = label;
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    window.__toasts = [];
    const start = () => new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches && n.matches('div.anim-slide-in') && n.closest('[aria-live=polite]')) window.__toasts.push(n.innerText.trim()); }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  if (demoLabel) {
    await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(demoLabel) }).first().click();
    await page.waitForTimeout(2500);
  }
  return page;
}

(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  // ---------------------------------------------------------------- A. public Book a trial
  const day = new Date(Date.now() + 3 * 86400000);
  const ymd = new Date(day.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
  const n30 = Math.floor(Math.random() * 28); // a fresh half-hour slot per run (06:00-19:30), so reruns on one scratch DB never collide
  const hm = `${String(6 + Math.floor(n30 / 2)).padStart(2, '0')}:${n30 % 2 ? '30' : '00'}`;
  const trialName = 'Tara Trial ' + stamp;
  const phone = '98765' + stamp;
  const pub = await actor('public');
  await pub.goto(WEB + '/#visit', { waitUntil: 'networkidle' });
  await pub.waitForTimeout(800);
  await pub.locator('#visit input[name=name]').fill(trialName);
  await pub.locator('#visit input[name=phone]').fill(phone);
  await pub.locator('#visit input[name=email]').fill(`tara.${stamp}@example.com`);
  await pub.locator('#visit select[name=sport]').selectOption('PADEL');
  await pub.locator('#visit input[name=preferred]').fill(`${ymd}T${hm}`);
  await pub.getByRole('button', { name: /Book my free trial/ }).click();
  await pub.waitForTimeout(2500);
  const done = await text(pub);
  check('public page confirms the trial booking with a real court', /You.re booked/.test(done) && /Padel Court/.test(done), done.match(/Your free trial hour[^.]*\./)?.[0] ?? '');
  const row = await q("SELECT b.id, b.booking_type::text t, b.guest_email, b.list_price::text lp, c.name court, c.sport_type::text sport, to_char(b.start_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') ist FROM court_bookings b JOIN courts c ON c.id = b.court_id WHERE b.guest_name = $1", [trialName]);
  check('DB: TRIAL court booking on a padel court at the chosen IST time, free, email kept', row.length === 1 && row[0].t === 'TRIAL' && row[0].sport === 'PADEL' && row[0].ist === `${ymd} ${hm}` && row[0].lp === '0.00' && row[0].guest_email === `tara.${stamp}@example.com`, JSON.stringify(row[0]));
  check('DB: no payment fabricated for the trial', (await q("SELECT count(*)::int n FROM payments WHERE source_id = $1", [row[0].id]))[0].n === 0);

  // the same slot is now taken on that court: the next visitor gets the other padel court, then a clear error
  await pub.getByRole('button', { name: /Book another trial/ }).click();
  await pub.locator('#visit input[name=name]').fill('Second Visitor ' + stamp);
  await pub.locator('#visit input[name=phone]').fill('98764' + stamp);
  await pub.locator('#visit select[name=sport]').selectOption('PADEL');
  await pub.locator('#visit input[name=preferred]').fill(`${ymd}T${hm}`);
  await pub.getByRole('button', { name: /Book my free trial/ }).click();
  await pub.waitForTimeout(2000);
  const taken = await q("SELECT count(*)::int n FROM court_bookings WHERE booking_type = 'TRIAL' AND cancelled_at IS NULL AND start_at = $1 AND court_id = $2", [new Date(`${ymd}T${hm}:00+05:30`).toISOString(), (await q('SELECT court_id FROM court_bookings WHERE id = $1', [row[0].id]))[0].court_id]);
  check('the only padel court is not booked twice; the second visitor sees a clear message', taken[0].n === 1 && /No court is free/.test(await text(pub)), String(taken[0].n));

  // ---------------------------------------------------------------- B. owner + front desk calendars
  const dayOffset = Math.round((Date.parse(ymd) - Date.parse('2026-10-03')) / 86400000);
  for (const [label, demo, home] of [['owner', 'Demo Admin', '/owner/bookings'], ['front desk', 'Demo Front Desk', '/front-desk']]) {
    const p = await actor(label, demo);
    await p.goto(WEB + home, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const tab = p.locator('[role=tablist][aria-label="Choose a day"] [role=tab]').nth(3 + dayOffset); // the strip starts three days before DEMO_TODAY
    await tab.click();
    await p.waitForTimeout(800);
    const hit = p.locator('button[title*="' + trialName + '"]');
    check(`${label} calendar shows the trial on the chosen day`, (await hit.count()) >= 1 && /Live data/i.test(await text(p)));
    await p.context().close();
  }

  // ---------------------------------------------------------------- C. owner court count, deactivate, reactivate
  const owner = await actor('owner', 'Demo Admin');
  const countOf = async () => Number((await text(owner)).match(/(\d+)\s*\n\s*Active courts/)?.[1] ?? -1);
  await owner.goto(WEB + '/owner', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  const base = (await q('SELECT count(*)::int n FROM courts WHERE is_active'))[0].n;
  check('overview court count equals active courts in PostgreSQL', (await countOf()) === base, `${await countOf()} vs ${base}`);
  const ownerTok = await apiLogin('owner@championsclub.example');
  const courtName = 'Count Court ' + stamp;
  const created = await api('POST', '/courts', ownerTok, { name: courtName, sport_type: 'TENNIS', walk_in_rate_per_hour: '500.00' });
  await owner.waitForTimeout(12500);
  check('overview court count follows a new court after one poll', (await countOf()) === base + 1, `${await countOf()} vs ${base + 1}`);
  await owner.goto(WEB + '/owner/bookings', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1200);
  await owner.getByRole('button', { name: `Deactivate ${courtName}` }).click();
  await owner.waitForTimeout(2500);
  check('DB: court deactivated', (await q('SELECT is_active FROM courts WHERE name = $1', [courtName]))[0].is_active === false);
  check('deactivated court listed under Deactivated courts', /Deactivated courts/.test(await text(owner)) && (await owner.getByRole('button', { name: `Reactivate ${courtName}` }).count()) === 1);
  await owner.goto(WEB + '/owner', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  check('count drops back after deactivation', (await countOf()) === base, String(await countOf()));
  await owner.goto(WEB + '/owner/bookings', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1200);
  await owner.getByRole('button', { name: `Reactivate ${courtName}` }).click();
  await owner.waitForTimeout(2500);
  check('DB: court reactivated', (await q('SELECT is_active FROM courts WHERE name = $1', [courtName]))[0].is_active === true);
  await owner.goto(WEB + '/owner', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  check('count is back up after reactivation', (await countOf()) === base + 1, String(await countOf()));
  void created;

  // ---------------------------------------------------------------- D. POS member lookup + price
  const kitchen = await actor('kitchen', 'Demo Kitchen');
  await kitchen.goto(WEB + '/kitchen', { waitUntil: 'networkidle' });
  await kitchen.waitForTimeout(1500);
  await kitchen.getByRole('radio', { name: /Walk-in/ }).first().click().catch(() => {});
  await kitchen.getByRole('button', { name: /Filter Coffee/ }).first().click();
  const walkTotal = await kitchen.getByRole('button', { name: /^Charge/ }).innerText();
  check('walk-in pays the full price', /80/.test(walkTotal), walkTotal);
  await kitchen.getByRole('radio', { name: /Member/ }).first().click().catch(async () => { await kitchen.getByText('Member', { exact: true }).first().click(); });
  await kitchen.locator('input[aria-label="Member number"]').fill('Aarav');
  await kitchen.waitForTimeout(1500);
  const after = await text(kitchen);
  check('kitchen finds the Gold member by name and shows the discount', /Aarav Kapoor/.test(after) && /15% off/i.test(after));
  const goldTotal = await kitchen.getByRole('button', { name: /^Charge/ }).innerText();
  check('UI price for the Gold member is 68', /68/.test(goldTotal) && !/80/.test(goldTotal), goldTotal);
  await kitchen.getByRole('radio', { name: /Cash/ }).first().click();
  await kitchen.getByRole('button', { name: /^Charge/ }).click();
  await kitchen.waitForTimeout(3000);
  const order = await q("SELECT o.id, o.discount_amount::text d, t.total_amount::text total, m.member_code FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id JOIN members m ON m.id = o.member_id ORDER BY o.created_at DESC LIMIT 1");
  check('DB: the stored order is the Gold price (total 68.00, discount 12.00)', order[0]?.total === '68.00' && order[0]?.d === '12.00', JSON.stringify(order[0]));
  check('DB: the payment is 68.00', (await q("SELECT amount::text a FROM payments WHERE source_type = 'BAR_ORDER' AND source_id = $1", [order[0].id]))[0]?.a === '68.00');
  check('kitchen member lookup stays narrow (no member list for the kitchen role)', (await api('GET', '/members', await apiLogin('kitchen@championsclub.example'))).error?.code === 'FORBIDDEN');

  // ---------------------------------------------------------------- D2. kitchen stock: real +1 / -1 on bar_menu_items
  await kitchen.goto(WEB + '/kitchen/stock', { waitUntil: 'networkidle' });
  await kitchen.waitForTimeout(1500);
  const stockOf = async () => (await q("SELECT stock_quantity n FROM bar_menu_items WHERE name = 'Cold Coffee'"))[0].n;
  const cell = () => kitchen.locator('tr', { hasText: 'Cold Coffee' }).locator('span[aria-live=polite]').innerText().then((t) => Number(t));
  const s0 = await stockOf();
  check('kitchen stock page has no "not tracked" and shows the DB quantity', !/not tracked/i.test(await text(kitchen)) && (await cell()) === s0, `db ${s0}`);
  await kitchen.getByRole('button', { name: 'Add 1 Cold Coffee' }).click();
  await kitchen.waitForTimeout(2500);
  check('+1: DB and UI both up by exactly 1', (await stockOf()) === s0 + 1 && (await cell()) === s0 + 1, `db ${await stockOf()}`);
  await kitchen.reload({ waitUntil: 'networkidle' });
  await kitchen.waitForTimeout(1500);
  check('refresh keeps the new quantity', (await cell()) === s0 + 1);
  await kitchen.getByRole('button', { name: 'Remove 1 Cold Coffee' }).click();
  await kitchen.waitForTimeout(2500);
  check('-1: DB and UI back to the start', (await stockOf()) === s0 && (await cell()) === s0, `db ${await stockOf()}`);
  const kTok = await apiLogin('kitchen@championsclub.example');
  const cc = (await q("SELECT id FROM bar_menu_items WHERE name = 'Cold Coffee'"))[0].id;
  check('API refuses a change that would go below zero', (await api('POST', `/bar/menu-items/${cc}/stock-adjustments`, kTok, { quantity_change: -(s0 + 5) })).error?.code === 'VALIDATION_ERROR' && (await stockOf()) === s0);
  check('kitchen still has no store inventory access', (await api('GET', '/inventory', kTok)).error?.code === 'FORBIDDEN');
  const sTok = await apiLogin('sanjay.gupta@championsclub.example').catch(() => null);
  if (sTok) {
    const pr = (await api('GET', '/inventory', sTok)).data[0];
    check('store manager inventory adjustment still works', (await api('POST', '/inventory/adjustments', sTok, { product_id: pr.product_id, quantity_change: 1 })).success === true);
    await api('POST', '/inventory/adjustments', sTok, { product_id: pr.product_id, quantity_change: -1 });
  }

  // ---------------------------------------------------------------- E. every owner page, no error screen
  for (const p of ['', '/analytics', '/members', '/memberships', '/bookings', '/store', '/kitchen', '/payments', '/staff', '/events', '/enquiries', '/reports']) {
    await owner.goto(WEB + '/owner' + p, { waitUntil: 'networkidle' });
    await owner.waitForTimeout(700);
    const t = await text(owner);
    check(`owner${p || ' overview'} renders`, !/Unexpected Application Error|Failed to fetch dynamically|This page could not be shown|needs a refresh/i.test(t) && /Live data/i.test(t));
  }
  for (const pg_ of [owner, kitchen]) {
    const bad = (await pg_.evaluate(() => window.__toasts)).filter((t) => /preview|sample data/i.test(t));
    check(`${pg_.__label}: no preview popup`, bad.length === 0, JSON.stringify(bad));
    check(`${pg_.__label}: no uncaught page errors`, pg_.__errors.length === 0, JSON.stringify(pg_.__errors.slice(0, 2)));
  }

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nTRIAL / POS / COURT COUNT / OWNER PAGE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
