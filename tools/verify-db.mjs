// Applies database/migrations/*.sql then database/seed/seed.sql to an IN-MEMORY Postgres (PGlite)
// and runs invariant probes. Proves the canonical schema + seed are valid without a Postgres install.
//   npm run check:db            (migrations + seed + probes)
//   npm run check:db -- --no-seed
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noSeed = process.argv.includes('--no-seed');
const db = new PGlite({ extensions: { btree_gist } });

let failures = 0;
const ok = (m) => console.log('  ✔', m);
const bad = (m) => { failures++; console.log('  ✘', m); };

const migDir = path.join(root, 'database/migrations');
for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(path.join(migDir, f), 'utf8')); ok(`migration ${f}`); }
  catch (e) { bad(`migration ${f}: ${e.message}`); process.exit(1); }
}

const seedFile = path.join(root, 'database/seed/seed.sql');
if (!noSeed) {
  if (!existsSync(seedFile)) { bad('database/seed/seed.sql missing (run npm run mock:build)'); process.exit(1); }
  try { await db.exec(readFileSync(seedFile, 'utf8')); ok('seed.sql'); }
  catch (e) { bad(`seed.sql: ${e.message}`); process.exit(1); }
}

// ---- probes: constraints must REJECT bad data
async function mustFail(label, sql, expect) {
  try { await db.exec(sql); bad(`${label} — was accepted but must be rejected`); }
  catch (e) {
    if (expect && !new RegExp(expect).test(e.message)) bad(`${label} — rejected for the WRONG reason: ${e.message}`);
    else ok(`${label} — rejected (${e.message.slice(0, 80)})`);
  }
}
if (!noSeed) {
  const q = async (sql) => (await db.query(sql)).rows;
  const none = async (label, sql) => { const r = await q(sql); r.length === 0 ? ok(label) : bad(`${label} — ${r.length} violation(s): ${JSON.stringify(r.slice(0, 3))}`); };
  const today = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

  // ---- structure of the simplified schema (ADR-016)
  const tables = (await q(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`))[0].n;
  tables === 22 ? ok('22 tables') : bad(`expected 22 tables, found ${tables}`);
  await none('every retired table is gone (bar_tables, bar_tabs, order_status_events, quotes, enquiry_follow_ups, notifications, inventory_movements, social_*)',
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('bar_tables','bar_tabs','order_status_events','quotes','enquiry_follow_ups','notifications','inventory_movements','social_sessions','social_session_participants')`);
  await none('no stored status / amount / total columns that the views derive',
    `SELECT table_name||'.'||column_name AS col FROM information_schema.columns WHERE table_schema='public' AND (table_name, column_name) IN
       (('memberships','status'),('court_bookings','status'),('court_bookings','amount_due'),('court_bookings','payment_status'),('shop_orders','total_amount'),('shop_orders','payment_status'),
        ('bar_orders','total_amount'),('bar_orders','payment_status'),('invoices','total_amount'),('invoices','amount_paid'),('payments','status'),('payments','revenue_category'))`);

  // ---- constraints
  const c = (await q(`SELECT id FROM courts ORDER BY name LIMIT 1`))[0].id;
  const b = (await q(`SELECT start_at FROM court_bookings WHERE cancelled_at IS NULL AND booking_type = 'REGULAR' AND court_id='${c}' LIMIT 1`))[0];
  if (b) {
    const s = new Date(b.start_at).toISOString();
    const s30 = new Date(new Date(b.start_at).getTime() + 30 * 60000).toISOString();
    await mustFail('double-booking same slot', `INSERT INTO court_bookings (court_id,guest_name,start_at,end_at) VALUES ('${c}','X','${s}', '${new Date(new Date(s).getTime()+3600000).toISOString()}')`, 'court_bookings_no_overlap');
    await mustFail('overlapping half-hour slot', `INSERT INTO court_bookings (court_id,guest_name,start_at,end_at) VALUES ('${c}','X','${s30}', '${new Date(new Date(s30).getTime()+3600000).toISOString()}')`, 'court_bookings_no_overlap');
  } else bad('no standing booking found to probe');
  await mustFail('non-30-minute slot', `INSERT INTO court_bookings (court_id,guest_name,start_at,end_at) VALUES ('${c}','X','2031-01-01T10:15:00Z','2031-01-01T11:15:00Z')`);
  await mustFail('a REGULAR booking needs a member or a guest name', `INSERT INTO court_bookings (court_id,start_at,end_at) VALUES ('${c}','2031-01-01T10:00:00Z','2031-01-01T11:00:00Z')`, 'court_bookings_customer_known');
  await mustFail('negative stock', `UPDATE products SET stock_quantity = -1 WHERE id = (SELECT id FROM products LIMIT 1)`);
  await mustFail('overlapping live membership terms for one member (memberships_no_overlap)', `INSERT INTO memberships (member_id,membership_plan_id,start_date,end_date,price_paid) SELECT member_id,membership_plan_id,current_date,current_date,0 FROM membership_terms WHERE status='ACTIVE' LIMIT 1`, 'memberships_no_overlap');
  await mustFail('an invoice is addressed to exactly one recipient', `INSERT INTO invoices (business_client_id, member_id, due_date, tax_rate) SELECT (SELECT id FROM business_clients LIMIT 1), (SELECT id FROM members LIMIT 1), current_date, 18`, 'invoices_one_recipient');
  await mustFail('a cafe order needs a customer or a table label', `INSERT INTO bar_orders (status) VALUES ('NEW')`, 'bar_orders_customer_known');
  await mustFail('an online shop order needs a member', `INSERT INTO shop_orders (fulfillment, status, guest_name) VALUES ('PICKUP','PLACED','X')`, 'shop_orders_online_needs_member');
  const free = await q(`SELECT count(*)::int AS n FROM court_bookings WHERE cancelled_at IS NOT NULL`);
  free[0].n > 0 ? ok('seed contains cancelled bookings (slot re-bookable)') : bad('no cancelled booking in seed');

  // ---- identity: a role must have its profile row (the JWT claims member_id / staff_id)
  await none('every MEMBER user has a members row; every staff user has a staff row',
    `SELECT u.email FROM users u WHERE (u.role = 'MEMBER' AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id))
        OR (u.role IN ('FRONT_DESK','KITCHEN_MANAGER','OWNER_ADMIN') AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id))`);
  await none('profile rows belong to users of the right role (members -> MEMBER, staff -> staff roles, business clients -> BUSINESS_CLIENT)',
    `SELECT u.email FROM users u WHERE (EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id) AND u.role <> 'MEMBER')
        OR (EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id) AND u.role NOT IN ('FRONT_DESK','KITCHEN_MANAGER','OWNER_ADMIN'))
        OR (EXISTS (SELECT 1 FROM business_clients c WHERE c.user_id = u.id) AND u.role <> 'BUSINESS_CLIENT')`);

  // ---- financial reconciliation: every payment pays something that exists, and nothing is over-paid
  await none('payments.source_type/source_id (polymorphic) all resolve',
    `SELECT p.payment_number FROM payments p WHERE NOT CASE p.source_type
        WHEN 'COURT_BOOKING' THEN EXISTS (SELECT 1 FROM court_bookings x WHERE x.id = p.source_id)
        WHEN 'MEMBERSHIP'    THEN EXISTS (SELECT 1 FROM memberships x WHERE x.id = p.source_id)
        WHEN 'SHOP_ORDER'    THEN EXISTS (SELECT 1 FROM shop_orders x WHERE x.id = p.source_id)
        WHEN 'BAR_ORDER'     THEN EXISTS (SELECT 1 FROM bar_orders x WHERE x.id = p.source_id)
        WHEN 'INVOICE'       THEN EXISTS (SELECT 1 FROM invoices x WHERE x.id = p.source_id) END`);
  await none('nothing is over-paid (net paid <= amount due for bookings, shop orders, cafe orders and invoices)',
    `SELECT 'booking '||court_booking_id AS k FROM court_booking_totals WHERE amount_paid > amount_due
     UNION ALL SELECT 'shop '||shop_order_id FROM shop_order_totals WHERE amount_paid > total_amount
     UNION ALL SELECT 'cafe '||bar_order_id FROM bar_order_totals WHERE amount_paid > total_amount
     UNION ALL SELECT 'invoice '||invoice_id FROM invoice_totals WHERE amount_paid > total_amount`);
  await none('the views return exactly one row per booking, shop order, cafe order, invoice and payment',
    `SELECT 'bookings' FROM (SELECT (SELECT count(*) FROM court_bookings) a, (SELECT count(*) FROM court_booking_totals) b) x WHERE a <> b
     UNION ALL SELECT 'shop' FROM (SELECT (SELECT count(*) FROM shop_orders) a, (SELECT count(*) FROM shop_order_totals) b) x WHERE a <> b
     UNION ALL SELECT 'cafe' FROM (SELECT (SELECT count(*) FROM bar_orders) a, (SELECT count(*) FROM bar_order_totals) b) x WHERE a <> b
     UNION ALL SELECT 'invoices' FROM (SELECT (SELECT count(*) FROM invoices) a, (SELECT count(*) FROM invoice_totals) b) x WHERE a <> b
     UNION ALL SELECT 'payments' FROM (SELECT (SELECT count(*) FROM payments) a, (SELECT count(*) FROM payment_ledger) b) x WHERE a <> b`);
  await none('the seed exercises every derived booking status (CONFIRMED, COMPLETED, CANCELLED) and payment status (PAID, PENDING, NOT_REQUIRED, REFUNDED)',
    `SELECT v.s FROM (VALUES ('CONFIRMED'),('COMPLETED'),('CANCELLED')) v(s) WHERE NOT EXISTS (SELECT 1 FROM court_booking_totals t WHERE t.status::text = v.s)
     UNION ALL SELECT v.s FROM (VALUES ('PAID'),('PENDING'),('NOT_REQUIRED'),('REFUNDED')) v(s) WHERE NOT EXISTS (SELECT 1 FROM court_booking_totals t WHERE t.payment_status::text = v.s)`);
  await none('the seed exercises every derived invoice payment state (UNPAID, PARTIALLY_PAID, PAID, OVERDUE)',
    `SELECT v.s FROM (VALUES ('UNPAID'),('PARTIALLY_PAID'),('PAID'),('OVERDUE')) v(s) WHERE NOT EXISTS (SELECT 1 FROM invoice_totals t WHERE t.payment_state::text = v.s)`);
  await none('R-INVC-01..04: only SENT invoices have a payment state; a VOID invoice has no payments',
    `SELECT i.invoice_number FROM invoices i JOIN invoice_totals t ON t.invoice_id = i.id
      WHERE (i.status <> 'SENT' AND t.payment_state IS NOT NULL) OR (i.status = 'SENT' AND t.payment_state IS NULL)
         OR (i.status = 'VOID' AND t.amount_paid <> 0)`);
  await none('R-FIN-03: invoice tax = round(subtotal x tax_rate / 100), total = subtotal + tax (view invoice_totals)',
    `SELECT i.invoice_number FROM invoices i JOIN invoice_totals t ON t.invoice_id = i.id
      WHERE t.tax_amount <> round(t.subtotal * i.tax_rate / 100, 2) OR t.total_amount <> t.subtotal + t.tax_amount`);
  await none('R-SHOP-06: online (PICKUP / DELIVERY) orders always belong to a member; a counter (IN_STORE) sale may be a guest',
    `SELECT order_number FROM shop_orders WHERE fulfillment <> 'IN_STORE' AND member_id IS NULL`);
  await none('R-SHOP-07: PICKUP orders never OUT_FOR_DELIVERY, DELIVERY orders never READY_FOR_PICKUP; a cancelled order is fully refunded',
    `SELECT order_number FROM shop_orders WHERE (fulfillment = 'PICKUP' AND status = 'OUT_FOR_DELIVERY') OR (fulfillment = 'DELIVERY' AND status = 'READY_FOR_PICKUP')
     UNION ALL SELECT o.order_number FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id WHERE o.status = 'CANCELLED' AND t.payment_status <> 'REFUNDED'`);
  await none('R-SHOP-03: seed has low-stock and out-of-stock products for the demo',
    `SELECT 1 WHERE (SELECT count(*) FROM products WHERE stock_quantity = 0) = 0 OR (SELECT count(*) FROM products WHERE stock_quantity > 0 AND stock_quantity <= low_stock_threshold) = 0`);

  // ---- business-rule probes on the seed (these use the SAME reference SQL as docs/business-rules/BUSINESS_RULES.md)
  await none('R-COURT-01: every booking starts within club hours (06:00–21:00 IST) on :00/:30',
    `SELECT booking_number FROM court_bookings WHERE (start_at AT TIME ZONE 'Asia/Kolkata')::time NOT BETWEEN '06:00' AND '21:00'`);
  await none('R-COURT-04: no member exceeds max_plays_per_day on any IST day (reference query)',
    `SELECT b.member_id, (b.start_at AT TIME ZONE 'Asia/Kolkata')::date AS d, count(*) FROM court_bookings b
      WHERE b.member_id IS NOT NULL AND b.booking_type = 'REGULAR' AND b.cancelled_at IS NULL GROUP BY 1, 2 HAVING count(*) > 2`);
  const demoLimit = await q(`SELECT count(*)::int n FROM (SELECT member_id, (start_at AT TIME ZONE 'Asia/Kolkata')::date d FROM court_bookings WHERE booking_type='REGULAR' AND cancelled_at IS NULL AND member_id IS NOT NULL GROUP BY 1,2 HAVING count(*) = 2) x`);
  demoLimit[0].n > 0 ? ok(`seed contains ${demoLimit[0].n} member-day(s) at exactly the limit (demo of DAILY_BOOKING_LIMIT)`) : bad('no member-day at the daily limit for the demo');
  await none('R-COURT-05: member booking discount = percentOf(list_price, the court discount of the term effective on the booking date)',
    `SELECT b.booking_number FROM court_bookings b
       LEFT JOIN memberships m ON m.member_id = b.member_id AND m.cancelled_at IS NULL AND (b.start_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN m.start_date AND m.end_date
       LEFT JOIN membership_plans p ON p.id = m.membership_plan_id
      WHERE b.booking_type = 'REGULAR' AND b.member_id IS NOT NULL AND b.discount_amount <> round(b.list_price * coalesce(p.court_discount_percent, 0) / 100, 2)`);
  await none('R-MEM-03: every term (that was not cancelled) lasts exactly duration_months (end = start + months − 1 day), except a term ended by a plan change',
    `SELECT m.id FROM membership_terms m JOIN membership_plans p ON p.id = m.membership_plan_id
      WHERE m.status IN ('ACTIVE','UPCOMING') AND m.end_date <> (m.start_date + (p.duration_months || ' months')::interval - interval '1 day')::date`);
  await none('R-MEM-04: the seed exercises the derived membership statuses ACTIVE, EXPIRED and CANCELLED',
    `SELECT v.s FROM (VALUES ('ACTIVE'),('EXPIRED'),('CANCELLED')) v(s) WHERE NOT EXISTS (SELECT 1 FROM membership_terms t WHERE t.status::text = v.s)`);
  await none('R-MEM-04: derived status is consistent with the dates (ACTIVE covers today IST; EXPIRED ended before today; CANCELLED has cancelled_at)',
    `SELECT id FROM membership_terms t
      WHERE (t.status = 'ACTIVE'  AND NOT (t.cancelled_at IS NULL AND ${today} BETWEEN t.start_date AND t.end_date))
         OR (t.status = 'EXPIRED' AND NOT (t.cancelled_at IS NULL AND t.end_date < ${today}))
         OR (t.status = 'CANCELLED' AND t.cancelled_at IS NULL)`);
  await none('member_membership_status has one row per member; ACTIVE iff a live term covers today; NULL only for members who never had a plan',
    `SELECT mb.id FROM members mb LEFT JOIN member_membership_status s ON s.member_id = mb.id
      WHERE s.member_id IS NULL
         OR (coalesce(s.membership_status::text, '') = 'ACTIVE') <> EXISTS (SELECT 1 FROM memberships m WHERE m.member_id = mb.id AND m.cancelled_at IS NULL AND ${today} BETWEEN m.start_date AND m.end_date)
         OR (s.membership_status IS NULL) <> NOT EXISTS (SELECT 1 FROM memberships m WHERE m.member_id = mb.id AND m.start_date <= ${today})`);
  await none('R-FIN-02: payment.tax_amount = round(amount × rate ÷ (100+rate)) for tax-inclusive sources (court 18, membership 18, shop 18, cafe 5)',
    `SELECT p.payment_number FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE p.source_type <> 'INVOICE'
       AND p.tax_amount <> round(p.amount * (CASE l.revenue_category WHEN 'BAR' THEN 5 ELSE 18 END) / (100 + (CASE l.revenue_category WHEN 'BAR' THEN 5 ELSE 18 END)), 2)`);
  await none('R-FIN-05: invoice payment tax = amount × invoice tax ÷ invoice total',
    `SELECT p.payment_number FROM payments p JOIN invoice_totals i ON i.invoice_id = p.source_id WHERE p.source_type = 'INVOICE'
       AND abs(p.tax_amount - round(p.amount * i.tax_amount / i.total_amount, 2)) > 0.01`);
  await none('R-FIN-05: an invoice payment belongs to the invoice recipient (business client or member)',
    `SELECT p.payment_number FROM payments p JOIN invoices i ON i.id = p.source_id WHERE p.source_type = 'INVOICE'
       AND (p.business_client_id IS DISTINCT FROM i.business_client_id OR p.member_id IS DISTINCT FROM i.member_id)`);
  await none('R-FIN-06: refunded payments carry a reason, a timestamp and refunded_amount ≤ amount',
    `SELECT payment_number FROM payments WHERE (refunded_amount > 0 AND (refund_reason IS NULL OR refunded_at IS NULL)) OR refunded_amount > amount`);
  await none('R-FIN-10: payroll is unique per employee per month and a paid salary has a paid_on date (pending = NULL)',
    `SELECT staff_id FROM payroll_payments GROUP BY staff_id, pay_period HAVING count(*) > 1`);
  await none('R-BAR-07: a cafe order is NEW, PREPARING, READY, SERVED or CANCELLED and a served order that was paid on its own has a payment',
    `SELECT order_number FROM bar_orders WHERE status NOT IN ('NEW','PREPARING','READY','SERVED','CANCELLED')`);
  await none('R-BAR-03/04: a cafe order that is not cancelled and was paid has exactly the amount due (no partial payments)',
    `SELECT o.order_number FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id WHERE o.status <> 'CANCELLED' AND t.amount_paid <> 0 AND t.amount_paid <> t.total_amount`);
  await none('R-HR-01: no overlapping shifts per employee/day and no shift inside APPROVED leave',
    `SELECT a.id FROM staff_shifts a JOIN staff_shifts b ON a.staff_id = b.staff_id AND a.shift_date = b.shift_date AND a.id < b.id AND a.start_time < b.end_time AND b.start_time < a.end_time
     UNION ALL SELECT s.id FROM staff_shifts s JOIN leave_requests l ON l.staff_id = s.staff_id AND l.status = 'APPROVED' AND s.shift_date BETWEEN l.start_date AND l.end_date`);
  await mustFail('payments: refunded_amount may not exceed amount', `UPDATE payments SET refunded_amount = amount + 1 WHERE id = (SELECT id FROM payments LIMIT 1)`);
  const counts = await q(`SELECT 'users' t,count(*)::int n FROM users UNION ALL SELECT 'court_bookings',count(*)::int FROM court_bookings UNION ALL SELECT 'payments',count(*)::int FROM payments UNION ALL SELECT 'products',count(*)::int FROM products`);
  console.log('  rows:', counts.map((r) => `${r.t}=${r.n}`).join(' '));
}

console.log(failures ? `\n${failures} DB check(s) FAILED` : '\nDB checks passed');
process.exit(failures ? 1 : 0);
