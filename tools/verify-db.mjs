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
  const c = (await db.query(`SELECT id FROM courts ORDER BY name LIMIT 1`)).rows[0].id;
  const b = (await db.query(`SELECT start_at FROM court_bookings WHERE status='CONFIRMED' AND court_id='${c}' LIMIT 1`)).rows[0];
  if (b) {
    const s = new Date(b.start_at).toISOString();
    const s30 = new Date(new Date(b.start_at).getTime() + 30 * 60000).toISOString();
    await mustFail('double-booking same slot', `INSERT INTO court_bookings (court_id,customer_type,guest_name,start_at,end_at) VALUES ('${c}','WALK_IN','X','${s}', '${new Date(new Date(s).getTime()+3600000).toISOString()}')`, "court_bookings_no_overlap");
    await mustFail('overlapping half-hour slot', `INSERT INTO court_bookings (court_id,customer_type,guest_name,start_at,end_at) VALUES ('${c}','WALK_IN','X','${s30}', '${new Date(new Date(s30).getTime()+3600000).toISOString()}')`, "court_bookings_no_overlap");
  } else bad('no CONFIRMED booking found to probe');
  await mustFail('non-30-minute slot', `INSERT INTO court_bookings (court_id,customer_type,guest_name,start_at,end_at) VALUES ('${c}','WALK_IN','X','2031-01-01T10:15:00Z','2031-01-01T11:15:00Z')`);
  await mustFail('negative stock', `UPDATE products SET stock_quantity = -1 WHERE id = (SELECT id FROM products LIMIT 1)`);
  await mustFail('second ACTIVE membership for a member', `INSERT INTO memberships (member_id,membership_plan_id,status,start_date,end_date) SELECT member_id,membership_plan_id,'ACTIVE',current_date,current_date FROM memberships WHERE status='ACTIVE' LIMIT 1`);
  // cancelled booking frees the slot
  const free = await db.query(`SELECT count(*)::int AS n FROM court_bookings WHERE status='CANCELLED'`);
  free.rows[0].n > 0 ? ok('seed contains cancelled bookings (slot re-bookable)') : bad('no cancelled booking in seed');
  // financial reconciliation probes
  const q = async (sql) => (await db.query(sql)).rows;
  const r1 = await q(`SELECT count(*)::int n FROM payments p WHERE p.source_type='SHOP_ORDER' AND NOT EXISTS (SELECT 1 FROM shop_orders o WHERE o.id=p.source_id)`);
  r1[0].n === 0 ? ok('payments → shop_orders references resolve') : bad('dangling SHOP_ORDER payments');
  const r2 = await q(`SELECT count(*)::int n FROM invoices WHERE total_amount <> subtotal + tax_amount`);
  r2[0].n === 0 ? ok('invoice totals = subtotal + tax') : bad('invoice total mismatch');
  const r3 = await q(`SELECT count(*)::int n FROM invoices i WHERE i.amount_paid <> COALESCE((SELECT sum(amount - refunded_amount) FROM payments p WHERE p.source_type='INVOICE' AND p.source_id=i.id AND p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED')),0)`);
  r3[0].n === 0 ? ok('invoices.amount_paid = sum of payments') : bad('invoice amount_paid ≠ payments');
  const r4 = await q(`SELECT count(*)::int n FROM products p WHERE p.stock_quantity <> COALESCE((SELECT sum(quantity_change) FROM inventory_movements m WHERE m.product_id=p.id),0)`);
  r4[0].n === 0 ? ok('products.stock_quantity = sum(inventory_movements)') : bad('stock ≠ ledger');
  const r5 = await q(`SELECT count(*)::int n FROM shop_orders o WHERE o.total_amount <> o.subtotal - o.discount_amount + o.delivery_fee`);
  r5[0].n === 0 ? ok('shop order totals consistent') : bad('shop order total mismatch');
  const r6 = await q(`SELECT count(*)::int n FROM bar_orders o WHERE o.total_amount <> o.subtotal - o.discount_amount`);
  r6[0].n === 0 ? ok('bar order totals consistent') : bad('bar order total mismatch');
  const r7 = await q(`SELECT count(*)::int n FROM (SELECT o.id FROM shop_orders o JOIN shop_order_items i ON i.shop_order_id=o.id GROUP BY o.id, o.subtotal HAVING sum(i.line_total) <> o.subtotal) x`);
  r7[0].n === 0 ? ok('shop subtotal = sum(items)') : bad('shop subtotal ≠ items');
  const r8 = await q(`SELECT count(*)::int n FROM (SELECT o.id FROM bar_orders o JOIN bar_order_items i ON i.bar_order_id=o.id GROUP BY o.id, o.subtotal HAVING sum(i.line_total) <> o.subtotal) x`);
  r8[0].n === 0 ? ok('bar subtotal = sum(items)') : bad('bar subtotal ≠ items');
  const r9 = await q(`SELECT count(*)::int n FROM social_sessions s WHERE (SELECT count(*) FROM social_session_participants p WHERE p.social_session_id=s.id AND p.status='JOINED') > s.capacity`);
  r9[0].n === 0 ? ok('no social session over capacity') : bad('social session over capacity');
  // ---- business-rule probes on the seed (these use the SAME reference SQL as docs/business-rules/BUSINESS_RULES.md)
  const none = async (label, sql) => { const r = await q(sql); r.length === 0 ? ok(label) : bad(`${label} — ${r.length} violation(s): ${JSON.stringify(r.slice(0, 3))}`); };
  await none('R-COURT-01: every booking starts within club hours (06:00–21:00 IST) on :00/:30',
    `SELECT booking_number FROM court_bookings WHERE (start_at AT TIME ZONE 'Asia/Kolkata')::time NOT BETWEEN '06:00' AND '21:00'`);
  await none('R-SOC-01: every social session is on a Friday (IST) within 18:00–22:00',
    `SELECT s.title FROM social_sessions s JOIN court_bookings b ON b.id = s.court_booking_id
     WHERE extract(isodow FROM b.start_at AT TIME ZONE 'Asia/Kolkata') <> 5 OR (b.start_at AT TIME ZONE 'Asia/Kolkata')::time NOT BETWEEN '18:00' AND '21:00'`);
  await none('R-COURT-04: no member exceeds max_plays_per_day on any IST day (reference query)',
    `WITH plays AS (
       SELECT b.member_id, (b.start_at AT TIME ZONE 'Asia/Kolkata')::date AS d FROM court_bookings b
         WHERE b.member_id IS NOT NULL AND b.booking_type = 'REGULAR' AND b.status <> 'CANCELLED'
       UNION ALL
       SELECT p.member_id, (sb.start_at AT TIME ZONE 'Asia/Kolkata')::date FROM social_session_participants p
         JOIN social_sessions s ON s.id = p.social_session_id JOIN court_bookings sb ON sb.id = s.court_booking_id
         WHERE p.member_id IS NOT NULL AND p.status = 'JOINED' AND s.status <> 'CANCELLED')
     SELECT member_id, d, count(*) FROM plays GROUP BY 1, 2 HAVING count(*) > 2`);
  const demoLimit = await q(`SELECT count(*)::int n FROM (SELECT member_id, (start_at AT TIME ZONE 'Asia/Kolkata')::date d FROM court_bookings WHERE booking_type='REGULAR' AND status<>'CANCELLED' AND member_id IS NOT NULL GROUP BY 1,2 HAVING count(*) = 2) x`);
  demoLimit[0].n > 0 ? ok(`seed contains ${demoLimit[0].n} member-day(s) at exactly the limit (demo of DAILY_BOOKING_LIMIT)`) : bad('no member-day at the daily limit for the demo');
  await none('R-COURT-05: member booking price = list − percentOf(list, plan.court_discount_percent) using the booking\'s own membership snapshot',
    `SELECT b.booking_number FROM court_bookings b LEFT JOIN memberships m ON m.id = b.membership_id LEFT JOIN membership_plans p ON p.id = m.membership_plan_id
     WHERE b.booking_type = 'REGULAR' AND b.discount_amount <> round(b.list_price * coalesce(p.court_discount_percent, 0) / 100, 2)
        OR b.booking_type = 'REGULAR' AND b.amount_due <> b.list_price - b.discount_amount`);
  await none('R-MEM-04: the membership snapshot on each booking/order was effective on that date and belongs to the same member',
    `SELECT b.booking_number FROM court_bookings b JOIN memberships m ON m.id = b.membership_id
       WHERE m.member_id <> b.member_id OR (b.start_at AT TIME ZONE 'Asia/Kolkata')::date NOT BETWEEN m.start_date AND m.end_date
     UNION ALL SELECT o.order_number FROM shop_orders o JOIN memberships m ON m.id = o.membership_id
       WHERE m.member_id <> o.member_id OR (o.created_at AT TIME ZONE 'Asia/Kolkata')::date NOT BETWEEN m.start_date AND m.end_date
     UNION ALL SELECT o.order_number FROM bar_orders o JOIN memberships m ON m.id = o.membership_id
       WHERE m.member_id <> o.member_id OR (o.created_at AT TIME ZONE 'Asia/Kolkata')::date NOT BETWEEN m.start_date AND m.end_date`);
  await none('R-MEM-03: ACTIVE/EXPIRED terms last exactly duration_months (end = start + months − 1 day)',
    `SELECT m.id FROM memberships m JOIN membership_plans p ON p.id = m.membership_plan_id
     WHERE m.status IN ('ACTIVE','EXPIRED') AND m.end_date <> (m.start_date + (p.duration_months || ' months')::interval - interval '1 day')::date`);
  await none('R-FIN-02: payment.tax_amount = round(amount × rate ÷ (100+rate)) for tax-inclusive sources (court 18, membership 18, shop 18, bar 5)',
    `SELECT payment_number FROM payments WHERE source_type <> 'INVOICE'
       AND tax_amount <> round(amount * (CASE revenue_category WHEN 'BAR' THEN 5 ELSE 18 END) / (100 + (CASE revenue_category WHEN 'BAR' THEN 5 ELSE 18 END)), 2)`);
  await none('R-FIN-05: invoice payment tax = amount × invoice.tax_amount ÷ invoice.total_amount',
    `SELECT p.payment_number FROM payments p JOIN invoices i ON i.id = p.source_id WHERE p.source_type = 'INVOICE'
       AND abs(p.tax_amount - round(p.amount * i.tax_amount / i.total_amount, 2)) > 0.01`);
  await none('R-FIN-06: refunded payments carry a reason, a timestamp and refunded_amount ≤ amount',
    `SELECT payment_number FROM payments WHERE (refunded_amount > 0 AND (refund_reason IS NULL OR refunded_at IS NULL)) OR (status = 'REFUNDED' AND refunded_amount <> amount)`);
  await none('R-BAR-04: SETTLED tabs equal the sum of their non-cancelled orders; those orders are PAID; each has exactly one TAB payment',
    `SELECT t.tab_number FROM bar_tabs t WHERE t.status = 'SETTLED' AND (
        t.total_amount <> (SELECT coalesce(sum(total_amount), 0) FROM bar_orders o WHERE o.bar_tab_id = t.id AND o.status <> 'CANCELLED')
        OR EXISTS (SELECT 1 FROM bar_orders o WHERE o.bar_tab_id = t.id AND o.status <> 'CANCELLED' AND o.payment_status <> 'PAID')
        OR (SELECT count(*) FROM payments p WHERE p.source_type = 'TAB' AND p.source_id = t.id) <> 1
        OR (SELECT amount FROM payments p WHERE p.source_type = 'TAB' AND p.source_id = t.id) <> t.total_amount)`);
  await none('R-BAR-04: OPEN tabs have no payment and only PENDING orders',
    `SELECT t.tab_number FROM bar_tabs t WHERE t.status = 'OPEN' AND (EXISTS (SELECT 1 FROM payments p WHERE p.source_type = 'TAB' AND p.source_id = t.id)
        OR EXISTS (SELECT 1 FROM bar_orders o WHERE o.bar_tab_id = t.id AND o.payment_status <> 'PENDING'))`);
  await none('R-BAR-07: order_status_events form the legal chain NEW → … ending at the order\'s current status',
    `SELECT o.order_number FROM bar_orders o WHERE (SELECT to_status FROM order_status_events e WHERE e.bar_order_id = o.id ORDER BY created_at DESC, id LIMIT 1) <> o.status`);
  await none('R-BAR-06: a table is OCCUPIED iff it has an OPEN tab or an active (NEW..READY) order',
    `SELECT t.label FROM bar_tables t WHERE t.status <> 'OUT_OF_SERVICE' AND (t.status = 'OCCUPIED') <> (
        EXISTS (SELECT 1 FROM bar_tabs b WHERE b.bar_table_id = t.id AND b.status = 'OPEN')
        OR EXISTS (SELECT 1 FROM bar_orders o WHERE o.bar_table_id = t.id AND o.status IN ('NEW','ACCEPTED','PREPARING','READY')))`);
  await none('R-SHOP-07: PICKUP orders never OUT_FOR_DELIVERY, DELIVERY orders never READY_FOR_PICKUP; cancelled orders restored stock',
    `SELECT order_number FROM shop_orders WHERE (fulfillment = 'PICKUP' AND status = 'OUT_FOR_DELIVERY') OR (fulfillment = 'DELIVERY' AND status = 'READY_FOR_PICKUP')
     UNION ALL SELECT o.order_number FROM shop_orders o WHERE o.status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.shop_order_id = o.id AND m.reason = 'CANCELLATION')`);
  await none('R-SHOP-03: seed has low-stock and out-of-stock products for the demo',
    `SELECT 1 WHERE (SELECT count(*) FROM products WHERE stock_quantity = 0) = 0 OR (SELECT count(*) FROM products WHERE stock_quantity > 0 AND stock_quantity <= low_stock_threshold) = 0`);
  await none('R-ENQ-04: CONVERTED enquiries reference a member; others do not',
    `SELECT id FROM enquiries WHERE (status = 'CONVERTED') <> (converted_member_id IS NOT NULL)`);
  await none('R-HR-01: no overlapping shifts per employee/day and no shift inside APPROVED leave',
    `SELECT a.id FROM staff_shifts a JOIN staff_shifts b ON a.staff_id = b.staff_id AND a.shift_date = b.shift_date AND a.id < b.id AND a.start_time < b.end_time AND b.start_time < a.end_time
     UNION ALL SELECT s.id FROM staff_shifts s JOIN leave_requests l ON l.staff_id = s.staff_id AND l.status = 'APPROVED' AND s.shift_date BETWEEN l.start_date AND l.end_date`);
  const counts = await q(`SELECT 'users' t,count(*)::int n FROM users UNION ALL SELECT 'court_bookings',count(*)::int FROM court_bookings UNION ALL SELECT 'payments',count(*)::int FROM payments UNION ALL SELECT 'products',count(*)::int FROM products`);
  console.log('  rows:', counts.map((r) => `${r.t}=${r.n}`).join(' '));
}

console.log(failures ? `\n${failures} DB check(s) FAILED` : '\nDB checks passed');
process.exit(failures ? 1 : 0);
