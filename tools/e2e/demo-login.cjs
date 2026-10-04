// Demo shortcuts must be the REAL login in live mode (real JWT, /auth/me, role from the server, LIVE data badge, survives a
// reload, no "session ended") and stay a mock identity in preview mode. Read-only: it only logs in.
//   live:    E2E_WEB=http://localhost:5173 E2E_API=http://localhost:4000/api/v1 node tools/e2e/demo-login.cjs
//   preview: E2E_WEB=http://localhost:5176 E2E_PREVIEW=1 node tools/e2e/demo-login.cjs   (vite --mode preview --port 5176)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const WEB = process.env.E2E_WEB || 'http://localhost:5173';
const API = process.env.E2E_API || 'http://localhost:4000/api/v1';
const PREVIEW = !!process.env.E2E_PREVIEW;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); if (!ok) failures++; };

const ONLY = process.env.E2E_ONLY;
const PEOPLE = [
  ['Demo Admin / Owner', 'OWNER_ADMIN', '/owner'],
  ['Demo Front Desk', 'FRONT_DESK', '/front-desk'],
  ['Demo Kitchen Manager', 'KITCHEN_MANAGER', '/kitchen'],
  ['Demo Store Manager', 'STORE_MANAGER', '/store-manager'],
  ['Demo Member', 'MEMBER', '/member'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const [label, role, home] of PEOPLE.filter((p) => !ONLY || p[1] === ONLY)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const calls = [];
    page.on('response', (r) => { const u = r.url(); if (u.includes('/api/v1/auth/')) calls.push(`${r.request().method()} ${new URL(u).pathname} ${r.status()}`); });
    const toasts = [];
    await page.addInitScript(() => { window.__t = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.closest && n.closest('[aria-live=polite]')) window.__t.push(n.innerText); }))).observe(document, { childList: true, subtree: true }); });
    await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(label.replace(/[/]/g, '.')) }).first().click();
    await page.waitForTimeout(3500);
    const path = new URL(page.url()).pathname;
    let body = await page.locator('body').innerText();
    check(`${label}: lands on ${home}`, path === home || path.startsWith(home + '/'), path);
    check(`${label}: no session-ended page`, !/session ended|Please log in/i.test(body));
    if (PREVIEW) {
      check(`${label}: preview shows Demo data and makes no auth call`, /Demo data/i.test(body) && calls.length === 0, calls.join(' | '));
    } else {
      check(`${label}: real POST /auth/login 200`, calls.some((c) => c.startsWith('POST /api/v1/auth/login 200')), calls.join(' | '));
      check(`${label}: header says Live data`, /Live data/i.test(body) && !/Demo data/i.test(body));
      const stored = JSON.parse(await page.evaluate(() => sessionStorage.getItem('mb.session')));
      check(`${label}: stored session is a real JWT with the server's role`, stored.token !== 'demo-session' && stored.token.split('.').length === 3 && stored.user.role === role, stored.user.role);
      const me = await (await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${stored.token}` } })).json();
      check(`${label}: /auth/me succeeds with ${role}`, me.success && me.data.user.role === role);
      calls.length = 0;
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      body = await page.locator('body').innerText();
      check(`${label}: reload keeps the session (revalidated by /auth/me)`, new URL(page.url()).pathname.startsWith(home) && !/session ended|Please log in/i.test(body) && /Live data/i.test(body) && calls.some((c) => c.startsWith('GET /api/v1/auth/me 200')), calls.join(' | '));
      await page.waitForTimeout(12000);
      const t = (await page.evaluate(() => window.__t)).filter((x) => /preview|sample data|session/i.test(x));
      check(`${label}: no preview/session popup over a poll`, t.length === 0, JSON.stringify(t));
      if (role === 'OWNER_ADMIN') {
        await page.locator('button[aria-haspopup=menu]').first().click();
        await page.getByRole('menuitem', { name: /Log out/ }).click();
        await page.waitForTimeout(1500);
        check('logout clears the session', (await page.evaluate(() => sessionStorage.getItem('mb.session'))) === null);
        await page.goto(WEB + '/owner', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        check('dashboard is unavailable after logout', !new URL(page.url()).pathname.startsWith('/owner/') && /log in|sign in/i.test(await page.locator('body').innerText()));
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nDEMO LOGIN CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
