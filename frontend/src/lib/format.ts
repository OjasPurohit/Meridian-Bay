import { formatInr } from '@shared/lib/money';

/** "30000.00" -> "₹30,000" (whole rupees, Indian grouping). Use formatMoney when paise matter. */
export function formatRupees(value: string | number): string {
  return formatInr(value).replace(/\.00$/, '');
}

export const formatMoney = formatInr;

const IST = 'Asia/Kolkata';

/** "06:00:00" -> "06:00". */
export function formatTimeOfDay(t: string): string {
  return t.slice(0, 5);
}

/** ISO instant -> "Fri 9 Oct" in IST. */
export function formatDayIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST }).format(new Date(iso));
}

/** ISO instant -> "18:00" in IST. */
export function formatClockIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST }).format(new Date(iso));
}
