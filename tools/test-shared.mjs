// Unit tests for shared/lib (money + IST time) — the worked examples in their comments and the rules in BUSINESS_RULES.md.
//   npm run test:shared
import assert from 'node:assert/strict';
import { toPaise, fromPaise, percentOf, taxInclusive, taxExclusive, applyDiscount, formatInr } from '../shared/lib/money.ts';
import { istDate, istToUtc, istDayBounds, isoWeekday, addDays, termEndDate, slotStarts } from '../shared/lib/time.ts';
import { ORDER_TRANSITIONS, SHOP_ORDER_TRANSITIONS, INVOICE_TRANSITIONS, LEAVE_TRANSITIONS } from '../shared/constants/rules.ts';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✔', name); };

console.log('money');
t('toPaise / fromPaise round-trip', () => { assert.equal(toPaise('1250.00'), 125000); assert.equal(fromPaise(125000), '1250.00'); assert.equal(fromPaise(toPaise('0.10') + toPaise('0.20')), '0.30'); });
t('percentOf (R-FIN-09 half-up)', () => { assert.equal(percentOf(150000, 15), 22500); assert.equal(percentOf(80000, 50), 40000); assert.equal(percentOf(99900, 10), 9990); assert.equal(percentOf(1, 50), 1); });
t('taxInclusive (court ₹800 @18% => 122.03)', () => { assert.equal(taxInclusive(118000, 18), 18000); assert.equal(fromPaise(taxInclusive(80000, 18)), '122.03'); assert.equal(fromPaise(taxInclusive(48450, 5)), '23.07'); });
t('taxExclusive (invoice ₹8000 @18% => 1440)', () => { assert.equal(taxExclusive(800000, 18), 144000); });
t('applyDiscount: Gold free, Silver 50 %, Junior 70 % on ₹800', () => {
  assert.deepEqual(applyDiscount(80000, 100), { discount: 80000, due: 0 });
  assert.deepEqual(applyDiscount(80000, 50), { discount: 40000, due: 40000 });
  assert.deepEqual(applyDiscount(80000, 70), { discount: 56000, due: 24000 });
});
t('formatInr uses Indian grouping', () => { assert.equal(formatInr('1250000.5').replace(/ /g, ' '), '₹12,50,000.50'); });

console.log('time (IST)');
t('istDate crosses midnight correctly', () => { assert.equal(istDate('2026-10-03T19:30:00.000Z'), '2026-10-04'); assert.equal(istDate('2026-10-03T18:29:59.000Z'), '2026-10-03'); });
t('istToUtc', () => { assert.equal(istToUtc('2026-10-03', '18:00'), '2026-10-03T12:30:00.000Z'); assert.equal(istToUtc('2026-10-03', '00:00'), '2026-10-02T18:30:00.000Z'); });
t('istDayBounds', () => { assert.deepEqual(istDayBounds('2026-10-03'), { start: '2026-10-02T18:30:00.000Z', end: '2026-10-03T18:30:00.000Z' }); });
t('isoWeekday: Friday = 5, Sunday = 7', () => { assert.equal(isoWeekday('2026-10-02'), 5); assert.equal(isoWeekday('2026-10-04'), 7); assert.equal(isoWeekday('2026-10-05'), 1); });
t('addDays / termEndDate (12 months - 1 day)', () => { assert.equal(addDays('2026-10-31', 1), '2026-11-01'); assert.equal(termEndDate('2026-03-15', 12), '2027-03-14'); assert.equal(termEndDate('2026-01-01', 12), '2026-12-31'); });
t('slotStarts: 06:00..22:00 => 31 half-hour starts, last 21:00 IST', () => {
  const s = slotStarts('2026-10-03', '06:00', '22:00');
  assert.equal(s.length, 31); assert.equal(s[0], '2026-10-03T00:30:00.000Z'); assert.equal(s.at(-1), '2026-10-03T15:30:00.000Z');
});

console.log('state machines');
t('kitchen: NEW -> PREPARING -> READY -> SERVED, no skipping, reject only while NEW, READY may go back to PREPARING', () => { assert.ok(!ORDER_TRANSITIONS.NEW.includes('SERVED')); assert.deepEqual(ORDER_TRANSITIONS.NEW, ['PREPARING', 'CANCELLED']); assert.deepEqual(ORDER_TRANSITIONS.PREPARING, ['READY']); assert.deepEqual(ORDER_TRANSITIONS.READY, ['PREPARING', 'SERVED']); assert.deepEqual(ORDER_TRANSITIONS.SERVED, []); assert.deepEqual(ORDER_TRANSITIONS.CANCELLED, []); });
t('shop: pickup/delivery branches both reachable from CONFIRMED', () => { assert.ok(SHOP_ORDER_TRANSITIONS.CONFIRMED.includes('READY_FOR_PICKUP') && SHOP_ORDER_TRANSITIONS.CONFIRMED.includes('OUT_FOR_DELIVERY')); });
t('invoice: only DRAFT can be sent; a SENT invoice can only be voided (paid/overdue are derived)', () => { assert.deepEqual(INVOICE_TRANSITIONS.DRAFT, ['SENT', 'VOID']); assert.deepEqual(INVOICE_TRANSITIONS.SENT, ['VOID']); assert.deepEqual(INVOICE_TRANSITIONS.VOID, []); });
t('leave: APPROVED can only be cancelled; REJECTED is terminal', () => { assert.deepEqual(LEAVE_TRANSITIONS.APPROVED, ['CANCELLED']); assert.deepEqual(LEAVE_TRANSITIONS.REJECTED, []); });

console.log(`\n${n} shared-library tests passed`);
