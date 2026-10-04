// Browser e2e for the live-system repairs (scratch clone, backend :4001, web :5175): LIVE header, owner court, DOB, member
// deactivation, kitchen drink -> member + public, stock +/-1, every low-stock name, READY -> PREPARING button, no popups.
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
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); if (!ok) failures++; };
const stamp = Date.now().toString().slice(-6);
const text = (p) => p.locator('body').innerText();
let browser;

async function actor(label) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.addInitScript(() => {
    window.__toasts = [];
    const start = () => new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches && n.matches('div.anim-slide-in') && n.closest('[aria-live=polite]')) window.__toasts.push(n.innerText.trim()); }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  page.__label = label;
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
const apiLogin = async (email, pw = 'Password@123') => (await api('POST', '/auth/login', null, { email, password: pw })).data?.token;

(async () => {
  browser = await launch();
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  // ---- A. live mode
  const owner = await actor('owner');
  await login(owner, 'owner@championsclub.example');
  await owner.goto(WEB + '/owner', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  const head = await text(owner);
  check('owner header says Live data, not Demo data', /Live data/i.test(head) && !/Demo data/i.test(head));

  // ---- B/C. owner adds a court; no preview popup; desk + member see it
  const courtName = 'Repair Court ' + stamp;
  await owner.goto(WEB + '/owner/bookings', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1200);
  await owner.getByRole('button', { name: /Add court/ }).first().click();
  await owner.locator('#f-name').fill(courtName);
  await owner.locator('#f-rate').fill('650');
  await owner.getByRole('button', { name: 'Add court' }).last().click();
  await owner.waitForTimeout(2500);
  const court = await q('SELECT id FROM courts WHERE name = $1', [courtName]);
  check('DB: court row exists', court.length === 1);
  check('no preview popup on court creation', !(await owner.evaluate(() => window.__toasts)).some((t) => /preview/i.test(t)), JSON.stringify(await owner.evaluate(() => window.__toasts)));
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const [who, email] of [['desk', 'neha.sharma@championsclub.example'], ['member', 'aarav.kapoor@example.com'], ['owner', 'owner@championsclub.example']]) {
    const av = (await api('GET', `/courts/availability?date=${date}`, await apiLogin(email))).data;
    check(`availability (${who}) includes the new court`, !!av.find((c) => c.court_id === court[0].id));
  }
  const desk = await actor('desk');
  await login(desk, 'neha.sharma@championsclub.example');
  const member = await actor('member');
  await login(member, 'aarav.kapoor@example.com');
  await member.goto(WEB + '/member', { waitUntil: 'networkidle' });
  await member.waitForTimeout(1500);
  check('desk and member screens show the new court', (await text(desk)).includes(courtName) && (await text(member)).includes(courtName));

  // ---- D. DOB + E. deactivation (owner UI) on a member created for this test
  const email = `dob.${stamp}@example.com`;
  const name = 'Dob Tester ' + stamp;
  const created = await api('POST', '/members', await apiLogin('owner@championsclub.example'), { full_name: name, email, phone: '9876501' + stamp.slice(0, 3), initial_password: 'DobPass123', date_of_birth: '1995-01-01' });
  check('test member created', !!created.data, JSON.stringify(created.error || ''));
  const openMember = async () => {
    await owner.goto(WEB + '/owner/members', { waitUntil: 'networkidle' });
    await owner.waitForTimeout(1500);
    await owner.locator('input[placeholder*="Search"]').first().fill(name);
    await owner.waitForTimeout(500);
    await owner.locator('tr', { hasText: name }).first().click();
    await owner.waitForTimeout(500);
  };
  await openMember();
  check('drawer shows the current DOB', /1995-01-01/.test(await text(owner)));
  await owner.getByRole('button', { name: /Edit details/ }).click();
  await owner.locator('#f-date_of_birth').fill('1988-07-09');
  await owner.getByRole('button', { name: /Save/ }).last().click();
  await owner.waitForTimeout(2500);
  check('DB: members.date_of_birth updated', (await q('SELECT m.date_of_birth::text d FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email]))[0].d === '1988-07-09');
  await openMember();
  check('after reload the owner UI shows the new DOB', /1988-07-09/.test(await text(owner)));
  await owner.getByRole('button', { name: /Deactivate/ }).click();
  await owner.waitForTimeout(2500);
  check('DB: users.is_active = false, member row kept', (await q('SELECT is_active FROM users WHERE email = $1', [email]))[0].is_active === false && (await q('SELECT count(*)::int n FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = $1', [email]))[0].n === 1);
  const dis = await api('POST', '/auth/login', null, { email, password: 'DobPass123' });
  check('deactivated member cannot log in', dis.error?.code === 'ACCOUNT_DISABLED', JSON.stringify(dis.error));

  // ---- F. kitchen adds a drink -> kitchen, member, public
  const drink = 'Repair Cold Brew ' + stamp;
  const kitchen = await actor('kitchen');
  await login(kitchen, 'kitchen@championsclub.example');
  check('kitchen header says Live data', /Live data/i.test(await text(kitchen)));
  await kitchen.goto(WEB + '/kitchen/products', { waitUntil: 'networkidle' });
  await kitchen.waitForTimeout(1200);
  await kitchen.getByRole('button', { name: /^Add$|Add product/ }).first().click();
  await kitchen.locator('#f-name').fill(drink);
  await kitchen.locator('#f-category').selectOption('DRINK');
  await kitchen.locator('#f-price').fill('175');
  await kitchen.getByRole('button', { name: 'Add to menu' }).click();
  await kitchen.waitForTimeout(2500);
  check('DB: bar_menu_items row exists', (await q('SELECT count(*)::int n FROM bar_menu_items WHERE name = $1', [drink]))[0].n === 1);
  check('kitchen sees the new drink', (await text(kitchen)).includes(drink));
  check('no preview popup in the kitchen', !(await kitchen.evaluate(() => window.__toasts)).some((t) => /preview/i.test(t)));
  await member.goto(WEB + '/member/kitchen', { waitUntil: 'networkidle' });
  await member.waitForTimeout(1500);
  check('member kitchen shows the new drink', (await text(member)).includes(drink));
  const pub = await actor('public');
  await pub.goto(WEB + '/bar-cafe', { waitUntil: 'networkidle' });
  await pub.waitForTimeout(1200);
  check('public /bar-cafe shows the new drink', (await text(pub)).includes(drink));

  // ---- G/H. stock +/-1 and every low-stock name
  const smTok = await apiLogin('sanjay.gupta@championsclub.example');
  const lows = [];
  for (let i = 0; i < 8; i++) {
    const r = await api('POST', '/shop/products', smTok, { sku: `LOW-${stamp}-${i}`, name: `Lowstock Item ${stamp}-${i}`, category: 'ACCESSORY', price: '50.00', initial_stock: 0 });
    lows.push(r.data?.id);
  }
  check('8 low-stock products created', lows.every(Boolean));
  const sm = await actor('store');
  await login(sm, 'sanjay.gupta@championsclub.example');
  check('store manager header says Live data', /Live data/i.test(await text(sm)));
  const row = sm.locator('tr', { hasText: `Lowstock Item ${stamp}-0` }).first();
  await sm.waitForTimeout(500);
  await row.getByRole('button', { name: /^Add 1 / }).click();
  await sm.waitForTimeout(2500);
  const s1 = (await q('SELECT stock_quantity s FROM products WHERE id = $1', [lows[0]]))[0].s;
  check('+ once adds exactly 1 in PostgreSQL', s1 === 1, String(s1));
  await row.getByRole('button', { name: /^Remove 1 / }).click();
  await sm.waitForTimeout(2500);
  const s2 = (await q('SELECT stock_quantity s FROM products WHERE id = $1', [lows[0]]))[0].s;
  check('- once removes exactly 1 in PostgreSQL', s2 === 0, String(s2));
  check('- is disabled at 0 (no negative stock)', await row.getByRole('button', { name: /^Remove 1 / }).isDisabled());
  check('no +10 shortcut left', (await sm.getByRole('button', { name: '+10' }).count()) === 0);
  await owner.goto(WEB + '/owner', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  const ot = await text(owner);
  const shown = lows.filter((_, i) => ot.includes(`Lowstock Item ${stamp}-${i}`)).length;
  check('owner low-stock card lists all 8 new low products (no cap)', shown === 8, `${shown}/8`);

  // ---- I. READY -> PREPARING, button layout
  const menu = (await api('GET', '/bar/menu', null)).data;
  const kTok = await apiLogin('kitchen@championsclub.example');
  const order = (await api('POST', '/bar/orders', await apiLogin('neha.sharma@championsclub.example'), { table_label: 'R-' + stamp, items: [{ bar_menu_item_id: menu[0].id, quantity: 1 }], payment_method: 'CASH' })).data;
  await api('PATCH', `/kitchen/orders/${order.id}/status`, kTok, { status: 'PREPARING' });
  await api('PATCH', `/kitchen/orders/${order.id}/status`, kTok, { status: 'READY' });
  await kitchen.goto(WEB + '/kitchen/orders', { waitUntil: 'networkidle' });
  await kitchen.waitForTimeout(1500);
  const card = kitchen.locator('section[aria-label="Ready"] li', { hasText: order.order_number });
  const served = card.getByRole('button', { name: /Served/ });
  const back = card.getByRole('button', { name: /back to preparing/i });
  const sb = await served.boundingBox();
  const bb = await back.boundingBox();
  check('Served and Back buttons sit on one row without overlap', !!sb && !!bb && Math.abs(sb.y - bb.y) < 4 && sb.x + sb.width <= bb.x + 1 && bb.height < 50, JSON.stringify({ sb, bb }));
  await back.click();
  await kitchen.waitForTimeout(2500);
  check('DB: READY -> PREPARING', (await q('SELECT status::text s FROM bar_orders WHERE id = $1', [order.id]))[0].s === 'PREPARING');
  check('UI shows it in Preparing', (await kitchen.locator('section[aria-label="Preparing"] li', { hasText: order.order_number }).count()) === 1);

  // ---- J. no preview popup over several polls, no demo copy in localStorage
  await kitchen.waitForTimeout(25000);
  for (const p of [owner, member, desk, kitchen, sm]) {
    const t = (await p.evaluate(() => window.__toasts)).filter((x) => /preview|sample data/i.test(x));
    check(`${p.__label}: no preview popup over several polling intervals`, t.length === 0, JSON.stringify(t));
  }
  check('no demo store in localStorage', (await owner.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mb.demo')))).length === 0);

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL REPAIR CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
