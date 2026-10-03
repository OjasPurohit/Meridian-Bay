import { addDays, istDate } from '@shared/lib/time';
import { DEMO_TODAY, type BizTx } from './types';

const mon = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const dm = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export type BizGrain = 'WEEK' | 'MONTH';

export function bizBuckets(tx: BizTx[], grain: BizGrain) {
  const buckets: { label: string; from: string; to: string }[] = [];
  if (grain === 'WEEK') {
    for (let i = 11; i >= 0; i--) {
      const to = addDays(DEMO_TODAY, -i * 7);
      const from = addDays(to, -6);
      buckets.push({ label: dm.format(new Date(`${from}T00:00:00Z`)), from, to });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const to = addDays(DEMO_TODAY, -i * 30);
      buckets.push({ label: mon.format(new Date(`${to}T00:00:00Z`)), from: addDays(to, -29), to });
    }
  }
  const inB = (b: { from: string; to: string }, t: BizTx) => {
    const d = istDate(t.at);
    return d >= b.from && d <= b.to;
  };
  const sum = (b: { from: string; to: string }, f: (t: BizTx) => boolean) => tx.filter((t) => inB(b, t) && f(t)).reduce((a, t) => a + t.amount, 0);
  const revenue = buckets.map((b) => sum(b, (t) => t.type === 'SALE'));
  const purchases = buckets.map((b) => sum(b, (t) => t.type === 'PURCHASE'));
  const expenses = buckets.map((b) => sum(b, (t) => t.type === 'EXPENSE'));
  const outgo = purchases.map((p, i) => p + expenses[i]);
  return { labels: buckets.map((b) => b.label), revenue, purchases, expenses, outgo, profit: revenue.map((r, i) => r - outgo[i]), sales: buckets.map((b) => tx.filter((t) => inB(b, t) && t.type === 'SALE').length) };
}

export function bizWindow(tx: BizTx[], days: number, offset = 0) {
  const to = addDays(DEMO_TODAY, -offset);
  const from = addDays(to, -(days - 1));
  const rows = tx.filter((t) => {
    const d = istDate(t.at);
    return d >= from && d <= to;
  });
  const revenue = rows.filter((t) => t.type === 'SALE').reduce((a, t) => a + t.amount, 0);
  const outgo = rows.filter((t) => t.type !== 'SALE').reduce((a, t) => a + t.amount, 0);
  return { rows, revenue, outgo, profit: revenue - outgo, sales: rows.filter((t) => t.type === 'SALE').length, receivable: rows.filter((t) => t.type === 'SALE' && t.status === 'PENDING').reduce((a, t) => a + t.amount, 0) };
}
