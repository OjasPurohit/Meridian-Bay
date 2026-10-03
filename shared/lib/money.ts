/**
 * MONEY — the ONE implementation of rounding and tax maths. Frontend and backend import these; nobody re-implements them.
 * Representation: DB/API money is a string with 2 decimals ("1250.00"). Do arithmetic in integer PAISE (1 INR = 100 paise),
 * never in floating-point rupees. Rounding is "round half up" at paise precision (Math.round on a positive paise value).
 * Rules: R-FIN-02, R-FIN-03, R-FIN-09 in docs/business-rules/BUSINESS_RULES.md.
 */

/** "1250.00" | "1250" | 1250.5 -> 125000 paise (integer). */
export function toPaise(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Math.round(n * 100);
}

/** 125000 -> "1250.00". Always 2 decimals. */
export function fromPaise(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** pct% of an amount, rounded half-up to the paisa. percentOf(150000, 15) = 22500. */
export function percentOf(paise: number, percent: number): number {
  return Math.round((paise * percent) / 100);
}

/** GST contained in a TAX-INCLUSIVE gross amount: gross x rate / (100 + rate). taxInclusive(118000, 18) = 18000. */
export function taxInclusive(grossPaise: number, ratePercent: number): number {
  return Math.round((grossPaise * ratePercent) / (100 + ratePercent));
}

/** GST to ADD on a TAX-EXCLUSIVE net amount (business invoices): net x rate / 100. */
export function taxExclusive(netPaise: number, ratePercent: number): number {
  return Math.round((netPaise * ratePercent) / 100);
}

/** Price after a plan discount (percent 0-100). Returns { discount, due } in paise. 100% => due = 0 (free). */
export function applyDiscount(listPaise: number, discountPercent: number): { discount: number; due: number } {
  const discount = percentOf(listPaise, discountPercent);
  return { discount, due: listPaise - discount };
}

/** Format for display only: "₹1,250.00" (Indian digit grouping). Never parse this back. */
export function formatInr(value: string | number): string {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
