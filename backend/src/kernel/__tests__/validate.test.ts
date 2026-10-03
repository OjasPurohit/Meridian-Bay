import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import type { PaymentsRefundRequest, ReportsRevenueQuery, StaffShiftCreateRequest } from '@shared/types/requests.generated';
import { SHIFT_AREA } from '@shared/constants/enums';
import { errorHandler } from '../errors';
import { setLogSink } from '../http';
import {
  dateRangeFields, idParams, isoDate, money, offsetOf, paginationQuery, parse, percent, queryBool, queryInt, refineDateRange,
  strictObject, timeOfDay, uuid, validateBody, validateParams, validateQuery, z, type Schema,
} from '../validate';
import { serve } from './helpers';

// Compile-time contract check: these schemas must produce exactly the generated request types.
const refundBody: Schema<PaymentsRefundRequest> = strictObject({ amount: money, reason: z.string().min(1) });
const shiftBody: Schema<StaffShiftCreateRequest> = strictObject({
  staff_id: uuid, shift_date: isoDate, start_time: timeOfDay, end_time: timeOfDay,
  area: z.nativeEnum(SHIFT_AREA), notes: z.string().optional(),
});
const revenueQuery: Schema<ReportsRevenueQuery> = refineDateRange(z.object({ ...dateRangeFields, group_by: z.enum(['DAY', 'CATEGORY', 'METHOD']).optional() }));

const fieldsOf = (fn: () => unknown): Record<string, string> => {
  try {
    fn();
  } catch (e) {
    return (e as { details: { fields: Record<string, string> } }).details.fields;
  }
  assert.fail('expected VALIDATION_ERROR');
};

describe('validate fragments', () => {
  it('money is a 2-decimal string, never a number', () => {
    assert.equal(parse(money, '1250.00'), '1250.00');
    for (const bad of ['1250', '12.5', '-1.00', 12.5, '1,250.00']) assert.throws(() => parse(money, bad));
  });

  it('percent is money-shaped and <= 100', () => {
    assert.equal(parse(percent, '18.00'), '18.00');
    assert.throws(() => parse(percent, '100.01'));
  });

  it('isoDate accepts real dates only; timeOfDay is HH:mm:ss', () => {
    assert.equal(parse(isoDate, '2026-10-03'), '2026-10-03');
    assert.throws(() => parse(isoDate, '2026-02-30'));
    assert.throws(() => parse(isoDate, '03-10-2026'));
    assert.equal(parse(timeOfDay, '18:30:00'), '18:30:00');
    assert.throws(() => parse(timeOfDay, '24:00:00'));
    assert.throws(() => parse(timeOfDay, '18:30'));
  });

  it('queryBool / queryInt coerce query-string values and reject junk', () => {
    assert.equal(parse(queryBool, 'true'), true);
    assert.equal(parse(queryBool, 'false'), false);
    assert.throws(() => parse(queryBool, 'yes'));
    assert.equal(parse(queryInt, '42'), 42);
    assert.throws(() => parse(queryInt, ''));
    assert.throws(() => parse(queryInt, 'abc'));
  });

  it('pagination defaults to page 1 / 20 and enforces max 100', () => {
    assert.deepEqual(parse(paginationQuery, {}), { page: 1, page_size: 20 });
    assert.deepEqual(parse(paginationQuery, { page: '3', page_size: '100' }), { page: 3, page_size: 100 });
    assert.throws(() => parse(paginationQuery, { page_size: '101' }));
    assert.throws(() => parse(paginationQuery, { page: '0' }));
    assert.equal(offsetOf({ page: 3, page_size: 20 }), 40);
  });

  it('date range: to >= from and at most 366 days', () => {
    assert.ok(parse(revenueQuery, { from: '2026-10-01', to: '2026-10-01' }));
    assert.ok(parse(revenueQuery, { from: '2026-01-01', to: '2026-12-31' })); // 365 days
    assert.ok(fieldsOf(() => parse(revenueQuery, { from: '2026-10-02', to: '2026-10-01' })).to);
    assert.ok(fieldsOf(() => parse(revenueQuery, { from: '2025-01-01', to: '2026-10-01' })).to);
  });
});

describe('validate error shape and middleware', () => {
  it('VALIDATION_ERROR carries details.fields = { field: message }', () => {
    const fields = fieldsOf(() => parse(shiftBody, { staff_id: 'nope', shift_date: '2026-10-03', start_time: '18:00:00', end_time: '19:00:00', area: 'GYM' }));
    assert.deepEqual(Object.keys(fields).sort(), ['area', 'staff_id']);
  });

  it('strict bodies reject unknown keys (PATCH semantics)', () => {
    const fields = fieldsOf(() => parse(refundBody, { amount: '10.00', reason: 'x', extra: 1 }));
    assert.equal(fields.extra, 'Unknown field.');
  });

  let server: Awaited<ReturnType<typeof serve>>;
  before(async () => {
    setLogSink(() => {});
    const app = express();
    app.use(express.json());
    app.post('/refund', validateBody(refundBody), (req, res) => void res.json(req.body));
    app.get('/page', validateQuery(paginationQuery), (req, res) => void res.json(req.query));
    app.get('/thing/:id', validateParams(idParams), (req, res) => void res.json(req.params));
    app.use(errorHandler);
    server = await serve(app);
  });
  after(() => server.close());

  it('validateBody passes parsed data through; a missing body reports each required field', async () => {
    const good = await fetch(`${server.url}/refund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount: '5.00', reason: 'dup' }) });
    assert.deepEqual(await good.json(), { amount: '5.00', reason: 'dup' });
    const bad = await fetch(`${server.url}/refund`, { method: 'POST' });
    assert.equal(bad.status, 400);
    const body = (await bad.json()) as { error: { code: string; details: { fields: Record<string, string> } } };
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(Object.keys(body.error.details.fields).sort(), ['amount', 'reason']);
  });

  it('validateQuery coerces; validateParams rejects non-uuid ids', async () => {
    assert.deepEqual(await (await fetch(`${server.url}/page?page=2&page_size=5`)).json(), { page: 2, page_size: 5 });
    assert.equal((await fetch(`${server.url}/page?page_size=500`)).status, 400);
    assert.equal((await fetch(`${server.url}/thing/not-a-uuid`)).status, 400);
    assert.equal((await fetch(`${server.url}/thing/6f8a5a58-9f5c-4a45-9a37-0d3a3b0b9c11`)).status, 200);
  });
});
