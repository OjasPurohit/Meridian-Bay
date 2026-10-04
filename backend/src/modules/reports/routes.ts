/** HTTP mapping for reports (all OWNER_ADMIN). reports.export answers CSV, not the JSON envelope. */
import { Router } from 'express';
import { EXPORT_REPORT, REPORT_GROUP_BY, REPORT_PERIOD, USER_ROLE, type ExportReport, type ReportGroupBy, type ReportPeriod } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { asyncHandler, csv, ok } from '../../kernel/http';
import { AppError } from '../../kernel/errors';
import { created } from '../../kernel/http';
import { dateRangeFields, idParams, isoDate, money, refineDateRange, strictObject, validateBody, validateParams, validateQuery, z } from '../../kernel/validate';
import { ReportsService } from './service';

export const router = Router();
const owner = [requireAuth, requireRole(USER_ROLE.OWNER_ADMIN)];
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const range = validateQuery(refineDateRange(z.object(dateRangeFields)));
type Range = { from: string; to: string };
const r = (req: { query: unknown }) => req.query as Range;

router.get('/dashboard', ...owner, validateQuery(z.object({ period: enumOf(REPORT_PERIOD) })), asyncHandler(async (req, res) => ok(res, await ReportsService.dashboard((req.query as { period: ReportPeriod }).period))));
router.get('/revenue', ...owner, validateQuery(refineDateRange(z.object({ ...dateRangeFields, group_by: enumOf(REPORT_GROUP_BY).default('CATEGORY') }))),
  asyncHandler(async (req, res) => ok(res, await ReportsService.revenue(r(req), (req.query as { group_by: ReportGroupBy }).group_by))));
router.get('/courts', ...owner, range, asyncHandler(async (req, res) => ok(res, await ReportsService.courts(r(req)))));
router.get('/memberships', ...owner, range, asyncHandler(async (req, res) => ok(res, await ReportsService.memberships(r(req)))));
router.get('/shop', ...owner, range, asyncHandler(async (req, res) => ok(res, await ReportsService.shop(r(req)))));
router.get('/bar', ...owner, range, asyncHandler(async (req, res) => ok(res, await ReportsService.bar(r(req)))));
router.get('/finance', ...owner, range, asyncHandler(async (req, res) => ok(res, await ReportsService.finance(r(req)))));
router.get('/tax', ...owner, range, asyncHandler(async (req, res) => ok(res, await ReportsService.tax(r(req)))));
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be a month like 2026-10.');
const me = (req: Express.Request) => {
  if (!req.user) throw new AppError('AUTH_UNAUTHORIZED');
  return req.user.id;
};
router.get('/tax-overview', ...owner, validateQuery(z.object({ period })), asyncHandler(async (req, res) => ok(res, await ReportsService.taxOverview((req.query as { period: string }).period))));
router.post('/tax-inputs', ...owner, validateBody(strictObject({
  input_date: isoDate, supplier: z.string().trim().min(1).max(200), reference: z.string().trim().min(1).max(100).optional(), taxable_amount: money, tax_amount: money,
  is_eligible: z.boolean().optional(), notes: z.string().trim().min(1).max(500).optional(),
})), asyncHandler(async (req, res) => created(res, await ReportsService.taxInputCreate(me(req), req.body))));
router.delete('/tax-inputs/:id', ...owner, validateParams(idParams), asyncHandler(async (req, res) => {
  await ReportsService.taxInputDelete(req.params.id!);
  ok(res, null);
}));
router.post('/tax-periods/:period/report', ...owner, validateParams(z.object({ period })), asyncHandler(async (req, res) => ok(res, await ReportsService.taxPeriodReport(me(req), req.params.period!))));
router.delete('/tax-periods/:period', ...owner, validateParams(z.object({ period })), asyncHandler(async (req, res) => ok(res, await ReportsService.taxPeriodReopen(req.params.period!))));
router.get('/export', ...owner, validateQuery(refineDateRange(z.object({ ...dateRangeFields, report: enumOf(EXPORT_REPORT) }))),
  asyncHandler(async (req, res) => {
    const out = await ReportsService.export((req.query as { report: ExportReport }).report, r(req));
    csv(res, out.filename, out.content);
  }));
