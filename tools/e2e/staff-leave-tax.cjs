// Browser e2e (scratch clone, API :4001, web :5175; the clone must have migration 0010 applied):
//   A. owner Staff: salary visible, edited, persisted in PostgreSQL, later payroll uses it, earlier payroll untouched
//   B. employee asks for leave -> PENDING row -> owner approves -> employee sees APPROVED (+ notice); second request rejected with a note
//   D. owner Reports > Taxes to report: figures = PostgreSQL, period change, input tax credit, reported status persists
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
const stamp = Date.now().toString().slice(-6);

async function actor(browser, demoLabel) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.goto(WEB + '/demo', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(demoLabel) }).first().click();
  await page.waitForTimeout(2500);
  return page;
}
const ist = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
const rupeeIn = (t, label) => { const m = t.replace(/\s+/g, ' ').match(new RegExp(label + ' ₹([\\d,.]+)', 'i')); return m ? Number(m[1].replace(/,/g, '')) : NaN; };

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const owner = await actor(browser, 'Demo Admin / Owner');

  // ------------------------------------------------------------ A. salary
  await owner.goto(WEB + '/owner/staff', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1800);
  const neha = (await q("SELECT s.id, s.monthly_salary::float sal FROM staff s JOIN users u ON u.id = s.user_id WHERE u.email = 'neha.sharma@championsclub.example'"))[0];
  const row = owner.locator('tr', { hasText: 'Neha Sharma' }).first();
  check('owner Staff shows the employee salary from the database', (await row.innerText()).replace(/[,\s]/g, '').includes(String(Math.round(neha.sal))), String(neha.sal));
  const newSalary = Math.round(neha.sal) + 1111;
  await owner.getByRole('button', { name: 'Edit Neha Sharma' }).click();
  await owner.getByLabel('Salary / month (₹)').fill(String(newSalary));
  await owner.getByRole('button', { name: 'Save changes' }).click();
  await owner.waitForTimeout(2500);
  check('salary change is in PostgreSQL', (await q('SELECT monthly_salary::float s FROM staff WHERE id = $1', [neha.id]))[0].s === newSalary);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1800);
  check('after a reload the owner sees the new salary', (await owner.locator('tr', { hasText: 'Neha Sharma' }).first().innerText()).replace(/[,\s]/g, '').includes(String(newSalary)));
  const tok = await owner.evaluate(() => JSON.parse(sessionStorage.getItem('mb.session') || '{}').token);
  const api = async (method, p, body) => (await fetch('http://localhost:4001/api/v1' + p, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined })).json();
  const before = await q("SELECT pay_period::text p, amount::float a FROM payroll_payments WHERE staff_id = $1 ORDER BY pay_period", [neha.id]);
  const created = await api('POST', '/staff/payroll', { staff_id: neha.id, pay_period: '2032-01-01', payment_method: 'UPI' });
  check('a new payroll month uses the updated salary', created.success && Number(created.data.amount) === newSalary, created.success ? created.data.amount : JSON.stringify(created.error));
  const after = await q("SELECT pay_period::text p, amount::float a FROM payroll_payments WHERE staff_id = $1 AND pay_period < '2032-01-01' ORDER BY pay_period", [neha.id]);
  check('earlier payroll amounts are unchanged', JSON.stringify(before) === JSON.stringify(after));

  // ------------------------------------------------------------ B. leave
  const desk = await actor(browser, 'Demo Front Desk');
  await desk.goto(WEB + '/front-desk/leave', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(1800);
  check('front desk sees their own salary on Leave & pay', (await text(desk)).replace(/[,\s]/g, '').includes(String(newSalary)));
  const r1 = 'E2E leave ' + stamp;
  const dates = (n, len) => [ist(n), ist(n + len)];
  const [s1, e1] = dates(30, 2);
  const fillAndSend = async (page, s, e, reason) => {
    const inputs = page.locator('input[type=date]');
    await inputs.nth(0).fill(s);
    await inputs.nth(1).fill(e);
    await page.getByPlaceholder('e.g. Family function').fill(reason);
    await page.getByRole('button', { name: /Send request/ }).click();
    await page.waitForTimeout(2500);
  };
  await fillAndSend(desk, s1, e1, r1);
  const lv = await q("SELECT id, status::text s, decided_by_user_id FROM leave_requests WHERE reason = $1", [r1]);
  check('the leave request is a PENDING row in PostgreSQL', lv.length === 1 && lv[0].s === 'PENDING' && lv[0].decided_by_user_id === null);
  check('the employee sees it as pending on their page', /pending/i.test(await desk.locator('tr', { hasText: r1 }).innerText()));

  await owner.goto(WEB + '/owner/staff', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1800);
  const orow = owner.locator('tr', { hasText: r1 });
  check('owner Staff > Leave requests lists it as pending with the reason', (await orow.count()) === 1 && /pending/i.test(await orow.innerText()));
  await orow.getByRole('button', { name: 'Approve' }).click();
  await owner.waitForTimeout(2500);
  const ap = (await q("SELECT status::text s, decided_by_user_id, decided_at FROM leave_requests WHERE id = $1", [lv[0].id]))[0];
  check('approval is stored with the reviewer and the time', ap.s === 'APPROVED' && !!ap.decided_by_user_id && !!ap.decided_at);
  await desk.goto(WEB + '/front-desk', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2200);
  let dt = await text(desk);
  check('the employee sees the "Leave approved" notice after a refresh', /Leave approved/.test(dt) && /has been approved/.test(dt));
  await desk.goto(WEB + '/front-desk/leave', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(1500);
  check('and APPROVED on their Leave & pay page', /approved/i.test(await desk.locator('tr', { hasText: r1 }).innerText()));

  const r2 = 'E2E reject ' + stamp;
  const [s2, e2] = dates(45, 1);
  await fillAndSend(desk, s2, e2, r2);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1800);
  await owner.locator('tr', { hasText: r2 }).getByRole('button', { name: 'Reject' }).click();
  check('rejecting needs a reason (button disabled until typed)', await owner.getByRole('button', { name: 'Reject leave' }).isDisabled());
  await owner.getByLabel('Reason for rejecting').fill('Tournament week');
  await owner.getByRole('button', { name: 'Reject leave' }).click();
  await owner.waitForTimeout(2500);
  const rj = (await q("SELECT status::text s, decision_note n, decided_by_user_id FROM leave_requests WHERE reason = $1", [r2]))[0];
  check('rejection is stored with the note and the reviewer', rj.s === 'REJECTED' && rj.n === 'Tournament week' && !!rj.decided_by_user_id);
  await desk.goto(WEB + '/front-desk', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(2200);
  dt = await text(desk);
  check('the employee sees "Leave request rejected" with the reason', /Leave request rejected/.test(dt) && /Tournament week/.test(dt));

  // ------------------------------------------------------------ D. taxes
  await owner.goto(WEB + '/owner/reports', { waitUntil: 'networkidle' });
  await owner.waitForTimeout(2500);
  const thisM = ist().slice(0, 7);
  const lastD = new Date(thisM + '-01T12:00:00Z'); lastD.setUTCMonth(lastD.getUTCMonth() - 1);
  const lastM = lastD.toISOString().slice(0, 7);
  const dbTax = async (m) => {
    const r = await q(`SELECT coalesce(sum(CASE WHEN amount = 0 THEN 0 ELSE tax_amount * (amount - refunded_amount) / amount END), 0)::float tax,
                              coalesce(sum(amount - refunded_amount), 0)::float net
                         FROM payments WHERE to_char(paid_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = $1`, [m]);
    return { tax: Math.round(r[0].tax * 100) / 100, taxable: Math.round((r[0].net - r[0].tax) * 100) / 100 };
  };
  let t = await text(owner);
  check('Reports shows the Taxes to report section with the four figures and a status', /Taxes to report/i.test(t) && /Taxable revenue/i.test(t) && /Tax collected/i.test(t) && /Input tax credit/i.test(t) && /Estimated payable/i.test(t) && /Reporting status/i.test(t));
  const near = (a, b) => Math.abs(a - b) <= 1.01;
  let exp = await dbTax(lastM);
  check(`last month (${lastM}): tax collected = PostgreSQL`, near(rupeeIn(t, 'Tax collected'), exp.tax), `${rupeeIn(t, 'Tax collected')} vs ${exp.tax}`);
  check(`last month (${lastM}): taxable revenue = PostgreSQL`, near(rupeeIn(t, 'Taxable revenue'), exp.taxable), `${rupeeIn(t, 'Taxable revenue')} vs ${exp.taxable}`);
  const creditBefore = rupeeIn(t, 'Input tax credit');
  check('a finished month is READY TO REPORT or REPORTED', /Ready to report|Reported/i.test(t));

  await owner.getByRole('button', { name: 'This month', exact: true }).click();
  await owner.waitForTimeout(1500);
  t = await text(owner);
  exp = await dbTax(thisM);
  check(`changing to this month (${thisM}) updates the figures from PostgreSQL`, near(rupeeIn(t, 'Tax collected'), exp.tax) && /Not ready/i.test(t), `${rupeeIn(t, 'Tax collected')} vs ${exp.tax}`);
  await owner.locator('input[type=month]').fill(lastM);
  await owner.waitForTimeout(1500);

  await owner.getByRole('button', { name: /Record input tax/ }).click();
  const inDate = lastM + '-15';
  await owner.getByLabel('Invoice date').fill(inDate);
  await owner.getByLabel('Supplier').fill('E2E Supplier ' + stamp);
  await owner.getByLabel('Taxable amount (₹)').fill('1000');
  await owner.getByLabel('Tax paid (₹)').fill('180');
  await owner.getByRole('button', { name: 'Save input tax' }).click();
  await owner.waitForTimeout(2200);
  const ti = await q("SELECT tax_amount::float a, is_eligible e FROM tax_inputs WHERE supplier = $1", ['E2E Supplier ' + stamp]);
  check('the input tax record is a row in PostgreSQL', ti.length === 1 && ti[0].a === 180 && ti[0].e === true);
  t = await text(owner);
  const creditAfter = rupeeIn(t, 'Input tax credit');
  check('input tax credit rose by the eligible amount', near(creditAfter, creditBefore + 180), `${creditBefore} -> ${creditAfter}`);
  const collected = rupeeIn(t, 'Tax collected');
  check('estimated payable = max(0, tax collected - credit)', near(rupeeIn(t, 'Estimated payable'), Math.max(0, collected - creditAfter)), `${rupeeIn(t, 'Estimated payable')}`);

  // reported flag persists (only when the month is not already reported)
  const already = (await q("SELECT 1 FROM tax_periods WHERE period = $1", [lastM + '-01'])).length > 0;
  if (!already) {
    await owner.getByRole('button', { name: 'Mark as reported' }).click();
    await owner.waitForTimeout(2200);
    check('Mark as reported stores the month in PostgreSQL', (await q("SELECT 1 FROM tax_periods WHERE period = $1", [lastM + '-01'])).length === 1);
    await owner.reload({ waitUntil: 'networkidle' });
    await owner.waitForTimeout(2200);
    check('after a reload the status is still Reported', /Reported/.test(await text(owner)) && !/Mark as reported/.test(await text(owner)));
    await owner.getByRole('button', { name: 'Reopen' }).click();
    await owner.waitForTimeout(2000);
    check('Reopen removes the reported mark', (await q("SELECT 1 FROM tax_periods WHERE period = $1", [lastM + '-01'])).length === 0);
  }
  await owner.getByRole('button', { name: new RegExp('Remove input tax from E2E Supplier') }).click();
  await owner.waitForTimeout(2000);
  check('the input tax record can be removed', (await q("SELECT 1 FROM tax_inputs WHERE supplier = $1", ['E2E Supplier ' + stamp])).length === 0);

  // employees never see the tax overview or other staff's pay
  await desk.goto(WEB + '/owner/reports', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(1200);
  check('a front desk user cannot open the owner reports', !/Taxes to report/i.test(await text(desk)));

  await db.end();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nSTAFF / LEAVE / TAX CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
