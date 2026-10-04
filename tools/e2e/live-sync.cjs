// Browser end-to-end: data written in one role's dashboard reaches the others through the database (scratch clone,
// backend :4001, web :5175). Events (owner -> member, no reload), a new court (owner -> front desk + member), the kitchen
// READY -> PREPARING move, a store-manager product on the public shop, and "no popup while a dashboard stays open".
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const launch = () => chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const rootReq = createRequire(path.join(ROOT, 'package.json'));
rootReq('dotenv').config({ path: path.join(ROOT, '.env') });
const pg = rootReq('pg');

const WEB = process.env.E2E_WEB || 'http://localhost:5175';
const API = process.env.E2E_API || 'http://localhost:4001/api/v1';
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.pathname = '/' + (process.env.E2E_DB || 'champions_club_e2e');

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
  if (!ok) failures++;
};
const stamp = Date.now().toString().slice(-6);
const bodyText = (page) => page.locator('body').innerText();
const pathOf = (page) => new URL(page.url()).pathname;
let browser;

async function actor() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__toasts = [];
    const start = () => {
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.matches && n.matches('div.anim-slide-in') && n.closest('[aria-live=polite]')) window.__toasts.push(n.innerText.trim());
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  return page;
}
async function login(page, email, password = 'Password@123') {
  await page.goto(WEB + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name=email]:visible').fill(email);
  await page.locator('input[name=password]:visible').fill(password);
  await page.locator('input[name=password]:visible').press('Enter');
  await page.waitForTimeout(2500);
}
const api = async (method, p, token, body) => {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
const apiLogin = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Password@123' })).data.token;

(async () => {
  browser = await launch();
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const popups = [];

  // ============================================================ EVENTS: owner creates, the member (already on the page) sees it without a reload
  const evTitle = 'E2E Event ' + stamp;
  const member = await actor();
  await login(member, 'aarav.kapoor@example.com');
  await member.goto(WEB + '/member/events', { waitUntil: 'networkidle' });
  await member.waitForTimeout(1200);
  const memberBefore = await bodyText(member);
  check('member events page lists the seeded database events', /Padel Beginners Clinic/.test(memberBefore) && /Autumn Open/.test(memberBefore));
  check('member events do not include the new event yet', !memberBefore.includes(evTitle));

  const owner = await actor();
  await login(owner, 'owner@championsclub.example');
  await owner.goto(WEB + '/owner/events', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1200);
  await owner.getByRole('button', { name: /Create event/ }).first().click();
  await owner.locator('#f-title').fill(evTitle);
  await owner.locator('#f-location').fill('Court 4, E2E');
  await owner.locator('#f-start').fill('2026-10-20T10:00');
  await owner.locator('#f-end').fill('2026-10-20T12:00');
  await owner.locator('#f-capacity').fill('2');
  await owner.locator('#f-fee').fill('300');
  await owner.getByRole('button', { name: 'Publish event' }).click();
  await owner.waitForTimeout(2500);
  const ev = await q("SELECT id, title, capacity, fee::text, kind::text FROM events WHERE title = $1", [evTitle]);
  check('DB: events row created by the owner', ev.length === 1 && ev[0].capacity === 2 && ev[0].fee === '300.00', JSON.stringify(ev[0]));
  check('owner sees the event on screen', (await bodyText(owner)).includes(evTitle));
  popups.push(['owner after create event', await owner.evaluate(() => window.__toasts)]);
  check('no preview warning on owner event creation', !(await owner.evaluate(() => window.__toasts)).some((t) => /preview/i.test(t)));
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  check('owner still sees it after a reload (persisted)', (await bodyText(owner)).includes(evTitle));

  await member.waitForTimeout(12000); // one polling interval, NO reload
  check('member sees the new event by polling, no reload', (await bodyText(member)).includes(evTitle));
  // member registers through the UI (database first)
  const card = member.locator('li', { hasText: evTitle }).first();
  await card.getByRole('button', { name: /Register/ }).click();
  await member.waitForTimeout(2500);
  const reg = await q('SELECT count(*)::int n FROM event_registrations WHERE event_id = $1', [ev[0].id]);
  check('DB: member registration saved', reg[0].n === 1);
  check('member card shows Registered', /registered/i.test(await member.locator('li', { hasText: evTitle }).first().innerText()));
  await member.reload({ waitUntil: 'networkidle' });
  await member.waitForTimeout(1500);
  check('registration survives a reload', /registered/i.test(await member.locator('li', { hasText: evTitle }).first().innerText()));
  popups.push(['member events', await member.evaluate(() => window.__toasts)]);
  check('no preview warning for the member', !(await member.evaluate(() => window.__toasts)).some((t) => /preview/i.test(t)));

  // ============================================================ COURTS: owner adds, front desk + member see
  const courtName = 'E2E Court ' + stamp;
  await owner.goto(WEB + '/owner/bookings', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  const desk = await actor();
  await login(desk, 'neha.sharma@championsclub.example');
  await desk.waitForTimeout(1000);
  check('front desk is on the calendar', pathOf(desk) === '/front-desk');
  await member.goto(WEB + '/member', { waitUntil: 'networkidle' });
  await member.waitForTimeout(1500);
  check('before: the new court is not shown to the desk or member', !(await bodyText(desk)).includes(courtName) && !(await bodyText(member)).includes(courtName));

  await owner.getByRole('button', { name: /Add court/ }).first().click();
  await owner.locator('#f-name').fill(courtName);
  await owner.locator('#f-rate').fill('777');
  await owner.locator('#f-surface').fill('E2E turf');
  await owner.getByRole('button', { name: 'Add court' }).last().click();
  await owner.waitForTimeout(2500);
  const ct = await q('SELECT id, walk_in_rate_per_hour::text r, is_active FROM courts WHERE name = $1', [courtName]);
  check('DB: courts row created by the owner', ct.length === 1 && ct[0].r === '777.00' && ct[0].is_active, JSON.stringify(ct[0]));
  check('owner court list shows it', (await bodyText(owner)).includes(courtName));
  check('no preview warning on owner court creation', !(await owner.evaluate(() => window.__toasts)).some((t) => /preview/i.test(t)));
  await desk.waitForTimeout(12000);
  await member.waitForTimeout(1000);
  check('front desk calendar shows the new court (polling)', (await bodyText(desk)).includes(courtName));
  check('member court screen shows the new court (polling)', (await bodyText(member)).includes(courtName));
  // availability through the API for each role includes it
  for (const [who, email] of [['member', 'aarav.kapoor@example.com'], ['desk', 'neha.sharma@championsclub.example'], ['owner', 'owner@championsclub.example']]) {
    const tok = await apiLogin(email);
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const av = (await api('GET', `/courts/availability?date=${date}`, tok)).data;
    const mine = av.find((x) => x.court_id === ct[0].id);
    check(`availability (${who}) includes the new court with free slots`, !!mine && mine.slots.some((s) => s.status === 'AVAILABLE'));
  }
  popups.push(['desk', await desk.evaluate(() => window.__toasts)], ['member courts', await member.evaluate(() => window.__toasts)]);

  // ============================================================ KITCHEN: READY -> PREPARING
  const ktoken = await apiLogin('kitchen@championsclub.example');
  const dtoken = await apiLogin('neha.sharma@championsclub.example');
  const menu = (await api('GET', '/bar/menu', null)).data;
  const order = (await api('POST', '/bar/orders', dtoken, { table_label: 'E2E-' + stamp, items: [{ bar_menu_item_id: menu[0].id, quantity: 1 }], payment_method: 'CASH' })).data;
  await api('PATCH', `/kitchen/orders/${order.id}/status`, ktoken, { status: 'PREPARING' });
  await api('PATCH', `/kitchen/orders/${order.id}/status`, ktoken, { status: 'READY' });
  const kitchen = await actor();
  await login(kitchen, 'kitchen@championsclub.example');
  await kitchen.goto(WEB + '/kitchen/orders', { waitUntil: 'networkidle' });
  await kitchen.waitForTimeout(1500);
  const ready = kitchen.locator('section[aria-label="Ready"] li', { hasText: order.order_number });
  check('kitchen board shows the order in Ready', (await ready.count()) === 1);
  await ready.getByRole('button', { name: /back to preparing/i }).click();
  await kitchen.waitForTimeout(2500);
  const st = await q('SELECT status::text s FROM bar_orders WHERE id = $1', [order.id]);
  check('DB: READY -> PREPARING saved', st[0].s === 'PREPARING', st[0].s);
  check('kitchen board moved it to Preparing', (await kitchen.locator('section[aria-label="Preparing"] li', { hasText: order.order_number }).count()) === 1);
  popups.push(['kitchen', await kitchen.evaluate(() => window.__toasts)]);

  // ============================================================ no popup while dashboards stay open (3+ polls)
  await kitchen.waitForTimeout(36000);
  const idle = [['owner', owner], ['member', member], ['desk', desk], ['kitchen', kitchen]];
  for (const [n, p] of idle) {
    const t = await p.evaluate(() => window.__toasts);
    const noisy = t.filter((x) => /preview|could not|sample data/i.test(x));
    check(`${n}: no preview / failure popup over several polling intervals`, noisy.length === 0, JSON.stringify(noisy));
  }
  console.log('toasts seen:', JSON.stringify(popups));

  // ============================================================ no copy of the data in the browser
  const keys = await owner.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mb.demo')));
  check('live mode keeps no demo copy of the data in localStorage', keys.length === 0, JSON.stringify(keys));

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL LIVE-SYNC CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error('E2E CRASH', e); process.exit(2); });
