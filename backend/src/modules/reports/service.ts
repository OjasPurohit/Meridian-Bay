/**
 * Reports (OWNER_ADMIN). Read-only aggregation over the ledger and the derived views. Rules: R-FIN-07 (revenue =
 * sum of amount - refunded_amount by IST date of paid_at; tax pro-rated for partial refunds), R-FIN-08 (outstanding).
 * Money leaves SQL as numeric(12,2) strings.
 */
import type {
  AmountByKey, BarDailySummary, CourtUtilizationReport, DateRange, FinanceReport, MembershipReport, OwnerDashboard, RevenueReport, ShopReport, TaxOverview, TaxReport,
} from '@shared/types/api';
import type { TaxInput } from '@shared/types/rows';
import type { ReportPeriod, ReportGroupBy, ExportReport } from '@shared/constants/enums';
import { addDays, istDate } from '@shared/lib/time';
import { query } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { toCsv } from '../../kernel/http';
import * as members from '../members/repo';

const IST = `'Asia/Kolkata'`;
const PAID_DATE = `(p.paid_at AT TIME ZONE ${IST})::date`;
const NET = '(p.amount - p.refunded_amount)';
const NET_TAX = '(CASE WHEN p.amount = 0 THEN 0 ELSE p.tax_amount * (p.amount - p.refunded_amount) / p.amount END)';
const m2 = (expr: string) => `coalesce(${expr}, 0)::numeric(12,2)::text`;
const todayIst = () => istDate(new Date().toISOString());

const rows = async <R extends object>(sql: string, params: unknown[] = []) => (await query<R>(sql, params)).rows;

async function byCategory(r: DateRange): Promise<AmountByKey[]> {
  return rows<AmountByKey>(
    `SELECT l.revenue_category AS key, l.revenue_category AS label, ${m2(`sum(${NET})`)} AS amount, count(*)::int AS count
       FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE ${PAID_DATE} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`,
    [r.from, r.to],
  );
}
async function byMethod(r: DateRange): Promise<AmountByKey[]> {
  return rows<AmountByKey>(
    `SELECT p.method AS key, p.method AS label, ${m2(`sum(${NET})`)} AS amount, count(*)::int AS count
       FROM payments p WHERE ${PAID_DATE} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`,
    [r.from, r.to],
  );
}
const one = async <T>(sql: string, params: unknown[] = []) => (await rows<Record<string, T>>(sql, params))[0]!;

export function rangeOfPeriod(period: ReportPeriod): DateRange {
  const to = todayIst();
  if (period === 'TODAY') return { from: to, to };
  if (period === 'MONTH') return { from: `${to.slice(0, 8)}01`, to };
  const dow = new Date(`${to}T12:00:00Z`).getUTCDay() || 7; // Monday = 1
  return { from: addDays(to, 1 - dow), to };
}

export function checkRange(r: DateRange): void {
  const days = (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000;
  if (days < 0 || days > 365) throw new AppError('VALIDATION_ERROR', { fields: { to: 'Must be on or after from, at most 366 days.' } });
}

const TAX_INPUT_COLS = `id, input_date::text AS input_date, supplier, reference, taxable_amount, tax_amount, is_eligible, notes, created_by_user_id, created_at, updated_at`;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthRange = (period: string): DateRange => {
  if (!PERIOD_RE.test(period)) throw new AppError('VALIDATION_ERROR', { fields: { period: 'Must be a month like 2026-10.' } });
  const last = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
};

export const ReportsService = {
  async dashboard(period: ReportPeriod): Promise<OwnerDashboard> {
    const range = rangeOfPeriod(period);
    const [cat, method] = await Promise.all([byCategory(range), byMethod(range)]);
    const total = (await one<string>(`SELECT ${m2(`sum(${NET})`)} AS v FROM payments p WHERE ${PAID_DATE} BETWEEN $1 AND $2`, [range.from, range.to])).v!;
    const refunds = (await one<string>(`SELECT ${m2('sum(p.refunded_amount)')} AS v FROM payments p WHERE ${PAID_DATE} BETWEEN $1 AND $2`, [range.from, range.to])).v!;
    const activeByType = await rows<AmountByKey>(
      `SELECT s.membership_type AS key, s.membership_type AS label, '0.00' AS amount, count(*)::int AS count
         FROM member_membership_status s WHERE s.membership_status = 'ACTIVE' GROUP BY 1 ORDER BY 1`,
    );
    const newMemberships = (await one<number>(`SELECT count(*)::int AS v FROM memberships WHERE (created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2`, [range.from, range.to])).v!;
    const expiring = (await one<number>(`SELECT count(*)::int AS v FROM membership_terms WHERE status = 'ACTIVE' AND end_date <= (now() AT TIME ZONE ${IST})::date + 30`)).v!;
    const courts = await one<string | number>(
      `SELECT count(*) FILTER (WHERE b.cancelled_at IS NULL)::int AS bookings, count(*) FILTER (WHERE b.cancelled_at IS NOT NULL)::int AS cancels,
              coalesce(sum(extract(epoch FROM (b.end_at - b.start_at)) / 3600) FILTER (WHERE b.cancelled_at IS NULL AND b.booking_type = 'REGULAR'), 0)::float AS hours
         FROM court_bookings b WHERE (b.start_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2`,
      [range.from, range.to],
    );
    const courtCount = (await one<number>('SELECT count(*)::int AS v FROM courts WHERE is_active')).v!;
    const open = (await one<string>(`SELECT ${m2('sum(p.amount - p.refunded_amount)')} AS v FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE l.revenue_category = 'COURT' AND ${PAID_DATE} BETWEEN $1 AND $2`, [range.from, range.to])).v!;
    const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
    const capacity = courtCount * 16 * days; // 06:00-22:00 -> 16 court-hours a day
    const shop = await one<string | number>(
      `SELECT count(*) FILTER (WHERE o.status <> 'CANCELLED')::int AS orders, ${m2("sum(t.total_amount) FILTER (WHERE o.status <> 'CANCELLED')")} AS sales
         FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id WHERE (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2`,
      [range.from, range.to],
    );
    const low = (await one<number>('SELECT count(*)::int AS v FROM products WHERE is_active AND stock_quantity <= low_stock_threshold')).v!;
    const bar = await one<string | number>(
      `SELECT count(*) FILTER (WHERE o.status <> 'CANCELLED')::int AS orders, ${m2("sum(t.total_amount) FILTER (WHERE o.status <> 'CANCELLED')")} AS sales
         FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id WHERE (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2`,
      [range.from, range.to],
    );
    const unhandled = (await one<number>('SELECT count(*)::int AS v FROM enquiries WHERE handled_at IS NULL')).v!;
    const outstanding = (await one<string>(`SELECT ${m2('sum(total_amount - amount_paid)')} AS v FROM invoice_totals WHERE payment_state IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')`)).v!;
    const payrollPending = (await one<string>(`SELECT ${m2('sum(amount)')} AS v FROM payroll_payments WHERE paid_on IS NULL`)).v!;
    const tax = (await one<string>(`SELECT ${m2(`sum(${NET_TAX})`)} AS v FROM payments p WHERE ${PAID_DATE} BETWEEN $1 AND $2`, [range.from, range.to])).v!;
    const leave = (await one<number>(`SELECT count(*)::int AS v FROM leave_requests WHERE status = 'PENDING'`)).v!;
    const hours = Number(courts.hours);
    return {
      period,
      range,
      revenue: { total, refunds, by_category: cat, by_method: method },
      memberships: { active_total: activeByType.reduce((n, x) => n + x.count, 0), by_type: activeByType, new_in_period: newMemberships, expiring_soon: expiring },
      courts: { bookings_count: Number(courts.bookings), utilization_percent: (capacity ? Math.min(100, (hours / capacity) * 100) : 0).toFixed(2), cancellations_count: Number(courts.cancels), revenue: open },
      shop: { orders_count: Number(shop.orders), sales_amount: String(shop.sales), low_stock_count: low },
      bar: { orders_count: Number(bar.orders), sales_amount: String(bar.sales) },
      enquiries: { unhandled_count: unhandled },
      finance: { outstanding_invoices_amount: outstanding, payroll_pending_amount: payrollPending, tax_collected: tax },
      staff: { pending_leave_requests: leave },
    };
  },

  async revenue(r: DateRange, group_by: ReportGroupBy): Promise<RevenueReport> {
    checkRange(r);
    const key = group_by === 'DAY' ? `${PAID_DATE}::text` : group_by === 'METHOD' ? 'p.method::text' : 'l.revenue_category::text';
    const data = await rows<RevenueReport['rows'][number]>(
      `SELECT ${key} AS key, ${key} AS label, ${m2(`sum(${NET})`)} AS amount, count(*)::int AS count, ${m2(`sum(${NET_TAX})`)} AS tax_amount
         FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE ${PAID_DATE} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY ${group_by === 'DAY' ? '1' : '3 DESC'}`,
      [r.from, r.to],
    );
    const total = data.reduce((n, x) => n + Math.round(Number(x.amount) * 100), 0);
    const tax = data.reduce((n, x) => n + Math.round(Number(x.tax_amount) * 100), 0);
    return { range: r, group_by, rows: data, total: (total / 100).toFixed(2), total_tax: (tax / 100).toFixed(2) };
  },

  async courts(r: DateRange): Promise<CourtUtilizationReport> {
    checkRange(r);
    const days = (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 + 1;
    const data = await rows<{ court_id: string; court_name: string; booked: number; cancels: number; revenue: string }>(
      `SELECT c.id AS court_id, c.name AS court_name,
              coalesce(sum(extract(epoch FROM (b.end_at - b.start_at)) / 3600) FILTER (WHERE b.cancelled_at IS NULL), 0)::float AS booked,
              count(b.id) FILTER (WHERE b.cancelled_at IS NOT NULL)::int AS cancels,
              ${m2(`(SELECT sum(${NET}) FROM payments p JOIN court_bookings cb ON cb.id = p.source_id WHERE p.source_type = 'COURT_BOOKING' AND cb.court_id = c.id AND ${PAID_DATE} BETWEEN $1 AND $2)`)} AS revenue
         FROM courts c LEFT JOIN court_bookings b ON b.court_id = c.id AND (b.start_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2
        WHERE c.is_active GROUP BY c.id, c.name, c.sort_order ORDER BY c.sort_order`,
      [r.from, r.to],
    );
    const available = 16 * days;
    return {
      range: r,
      rows: data.map((x) => ({ court_id: x.court_id, court_name: x.court_name, booked_hours: Number(Number(x.booked).toFixed(2)), available_hours: available, utilization_percent: Math.min(100, (Number(x.booked) / available) * 100).toFixed(2), revenue: x.revenue, cancellations_count: x.cancels })),
    };
  },

  async memberships(r: DateRange): Promise<MembershipReport> {
    checkRange(r);
    const active = await rows<AmountByKey>(`SELECT membership_type AS key, membership_type AS label, '0.00' AS amount, count(*)::int AS count FROM member_membership_status WHERE membership_status = 'ACTIVE' GROUP BY 1 ORDER BY 1`);
    const newMembers = (await one<number>(`SELECT count(*)::int AS v FROM members WHERE joined_on BETWEEN $1 AND $2`, [r.from, r.to])).v!;
    const renewals = (await one<number>(
      `SELECT count(*)::int AS v FROM memberships m WHERE (m.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2 AND EXISTS (SELECT 1 FROM memberships o WHERE o.member_id = m.member_id AND o.created_at < m.created_at)`,
      [r.from, r.to],
    )).v!;
    const revenue = (await one<string>(`SELECT ${m2(`sum(${NET})`)} AS v FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE l.revenue_category = 'MEMBERSHIP' AND ${PAID_DATE} BETWEEN $1 AND $2`, [r.from, r.to])).v!;
    const exp = await members.listExpiring(members.pool, 30);
    const expiring = (await Promise.all(exp.map((m) => members.summaryById(members.pool, m.member_id)))).filter((x) => x !== null);
    return { range: r, active_by_type: active, new_members: newMembers, renewals, membership_revenue: revenue, expiring };
  },

  async shop(r: DateRange): Promise<ShopReport> {
    checkRange(r);
    const t = await one<string | number>(
      `SELECT count(*) FILTER (WHERE o.status <> 'CANCELLED')::int AS orders, ${m2("sum(t.total_amount) FILTER (WHERE o.status <> 'CANCELLED')")} AS sales
         FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id WHERE (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2`,
      [r.from, r.to],
    );
    const byF = await rows<AmountByKey>(
      `SELECT o.fulfillment AS key, o.fulfillment AS label, ${m2('sum(t.total_amount)')} AS amount, count(*)::int AS count
         FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id WHERE o.status <> 'CANCELLED' AND (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`,
      [r.from, r.to],
    );
    const top = await rows<ShopReport['top_products'][number]>(
      `SELECT i.product_id, i.product_name AS name, sum(i.quantity)::int AS quantity, ${m2('sum(i.unit_price * i.quantity)')} AS amount
         FROM shop_order_items i JOIN shop_orders o ON o.id = i.shop_order_id WHERE o.status <> 'CANCELLED' AND (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2
        GROUP BY i.product_id, i.product_name ORDER BY 4 DESC LIMIT 10`,
      [r.from, r.to],
    );
    const low = await rows<ShopReport['low_stock'][number]>(
      `SELECT id AS product_id, sku, name, category, stock_quantity, low_stock_threshold,
              (CASE WHEN stock_quantity = 0 THEN 'OUT_OF_STOCK' WHEN stock_quantity <= low_stock_threshold THEN 'LOW_STOCK' ELSE 'IN_STOCK' END) AS stock_status, is_active
         FROM products WHERE is_active AND stock_quantity <= low_stock_threshold ORDER BY stock_quantity, name`,
    );
    return { range: r, sales_amount: String(t.sales), orders_count: Number(t.orders), by_fulfillment: byF, top_products: top, low_stock: low };
  },

  async bar(r: DateRange): Promise<BarDailySummary[]> {
    checkRange(r);
    const days = await rows<{ date: string; order_count: number; served_count: number; cancelled_count: number; discount_total: string }>(
      `SELECT d::date::text AS date,
              count(o.id) FILTER (WHERE o.status <> 'CANCELLED')::int AS order_count,
              count(o.id) FILTER (WHERE o.status = 'SERVED')::int AS served_count,
              count(o.id) FILTER (WHERE o.status = 'CANCELLED')::int AS cancelled_count,
              ${m2("sum(o.discount_amount) FILTER (WHERE o.status <> 'CANCELLED')")} AS discount_total
         FROM generate_series($1::date, $2::date, interval '1 day') d
         LEFT JOIN bar_orders o ON (o.created_at AT TIME ZONE ${IST})::date = d::date GROUP BY d ORDER BY d`,
      [r.from, r.to],
    );
    const pay = await rows<{ date: string; method: string; amount: string; count: number; tax: string }>(
      `SELECT ${PAID_DATE}::text AS date, p.method, ${m2(`sum(${NET})`)} AS amount, count(*)::int AS count, ${m2(`sum(${NET_TAX})`)} AS tax
         FROM payments p WHERE p.source_type = 'BAR_ORDER' AND ${PAID_DATE} BETWEEN $1 AND $2 GROUP BY 1, 2`,
      [r.from, r.to],
    );
    const shifts = await rows<{ date: string; staff_id: string; full_name: string; start_time: string; end_time: string }>(
      `SELECT h.shift_date::text AS date, h.staff_id, u.full_name, h.start_time, h.end_time FROM staff_shifts h JOIN staff s ON s.id = h.staff_id JOIN users u ON u.id = s.user_id
        WHERE h.area = 'BAR' AND h.shift_date BETWEEN $1 AND $2 ORDER BY h.start_time`,
      [r.from, r.to],
    );
    return days.map((d) => {
      const p = pay.filter((x) => x.date === d.date);
      return {
        date: d.date,
        order_count: d.order_count,
        served_count: d.served_count,
        cancelled_count: d.cancelled_count,
        gross_revenue: (p.reduce((n, x) => n + Math.round(Number(x.amount) * 100), 0) / 100).toFixed(2),
        discount_total: d.discount_total,
        tax_total: (p.reduce((n, x) => n + Math.round(Number(x.tax) * 100), 0) / 100).toFixed(2),
        by_method: p.map((x) => ({ method: x.method as BarDailySummary['by_method'][number]['method'], amount: x.amount, count: x.count })),
        shifts: shifts.filter((s) => s.date === d.date).map(({ staff_id, full_name, start_time, end_time }) => ({ staff_id, full_name, start_time, end_time })),
      };
    });
  },

  async finance(r: DateRange): Promise<FinanceReport> {
    checkRange(r);
    const [cat, method] = await Promise.all([byCategory(r), byMethod(r)]);
    const rev = await one<string>(`SELECT ${m2(`sum(${NET})`)} AS revenue, ${m2('sum(p.refunded_amount)')} AS refunds, ${m2(`sum(${NET_TAX})`)} AS tax FROM payments p WHERE ${PAID_DATE} BETWEEN $1 AND $2`, [r.from, r.to]);
    const inv = await one<string | number>(
      `SELECT ${m2("sum(total_amount - amount_paid) FILTER (WHERE payment_state IN ('UNPAID','PARTIALLY_PAID','OVERDUE'))")} AS out_amt,
              count(*) FILTER (WHERE payment_state IN ('UNPAID','PARTIALLY_PAID','OVERDUE'))::int AS out_n,
              ${m2("sum(total_amount - amount_paid) FILTER (WHERE payment_state = 'OVERDUE')")} AS over_amt,
              count(*) FILTER (WHERE payment_state = 'OVERDUE')::int AS over_n FROM invoice_totals`,
    );
    const pay = await one<string>(`SELECT ${m2('sum(amount) FILTER (WHERE paid_on IS NOT NULL AND paid_on BETWEEN $1 AND $2)')} AS paid, ${m2('sum(amount) FILTER (WHERE paid_on IS NULL)')} AS pending FROM payroll_payments`, [r.from, r.to]);
    return {
      range: r,
      revenue_total: String(rev.revenue),
      refunds_total: String(rev.refunds),
      by_category: cat,
      by_method: method,
      invoices: { outstanding_amount: String(inv.out_amt), outstanding_count: Number(inv.out_n), overdue_amount: String(inv.over_amt), overdue_count: Number(inv.over_n) },
      payroll: { paid_amount: String(pay.paid), pending_amount: String(pay.pending) },
      tax_collected: String(rev.tax),
    };
  },

  async tax(r: DateRange): Promise<TaxReport> {
    checkRange(r);
    const data = await rows<{ revenue_category: string; gross: string; tax: string }>(
      `SELECT l.revenue_category, ${m2(`sum(${NET})`)} AS gross, ${m2(`sum(${NET_TAX})`)} AS tax
         FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE ${PAID_DATE} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
      [r.from, r.to],
    );
    const out = data.map((x) => {
      const gross = Math.round(Number(x.gross) * 100);
      const tax = Math.round(Number(x.tax) * 100);
      const taxable = gross - tax;
      return { revenue_category: x.revenue_category as TaxReport['rows'][number]['revenue_category'], gross_amount: x.gross, taxable_amount: (taxable / 100).toFixed(2), tax_rate: (taxable ? (tax / taxable) * 100 : 0).toFixed(2), tax_amount: x.tax };
    });
    return { range: r, rows: out, total_tax: (out.reduce((n, x) => n + Math.round(Number(x.tax_amount) * 100), 0) / 100).toFixed(2) };
  },

  /**
   * Internal "Taxes to report" overview of one IST calendar month. Taxable revenue and tax collected are exactly the
   * `tax()` figures (one revenue calculation, so Reports and this card always agree); input tax credit comes only from the
   * owner's recorded `tax_inputs`; nothing is fabricated and nothing is filed anywhere.
   */
  async taxOverview(period: string): Promise<TaxOverview> {
    const range = monthRange(period);
    const t = await ReportsService.tax(range);
    const paise = (v: string) => Math.round(Number(v) * 100);
    const money = (n: number) => (n / 100).toFixed(2);
    const inputs = await rows<TaxInput>(`SELECT ${TAX_INPUT_COLS} FROM tax_inputs WHERE input_date BETWEEN $1 AND $2 ORDER BY input_date DESC, created_at DESC`, [range.from, range.to]);
    const collected = paise(t.total_tax);
    const taxable = t.rows.reduce((n, x) => n + paise(x.taxable_amount), 0);
    const credit = inputs.filter((i) => i.is_eligible).reduce((n, i) => n + paise(i.tax_amount), 0);
    const reported = await rows<{ reported_at: string }>('SELECT reported_at FROM tax_periods WHERE period = $1::date', [range.from]);
    const ended = todayIst() > range.to;
    return {
      period, from: range.from, to: range.to,
      taxable_revenue: money(taxable), tax_collected: money(collected), input_tax_credit: money(credit),
      estimated_payable: money(Math.max(0, collected - credit)), credit_balance: money(Math.max(0, credit - collected)),
      status: reported.length ? 'REPORTED' : ended ? 'READY_TO_REPORT' : 'NOT_READY',
      period_ended: ended, reported_at: reported[0]?.reported_at ?? null, by_category: t.rows, inputs,
    };
  },

  async taxInputCreate(user_id: string, b: { input_date: string; supplier: string; reference?: string; taxable_amount: string; tax_amount: string; is_eligible?: boolean; notes?: string }): Promise<TaxInput> {
    const r = await rows<TaxInput>(
      `INSERT INTO tax_inputs (input_date, supplier, reference, taxable_amount, tax_amount, is_eligible, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${TAX_INPUT_COLS}`,
      [b.input_date, b.supplier, b.reference ?? null, b.taxable_amount, b.tax_amount, b.is_eligible ?? true, b.notes ?? null, user_id],
    );
    return r[0]!;
  },

  async taxInputDelete(id: string): Promise<void> {
    const r = await query('DELETE FROM tax_inputs WHERE id = $1', [id]);
    if (!r.rowCount) throw new AppError('NOT_FOUND');
  },

  /** Internal tracking flag only: a month can be marked once it has ended. */
  async taxPeriodReport(user_id: string, period: string): Promise<TaxOverview> {
    const range = monthRange(period);
    if (todayIst() <= range.to) throw new AppError('VALIDATION_ERROR', { fields: { period: 'This month has not ended yet.' } });
    await query('INSERT INTO tax_periods (period, reported_by_user_id) VALUES ($1::date, $2) ON CONFLICT (period) DO NOTHING', [range.from, user_id]);
    return ReportsService.taxOverview(period);
  },

  async taxPeriodReopen(period: string): Promise<TaxOverview> {
    const range = monthRange(period);
    await query('DELETE FROM tax_periods WHERE period = $1::date', [range.from]);
    return ReportsService.taxOverview(period);
  },

  /** CSV (RFC 4180, money as strings). */
  async export(report: ExportReport, r: DateRange): Promise<{ filename: string; content: string }> {
    checkRange(r);
    const filename = `${report.toLowerCase()}_${r.from}_${r.to}.csv`;
    const table = async (cols: string[], sql: string, params: unknown[]) => {
      const data = await rows<Record<string, string | number | null>>(sql, params);
      return toCsv(cols, data.map((d) => cols.map((c) => d[c] ?? null)));
    };
    switch (report) {
      case 'REVENUE':
        return { filename, content: await table(['payment_number', 'paid_on', 'revenue_category', 'method', 'amount', 'refunded_amount', 'tax_amount'],
          `SELECT p.payment_number, ${PAID_DATE}::text AS paid_on, l.revenue_category, p.method, p.amount::text AS amount, p.refunded_amount::text AS refunded_amount, p.tax_amount::text AS tax_amount
             FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE ${PAID_DATE} BETWEEN $1 AND $2 ORDER BY p.paid_at`, [r.from, r.to]) };
      case 'MEMBERS':
        return { filename, content: await table(['member_code', 'full_name', 'email', 'phone', 'joined_on', 'plan', 'membership_status', 'end_date'],
          `SELECT m.member_code, u.full_name, u.email, u.phone, m.joined_on::text AS joined_on, pl.name AS plan, s.membership_status::text AS membership_status, s.end_date::text AS end_date
             FROM members m JOIN users u ON u.id = m.user_id LEFT JOIN member_membership_status s ON s.member_id = m.id LEFT JOIN membership_plans pl ON pl.id = s.membership_plan_id
            WHERE m.joined_on BETWEEN $1 AND $2 ORDER BY m.joined_on`, [r.from, r.to]) };
      case 'BOOKINGS':
        return { filename, content: await table(['booking_number', 'court', 'start_at', 'end_at', 'status', 'customer', 'amount_due', 'payment_status'],
          `SELECT b.booking_number, c.name AS court, b.start_at::text AS start_at, b.end_at::text AS end_at, t.status::text AS status, coalesce(u.full_name, b.guest_name, '') AS customer, t.amount_due::text AS amount_due, t.payment_status::text AS payment_status
             FROM court_bookings b JOIN courts c ON c.id = b.court_id JOIN court_booking_totals t ON t.court_booking_id = b.id LEFT JOIN members m ON m.id = b.member_id LEFT JOIN users u ON u.id = m.user_id
            WHERE (b.start_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2 ORDER BY b.start_at`, [r.from, r.to]) };
      case 'SHOP_SALES':
        return { filename, content: await table(['order_number', 'created_on', 'fulfillment', 'status', 'total_amount', 'payment_status'],
          `SELECT o.order_number, (o.created_at AT TIME ZONE ${IST})::date::text AS created_on, o.fulfillment, o.status, t.total_amount::text AS total_amount, t.payment_status::text AS payment_status
             FROM shop_orders o JOIN shop_order_totals t ON t.shop_order_id = o.id WHERE (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2 ORDER BY o.created_at`, [r.from, r.to]) };
      case 'BAR_SALES':
        return { filename, content: await table(['order_number', 'created_on', 'table_label', 'status', 'total_amount', 'payment_status'],
          `SELECT o.order_number, (o.created_at AT TIME ZONE ${IST})::date::text AS created_on, o.table_label, o.status, t.total_amount::text AS total_amount, t.payment_status::text AS payment_status
             FROM bar_orders o JOIN bar_order_totals t ON t.bar_order_id = o.id WHERE (o.created_at AT TIME ZONE ${IST})::date BETWEEN $1 AND $2 ORDER BY o.created_at`, [r.from, r.to]) };
      case 'TAX':
        return { filename, content: await table(['revenue_category', 'gross_amount', 'tax_amount'],
          `SELECT l.revenue_category::text AS revenue_category, sum(${NET})::numeric(12,2)::text AS gross_amount, sum(${NET_TAX})::numeric(12,2)::text AS tax_amount
             FROM payments p JOIN payment_ledger l ON l.payment_id = p.id WHERE ${PAID_DATE} BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [r.from, r.to]) };
    }
  },
};
