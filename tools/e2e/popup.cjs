// Popup regression across every role + forced failure modes (scratch clone: backend :4001, web :5175).
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
// playwright-core is NOT a project dependency: `npm i --no-save playwright-core` (or set PLAYWRIGHT_CORE to its folder)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const launch = () => chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

const WEB = process.env.E2E_WEB || 'http://localhost:5175';
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); if (!ok) failures++; };

(async () => {
  const browser = await launch();
  const open = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__toasts = [];
      const start = () => new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches && n.matches('div.anim-slide-in') && n.closest('[aria-live=polite]')) window.__toasts.push(n.innerText.trim());
      }).observe(document.documentElement, { childList: true, subtree: true });
      if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
    });
    await page.goto(WEB + '/login', { waitUntil: 'networkidle' });
    await page.locator('input[name=email]:visible').fill(email);
    await page.locator('input[name=password]:visible').fill('Password@123');
    await page.locator('input[name=password]:visible').press('Enter');
    await page.waitForTimeout(3000);
    return page;
  };

  for (const [who, email] of [['owner', 'owner@championsclub.example'], ['front desk', 'neha.sharma@championsclub.example'], ['kitchen', 'kitchen@championsclub.example'], ['store manager', 'sanjay.gupta@championsclub.example'], ['member', 'aarav.kapoor@example.com']]) {
    const p = await open(email);
    const before = await p.evaluate(() => window.__toasts.length);
    await p.waitForTimeout(36000);
    const t = await p.evaluate(() => window.__toasts);
    check(`${who}: dashboard open through 3+ polls shows no popups`, t.length - before === 0, JSON.stringify(t));
    await p.context().close();
  }

  // a persistent server error on a required endpoint: one popup, not one per poll
  {
    const p = await open('owner@championsclub.example');
    await p.route('**/api/v1/courts', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } }) }));
    await p.waitForTimeout(36000);
    const t = await p.evaluate(() => window.__toasts);
    check('persistent 500: exactly one popup in 36 s', t.length === 1, JSON.stringify(t));
    await p.context().close();
  }

  // the session dies on the server (expired token / account switched off): sign out once, stop polling, no popup storm
  {
    const p = await open('owner@championsclub.example');
    let calls = 0;
    await p.route('**/api/v1/**', (r) => { calls++; r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'This account has been deactivated.' } }) }); });
    await p.waitForTimeout(36000);
    const t = await p.evaluate(() => window.__toasts);
    const text = await p.locator('body').innerText();
    check('ACCOUNT_DISABLED mid-session: no popup storm', t.length <= 1, JSON.stringify(t));
    check('ACCOUNT_DISABLED mid-session: signed out with a clear notice', /deactivated/i.test(text) && /Log in/.test(text));
    check('ACCOUNT_DISABLED mid-session: polling stopped (few requests)', calls <= 24, `${calls} requests`);
    await p.context().close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nPOPUP CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
