// Every Owner sidebar page must render (no "Unexpected Application Error", no failed dynamic import) and show Live data.
// Read-only. E2E_WEB (default :5173).  Also opens the pages in a second and third tab (Owner / Member / Kitchen together).
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const WEB = process.env.E2E_WEB || 'http://localhost:5173';
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); if (!ok) failures++; };
const PAGES = ['', '/analytics', '/members', '/memberships', '/bookings', '/store', '/kitchen', '/payments', '/staff', '/events', '/enquiries', '/reports'];

async function demo(ctx, label, home) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
  await page.waitForTimeout(2500);
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  // one browser context per tab = independent sessionStorage like separate Chrome tabs
  const A = await demo(await browser.newContext({ viewport: { width: 1440, height: 900 } }), 'Demo Admin', '/owner');
  for (const p of PAGES) {
    await A.page.goto(WEB + '/owner' + p, { waitUntil: 'networkidle' });
    await A.page.waitForTimeout(900);
    const t = await A.page.locator('body').innerText();
    check(`owner${p || ' (overview)'} renders`, !/Unexpected Application Error|Failed to fetch dynamically imported/i.test(t) && /Live data/i.test(t) && t.length > 400, t.slice(0, 80).replace(/\n/g, ' '));
  }
  const B = await demo(await browser.newContext(), 'Demo Member', '/member');
  const C = await demo(await browser.newContext(), 'Demo Kitchen', '/kitchen');
  await A.page.waitForTimeout(12000);
  for (const [n, x, home] of [['owner', A, '/owner'], ['member', B, '/member'], ['kitchen', C, '/kitchen']]) {
    const t = await x.page.locator('body').innerText();
    check(`tab ${n}: still signed in and live after the other tabs logged in`, new URL(x.page.url()).pathname.startsWith(home) && /Live data/i.test(t) && !/session ended|Please log in|Unexpected/i.test(t));
    await x.page.reload({ waitUntil: 'networkidle' });
    await x.page.waitForTimeout(1500);
    check(`tab ${n}: reload keeps its own role`, new URL(x.page.url()).pathname.startsWith(home) && /Live data/i.test(await x.page.locator('body').innerText()));
  }
  const bad = [...A.errs, ...B.errs, ...C.errs].filter((e) => !/favicon|DevTools/i.test(e));
  check('no console errors in any tab', bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nOWNER PAGES / MULTI-TAB CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
