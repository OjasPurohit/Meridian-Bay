import { addDays } from '@shared/lib/time';
import { DAILY, expenseOf, revenueOf, sumDaily, type Daily } from './staticData';
import { DEMO_TODAY } from './types';

export type Period = 'TODAY' | 'WEEK' | 'MONTH';
export const PERIOD_DAYS: Record<Period, number> = { TODAY: 1, WEEK: 7, MONTH: 30 };
export const PERIOD_LABEL: Record<Period, string> = { TODAY: 'Today', WEEK: 'Last 7 days', MONTH: 'Last 30 days' };

export interface Totals {
  revenue: number;
  expenses: number;
  profit: number;
  court: number;
  membership: number;
  shop: number;
  bar: number;
  business: number;
  bookings: number;
  cancellations: number;
  newMembers: number;
}

export function totalsOf(rows: Daily[]): Totals {
  const revenue = sumDaily(rows, revenueOf);
  const expenses = sumDaily(rows, expenseOf);
  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    court: sumDaily(rows, (d) => d.court),
    membership: sumDaily(rows, (d) => d.membership),
    shop: sumDaily(rows, (d) => d.shop),
    bar: sumDaily(rows, (d) => d.bar),
    business: sumDaily(rows, (d) => d.business),
    bookings: sumDaily(rows, (d) => d.bookings),
    cancellations: sumDaily(rows, (d) => d.cancellations),
    newMembers: sumDaily(rows, (d) => d.newMembers),
  };
}

/** The current period and the equal-length period just before it (for ▲▼ deltas). */
export function periodTotals(p: Period) {
  const n = PERIOD_DAYS[p];
  const cur = DAILY.slice(DAILY.length - n);
  const prev = DAILY.slice(DAILY.length - 2 * n, DAILY.length - n);
  return { cur: totalsOf(cur), prev: totalsOf(prev), rows: cur };
}

export const delta = (cur: number, prev: number) => (prev === 0 ? 0 : ((cur - prev) / Math.abs(prev)) * 100);
export const trail = (f: (d: Daily) => number, n = 14) => DAILY.slice(-n).map(f);

/** Reports: rows for a date window (IST dates). */
export function rowsBetween(from: string, to: string) {
  return DAILY.filter((d) => d.date >= from && d.date <= to);
}
export const todayKey = DEMO_TODAY;
export const daysAgo = (n: number) => addDays(DEMO_TODAY, -n);

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
