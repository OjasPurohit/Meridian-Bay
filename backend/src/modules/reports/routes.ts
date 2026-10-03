/** HTTP mapping for reports (all OWNER_ADMIN). reports.export answers CSV, not the JSON envelope. */
import { Router } from 'express';
import { EXPORT_REPORT, REPORT_GROUP_BY, REPORT_PERIOD, USER_ROLE, type ExportReport, type ReportGroupBy, type ReportPeriod } from '@shared/constants/enums';
import { requireAuth, requireRole } from '../../kernel/auth';
import { asyncHandler, csv, ok } from '../../kernel/http';
import { dateRangeFields, refineDateRange, validateQuery, z } from '../../kernel/validate';
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
router.get('/export', ...owner, validateQuery(refineDateRange(z.object({ ...dateRangeFields, report: enumOf(EXPORT_REPORT) }))),
  asyncHandler(async (req, res) => {
    const out = await ReportsService.export((req.query as { report: ExportReport }).report, r(req));
    csv(res, out.filename, out.content);
  }));
