// Browser end-to-end tests against the SCRATCH clone (backend :4001, web :5175). Prints PASS/FAIL per check.
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
// playwright-core is NOT a project dependency: `npm i --no-save playwright-core` (or set PLAYWRIGHT_CORE to its folder)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString().slice(-6);

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
async function login(page, email, password) {
  await page.goto(WEB + '/login', { waitUntil: 'networkidle' });
  await page.locator('input[name=email]:visible').fill(email);
  await page.locator('input[name=password]:visible').fill(password);
  await page.locator('input[name=password]:visible').press('Enter');
  await page.waitForTimeout(2500);
}
const pathOf = (page) => new URL(page.url()).pathname;
const bodyText = (page) => page.locator('body').innerText();
async function signupDetails(page, d) {
  await page.goto(WEB + '/signup', { waitUntil: 'networkidle' });
  await page.locator('input[name=full_name]').fill(d.name);
  await page.locator('input[name=email]:visible').fill(d.email);
  await page.locator('input[name=phone]').fill(d.phone);
  await page.locator('input[name=password]:visible').fill(d.password);
  await page.locator('input[name=confirm]').fill(d.password);
  if (d.dob) await page.locator('input[name=date_of_birth]').fill(d.dob);
  if (d.address) await page.locator('input[name=address]').fill(d.address);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(500);
}
const apiLogin = async (email, password) => (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json());

(async () => {
  browser = await launch();
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  // ============================================================ FLOW B: employee application + pending login
  const cook = { name: 'E2E Cook ' + stamp, email: `e2e.cook.${stamp}@example.com`, phone: '9811100001', password: 'CookPass123' };
  const clerk = { name: 'E2E Clerk ' + stamp, email: `e2e.clerk.${stamp}@example.com`, phone: '9811100002', password: 'ClerkPass123' };
  const nope = { name: 'E2E Nope ' + stamp, email: `e2e.nope.${stamp}@example.com`, phone: '9811100003', password: 'NopePass123' };
  for (const a of [cook, clerk, nope]) {
    const p = await actor();
    await signupDetails(p, a);
    check(`signup step 2 lists the four choices (${a.name})`, (await p.locator('input[name=choice]').count()) === 4);
    await p.getByText('Apply as an employee').click();
    await p.getByRole('button', { name: 'Submit job application' }).click();
    await p.waitForTimeout(2500);
    check(`employee signup -> /employee-application-pending (${a.name})`, pathOf(p) === '/employee-application-pending', pathOf(p));
    const t = await bodyText(p);
    check('page says "sent to the owner for approval"', /sent to the owner for approval/i.test(t));
    check('page says "under review"', /under review/i.test(t));
    const apps = await q('SELECT status, password_hash IS NOT NULL AS has_hash FROM employee_applications WHERE email = $1', [a.email]);
    check('DB: employee_applications PENDING with a bcrypt hash', apps.length === 1 && apps[0].status === 'PENDING' && apps[0].has_hash);
    check('DB: no users row yet', (await q('SELECT 1 FROM users WHERE email = $1', [a.email])).length === 0);
    const sess = await p.evaluate(() => sessionStorage.getItem('mb.session'));
    check('browser holds no session / token for the applicant', sess === null);
    await p.context().close();
  }

  // pending applicant logs in with the same credentials
  {
    const p = await actor();
    await login(p, cook.email, cook.password);
    check('PENDING login -> /employee-application-pending', pathOf(p) === '/employee-application-pending', pathOf(p));
    check('PENDING login page text "Your job application is under review."', /Your job application is under review\./.test(await bodyText(p)));
    check('PENDING login stores no session token', (await p.evaluate(() => sessionStorage.getItem('mb.session'))) === null);
    for (const dash of ['/kitchen', '/store-manager', '/front-desk', '/owner', '/member']) {
      await p.goto(WEB + dash, { waitUntil: 'networkidle' });
      await p.waitForTimeout(600);
      const t = await bodyText(p);
      check(`pending applicant cannot open ${dash}`, /Please log in/.test(t) && !/Recent activity|Live data/i.test(t));
    }
    // API level: no token at all for pending
    const r = await apiLogin(cook.email, cook.password);
    check('API login for pending returns state only, no token', r.data && r.data.state === 'EMPLOYEE_APPLICATION_PENDING' && !r.data.token);
    await p.context().close();
  }

  // ============================================================ FLOW C: owner approves (kitchen + store manager)
  const owner = await actor();
  await login(owner, 'owner@championsclub.example', 'Password@123');
  check('owner login -> /owner', pathOf(owner) === '/owner', pathOf(owner));
  await owner.goto(WEB + '/owner/staff', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  const rowOf = (name) => owner.locator('tr', { hasText: name }).first();
  const empRow = (name) => owner.locator('tr', { hasText: name }).filter({ has: owner.getByRole('button', { name: /Deactivate|Reactivate/ }) }).first();
  check('owner sees pending applications from the database', (await rowOf(cook.name).count()) === 1 && /Pending/i.test(await rowOf(cook.name).innerText()));

  await rowOf(cook.name).getByRole('button', { name: /Approve/ }).click();
  await owner.getByText('Kitchen', { exact: true }).last().click();
  await owner.getByRole('button', { name: /Approve as kitchen/i }).click();
  await owner.waitForTimeout(2500);
  let u = await q("SELECT u.role, u.is_active, s.id AS sid FROM users u JOIN staff s ON s.user_id = u.id WHERE u.email = $1", [cook.email]);
  check('DB: approved -> users(KITCHEN_MANAGER, active) + staff row', u.length === 1 && u[0].role === 'KITCHEN_MANAGER' && u[0].is_active);
  let a1 = await q('SELECT status, approved_role, reviewed_by_user_id IS NOT NULL AS rb, password_hash IS NULL AS cleared FROM employee_applications WHERE email = $1', [cook.email]);
  check('DB: application APPROVED, role stored, reviewer stored, temp hash cleared', a1[0].status === 'APPROVED' && a1[0].approved_role === 'KITCHEN_MANAGER' && a1[0].rb && a1[0].cleared);

  await rowOf(clerk.name).getByRole('button', { name: /Approve/ }).click();
  await owner.getByText('Store manager', { exact: true }).last().click();
  await owner.getByRole('button', { name: /Approve as store manager/i }).click();
  await owner.waitForTimeout(2500);
  u = await q("SELECT u.role FROM users u JOIN staff s ON s.user_id = u.id WHERE u.email = $1", [clerk.email]);
  check('DB: second applicant approved as STORE_MANAGER', u.length === 1 && u[0].role === 'STORE_MANAGER');

  // approved applicants log in with the SAME credentials
  {
    const p = await actor();
    await login(p, cook.email, cook.password);
    check('approved KITCHEN_MANAGER logs in -> /kitchen', pathOf(p) === '/kitchen', pathOf(p));
    await p.context().close();
    const p2 = await actor();
    await login(p2, clerk.email, clerk.password);
    check('approved STORE_MANAGER logs in -> /store-manager', pathOf(p2) === '/store-manager', pathOf(p2));
    await p2.context().close();
  }

  // ============================================================ FLOW D: rejection
  await owner.goto(WEB + '/owner/staff', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  await rowOf(nope.name).getByRole('button', { name: /Decline/ }).click();
  await owner.locator('textarea').fill('No opening for now');
  await owner.getByRole('button', { name: /^Decline$/ }).last().click();
  await owner.waitForTimeout(2500);
  a1 = await q('SELECT status, decision_note, password_hash IS NULL AS cleared FROM employee_applications WHERE email = $1', [nope.email]);
  check('DB: application REJECTED with note, hash cleared', a1[0].status === 'REJECTED' && a1[0].decision_note === 'No opening for now' && a1[0].cleared);
  check('DB: no active employee account for the rejected applicant', (await q('SELECT 1 FROM users WHERE email = $1', [nope.email])).length === 0);
  {
    const p = await actor();
    await login(p, nope.email, nope.password);
    check('rejected applicant gets no employee access (stays on login with an error)', !/^\/(kitchen|store-manager|front-desk|owner|member)/.test(pathOf(p)) && pathOf(p) !== '/employee-application-pending', pathOf(p));
    check('rejected applicant sees a safe error', /Invalid email or password/i.test(await bodyText(p)));
    await p.context().close();
  }

  // ============================================================ FLOW A: Gold member signup + checkout
  const gold = { name: 'E2E Gold ' + stamp, email: `e2e.gold.${stamp}@example.com`, phone: '9811100004', password: 'GoldPass123', address: '7 Test Lane, Pune' };
  {
    const p = await actor();
    await signupDetails(p, gold);
    await p.getByText('Apply for Gold membership').click();
    await p.getByRole('button', { name: 'Continue to payment' }).click();
    await p.waitForTimeout(500);
    check('checkout step shows the plan and a Pay button', /Checkout/.test(await bodyText(p)) && (await p.getByRole('button', { name: /Pay .* online/ }).count()) === 1);
    check('DB: nothing created before payment', (await q('SELECT 1 FROM users WHERE email = $1', [gold.email])).length === 0);
    await p.getByRole('button', { name: /Pay .* online/ }).click();
    await p.waitForTimeout(3500);
    check('member signup -> /member', pathOf(p) === '/member', pathOf(p));
    const m = await q(`SELECT u.role, u.is_active, u.password_hash LIKE '$2%' AS bcrypt, m.address, mt.status, pl.membership_type, pay.amount, pay.method::text AS method, pay.source_type::text AS st
                       FROM users u JOIN members m ON m.user_id = u.id JOIN membership_terms mt ON mt.member_id = m.id JOIN membership_plans pl ON pl.id = mt.membership_plan_id
                       JOIN payments pay ON pay.source_id = mt.id WHERE u.email = $1`, [gold.email]);
    check('DB: users + members + memberships + payments written', m.length === 1 && m[0].role === 'MEMBER' && m[0].bcrypt && m[0].membership_type === 'GOLD' && m[0].status === 'ACTIVE' && m[0].st === 'MEMBERSHIP' && m[0].method === 'ONLINE', JSON.stringify(m[0]));
    check('DB: address saved on members.address', m[0] && m[0].address === gold.address);
    await p.context().close();
  }

  // junior needs a date of birth: nothing created when it is missing
  {
    const p = await actor();
    const jr = { name: 'E2E Junior ' + stamp, email: `e2e.junior.${stamp}@example.com`, phone: '9811100005', password: 'JuniorPass123' };
    await signupDetails(p, jr);
    await p.getByText('Apply for Junior membership').click();
    await p.getByRole('button', { name: 'Continue to payment' }).click();
    await p.waitForTimeout(600);
    check('Junior without DOB is sent back to the details step', /needs the player/i.test(await bodyText(p)) && pathOf(p) === '/signup');
    check('DB: nothing created', (await q('SELECT 1 FROM users WHERE email = $1', [jr.email])).length === 0);
    await p.context().close();
  }

  // ============================================================ FLOW E: employee deactivation
  await owner.goto(WEB + '/owner/staff', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  await empRow(cook.name).getByRole('button', { name: /Deactivate/ }).click();
  await owner.waitForTimeout(2500);
  check('DB: users.is_active = false for the deactivated employee', (await q('SELECT is_active FROM users WHERE email = $1', [cook.email]))[0].is_active === false);
  check('DB: staff row and history stay', (await q('SELECT 1 FROM staff WHERE user_id = (SELECT id FROM users WHERE email = $1)', [cook.email])).length === 1);
  {
    const p = await actor();
    await login(p, cook.email, cook.password);
    check('deactivated employee is rejected', pathOf(p) !== '/kitchen' && /deactivated/i.test(await bodyText(p)), pathOf(p));
    await p.context().close();
  }
  await empRow(cook.name).getByRole('button', { name: /Reactivate/ }).click();
  await owner.waitForTimeout(2000);
  check('reactivation restores users.is_active', (await q('SELECT is_active FROM users WHERE email = $1', [cook.email]))[0].is_active === true);

  // ============================================================ FLOW F: member deactivation (owner UI)
  await owner.goto(WEB + '/owner/members', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  await owner.locator('input[type=search], input[placeholder*="Search"]').first().fill(gold.name);
  await owner.waitForTimeout(500);
  await owner.locator('tr', { hasText: gold.name }).first().click();
  await owner.waitForTimeout(500);
  await owner.getByRole('button', { name: /Deactivate/ }).click();
  await owner.waitForTimeout(2500);
  check('DB: member users.is_active = false', (await q('SELECT is_active FROM users WHERE email = $1', [gold.email]))[0].is_active === false);
  {
    const p = await actor();
    await login(p, gold.email, gold.password);
    check('deactivated member is rejected', pathOf(p) !== '/member' && /deactivated/i.test(await bodyText(p)), pathOf(p));
    await p.context().close();
  }
  await owner.getByRole('button', { name: /Reactivate/ }).click();
  await owner.waitForTimeout(2000);
  check('member reactivated', (await q('SELECT is_active FROM users WHERE email = $1', [gold.email]))[0].is_active === true);

  // owner adds a member through the UI
  await owner.getByRole('button', { name: 'Close' }).first().click().catch(() => undefined);
  await owner.getByRole('button', { name: /Add member/ }).click();
  const newm = { name: 'E2E Added ' + stamp, email: `e2e.added.${stamp}@example.com` };
  await owner.locator('#f-full_name').fill(newm.name);
  await owner.locator('#f-email').fill(newm.email);
  await owner.locator('#f-phone').fill('9811100006');
  await owner.locator('#f-initial_password').fill('AddedPass123');
  await owner.getByRole('button', { name: 'Create member' }).click();
  await owner.waitForTimeout(2500);
  check('DB: owner-created member exists', (await q('SELECT 1 FROM users u JOIN members m ON m.user_id = u.id WHERE u.email = $1', [newm.email])).length === 1);

  // ============================================================ FLOW G: store manager adds a product
  const prodName = 'E2E Racket ' + stamp;
  {
    const sm = await actor();
    await login(sm, clerk.email, clerk.password);
    check('store manager lands on /store-manager', pathOf(sm) === '/store-manager');
    await sm.waitForTimeout(1500);
    await sm.getByRole('button', { name: /Add product/ }).first().click();
    await sm.locator('#f-name').fill(prodName);
    await sm.locator('#f-sku').fill('E2E-' + stamp);
    await sm.locator('#f-brand').fill('E2E');
    await sm.locator('#f-price').fill('3333');
    await sm.locator('#f-stock').fill('9');
    await sm.getByRole('button', { name: 'Add product' }).last().click();
    await sm.waitForTimeout(2800);
    const pr = await q('SELECT price::text, stock_quantity, is_active FROM products WHERE sku = $1', ['E2E-' + stamp]);
    check('DB: products row created by the store manager', pr.length === 1 && pr[0].price === '3333.00' && pr[0].stock_quantity === 9 && pr[0].is_active, JSON.stringify(pr[0]));
    check('Store manager dashboard shows it after refetch', (await bodyText(sm)).includes(prodName));
    await sm.context().close();
  }
  await owner.goto(WEB + '/owner/store', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  check('Owner store shows the new product', (await bodyText(owner)).includes(prodName));
  {
    const pub = await actor();
    await pub.goto(WEB + '/shop', { waitUntil: 'networkidle' });
    await pub.waitForTimeout(1500);
    check('Public shop shows the new product (no restart)', (await bodyText(pub)).includes(prodName));
    await pub.context().close();
    const mem = await actor();
    await login(mem, 'aarav.kapoor@example.com', 'Password@123');
    await mem.goto(WEB + '/member/store', { waitUntil: 'networkidle' });
    await mem.waitForTimeout(1500);
    check('Member store shows the new product', (await bodyText(mem)).includes(prodName));

    // ======================================================== FLOW J: address persists
    await mem.getByText(prodName).first().click();
    await mem.waitForTimeout(500);
    await mem.getByRole('button', { name: /Add 1 to basket/ }).click();
    await mem.waitForTimeout(500);
    await mem.getByRole('button', { name: /^Basket/ }).click();
    await mem.waitForTimeout(500);
    await mem.getByText('Delivery', { exact: true }).first().click().catch(() => undefined);
    const addr = '21 Delivery Street, Baner, Pune ' + stamp;
    const ta = mem.locator('textarea');
    if (await ta.count()) await ta.first().fill(addr);
    await mem.getByRole('button', { name: /Pay .* online/ }).click();
    await mem.waitForTimeout(3000);
    const o = await q("SELECT delivery_address FROM shop_orders WHERE delivery_address LIKE $1", ['%' + stamp]);
    check('DB: shop_orders.delivery_address saved', o.length === 1);
    const ma = await q("SELECT m.address FROM members m JOIN users u ON u.id = m.user_id WHERE u.email = 'aarav.kapoor@example.com'");
    check('DB: members.address saved from the delivery order', ma[0].address === addr);
    await mem.context().close();
    const mem2 = await actor();
    await login(mem2, 'aarav.kapoor@example.com', 'Password@123');
    await mem2.goto(WEB + '/member/store', { waitUntil: 'networkidle' });
    await mem2.waitForTimeout(1200);
    await mem2.getByText(prodName).first().click().catch(() => undefined);
    await mem2.getByRole('button', { name: /Add 1 to basket/ }).click().catch(() => undefined);
    await mem2.waitForTimeout(500);
    await mem2.getByRole('button', { name: /^Basket/ }).click().catch(() => undefined);
    await mem2.waitForTimeout(500);
    await mem2.getByText('Delivery', { exact: true }).first().click().catch(() => undefined);
    const shown = (await mem2.locator('textarea').first().inputValue().catch(() => '')) || '';
    check('after logout/login the address comes back from the database', shown === addr, shown);
    await mem2.context().close();
  }

  // ============================================================ FLOW H: ONE menu
  {
    const api = await (await fetch(API + '/bar/menu')).json();
    const names = api.data.map((i) => i.name).sort();
    const pub = await actor();
    await pub.goto(WEB + '/bar-cafe', { waitUntil: 'networkidle' });
    await pub.waitForTimeout(1500);
    const pubText = await bodyText(pub);
    check('Public /bar-cafe shows every DB menu item', names.every((n) => pubText.includes(n)), `${names.length} items`);
    check('Public /bar-cafe shows no item the DB lacks (old board items gone)', !/Cortado|Spanish Latte|Millet Tabouleh/.test(pubText));
    await pub.context().close();

    const mk = await actor();
    await login(mk, 'aarav.kapoor@example.com', 'Password@123');
    await mk.goto(WEB + '/member/kitchen', { waitUntil: 'networkidle' });
    await mk.waitForTimeout(1500);
    const mkText = await bodyText(mk);
    check('Member kitchen shows every DB menu item', names.every((n) => mkText.includes(n)));
    await mk.context().close();

    const kp = await actor();
    await login(kp, 'kitchen@championsclub.example', 'Password@123');
    await kp.waitForTimeout(1500);
    const kpText = await bodyText(kp);
    check('Kitchen POS shows every DB menu item', names.every((n) => kpText.includes(n)));
    await kp.context().close();
  }

  // ============================================================ popup regression: stay on a dashboard through several polls
  {
    const p = await actor();
    await login(p, 'kitchen@championsclub.example', 'Password@123');
    const t0 = await p.evaluate(() => window.__toasts.length);
    await p.waitForTimeout(36000); // > 3 polling intervals (10 s)
    const toasts = await p.evaluate(() => window.__toasts);
    check('kitchen dashboard open for 36 s: no repeated popups', toasts.length - t0 === 0, JSON.stringify(toasts));
    await p.context().close();
  }
  {
    // a dead backend must not produce a popup every poll
    const p = await actor();
    await login(p, 'owner@championsclub.example', 'Password@123');
    await p.route('**/api/v1/**', (route) => route.abort());
    await p.waitForTimeout(36000);
    const toasts = await p.evaluate(() => window.__toasts);
    check('API unreachable for 36 s: at most one popup (deduplicated)', toasts.length <= 1, JSON.stringify(toasts));
    await p.context().close();
  }

  await owner.context().close();
  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL E2E CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error('E2E CRASH', e); process.exit(2); });
