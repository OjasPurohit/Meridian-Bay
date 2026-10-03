/**
 * TIME — the ONE implementation of IST (Asia/Kolkata, UTC+05:30, no DST) day logic.
 * Storage/API = UTC ISO strings. "Business dates" (daily play limit, reports, Friday social play, expiry) are IST dates.
 * (R-DATA-01) Never compute an IST day with the server's local timezone or with toISOString().slice(0,10) on a UTC value.
 */

const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30

/** UTC ISO instant -> IST business date "YYYY-MM-DD". istDate("2026-10-03T19:30:00.000Z") = "2026-10-04". */
export function istDate(isoUtc: string | Date): string {
  const ms = typeof isoUtc === 'string' ? Date.parse(isoUtc) : isoUtc.getTime();
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** IST date + local time -> UTC ISO instant. istToUtc("2026-10-03", "18:00") = "2026-10-03T12:30:00.000Z". */
export function istToUtc(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.parse(date + 'T00:00:00Z') + (h * 60 + m) * 60000 - IST_OFFSET_MS).toISOString();
}

/** [start, end) UTC instants of an IST calendar day — use for "all rows on this business date" queries. */
export function istDayBounds(date: string): { start: string; end: string } {
  return { start: istToUtc(date, '00:00'), end: istToUtc(date, '24:00') };
}

/** ISO weekday of an IST date: 1 = Monday ... 7 = Sunday (matches setting social_play_weekday; Friday = 5). */
export function isoWeekday(date: string): number {
  const d = new Date(Date.parse(date + 'T00:00:00Z')).getUTCDay(); // 0 = Sunday
  return d === 0 ? 7 : d;
}

/** Add whole days to an IST date string. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

/** end_date of a membership term: start + N months - 1 day (inclusive last valid day). */
export function termEndDate(startDate: string, durationMonths: number): string {
  const d = new Date(Date.parse(startDate + 'T00:00:00Z'));
  d.setUTCMonth(d.getUTCMonth() + durationMonths);
  return addDays(d.toISOString().slice(0, 10), -1);
}

/** Generate session start times for a day: every `stepMinutes` from open until (close - sessionMinutes), as UTC ISO strings. */
export function slotStarts(date: string, openHHmm: string, closeHHmm: string, stepMinutes = 30, sessionMinutes = 60): string[] {
  const out: string[] = [];
  const [oh, om] = openHHmm.split(':').map(Number);
  const [ch, cm] = closeHHmm.split(':').map(Number);
  const open = oh * 60 + om;
  const lastStart = ch * 60 + cm - sessionMinutes;
  for (let t = open; t <= lastStart; t += stepMinutes) {
    out.push(istToUtc(date, `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`));
  }
  return out;
}
