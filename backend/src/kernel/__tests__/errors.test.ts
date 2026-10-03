import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { ERROR_CODES, type ErrorCode } from '@shared/constants/errors';
import { AppError, errorHandler, notFoundHandler } from '../errors';
import { asyncHandler, requestId, setLogSink } from '../http';
import { serve } from './helpers';

describe('AppError', () => {
  it('takes status and message from the shared error table for EVERY code', () => {
    for (const code of Object.keys(ERROR_CODES) as ErrorCode[]) {
      const e = new AppError(code);
      assert.equal(e.code, code);
      assert.equal(e.status, ERROR_CODES[code].status);
      assert.equal(e.message, ERROR_CODES[code].message);
      assert.deepEqual(e.toBody(), { success: false, error: { code, message: ERROR_CODES[code].message } });
    }
  });

  it('carries details and an optional message override', () => {
    const e = new AppError('PAYMENT_AMOUNT_MISMATCH', { amount_due: '800.00' }, 'custom text');
    assert.equal(e.message, 'custom text');
    assert.deepEqual(e.toBody().error.details, { amount_due: '800.00' });
    assert.equal(e.status, 422);
  });
});

describe('error middleware', () => {
  let server: Awaited<ReturnType<typeof serve>>;
  const logged: string[] = [];

  before(async () => {
    setLogSink((line) => logged.push(line));
    const app = express();
    app.use(requestId);
    app.use(express.json());
    app.get('/app-error', () => {
      throw new AppError('BOOKING_CONFLICT', { court: 'T1' });
    });
    app.get('/async-error', asyncHandler(async () => {
      throw new AppError('INVOICE_NOT_FOUND');
    }));
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    app.post('/json', (_req, res) => void res.json({ ok: true }));
    app.use(notFoundHandler);
    app.use(errorHandler);
    server = await serve(app);
  });
  after(async () => {
    setLogSink();
    await server.close();
  });

  it('renders AppError in the standard error envelope with its HTTP status', async () => {
    const res = await fetch(`${server.url}/app-error`);
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { success: false, error: { code: 'BOOKING_CONFLICT', message: ERROR_CODES.BOOKING_CONFLICT.message, details: { court: 'T1' } } });
  });

  it('routes rejected async handlers through the same path', async () => {
    const res = await fetch(`${server.url}/async-error`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'INVOICE_NOT_FOUND');
  });

  it('turns unknown errors into a generic INTERNAL_ERROR and logs the real one with the request id', async () => {
    logged.length = 0;
    const res = await fetch(`${server.url}/boom`, { headers: { 'x-request-id': 'req-abc' } });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, ERROR_CODES.INTERNAL_ERROR.message);
    assert.ok(!JSON.stringify(body).includes('hunter2'), 'internal message must not reach the client');
    assert.ok(logged.some((l) => l.includes('hunter2') && l.includes('req-abc')), 'real error is logged with the request id');
  });

  it('maps malformed JSON to VALIDATION_ERROR', async () => {
    const res = await fetch(`${server.url}/json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":' });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; details: { fields: Record<string, string> } } };
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.fields.body);
  });

  it('answers unknown routes with NOT_FOUND', async () => {
    const res = await fetch(`${server.url}/nope`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'NOT_FOUND');
  });
});
