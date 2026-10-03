import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { asyncHandler, created, csv, ok, page, requestId, toCsv } from '../http';
import { serve } from './helpers';

describe('http envelopes', () => {
  let server: Awaited<ReturnType<typeof serve>>;

  before(async () => {
    const app = express();
    app.use(requestId);
    app.get('/ok', (_req, res) => ok(res, { id: 1 }));
    app.get('/ok-msg', (_req, res) => ok(res, null, 'Done.'));
    app.post('/created', (_req, res) => created(res, { id: 2 }));
    app.get('/page', (_req, res) => page(res, [{ n: 1 }, { n: 2 }], { page: 2, page_size: 20, total: 41 }));
    app.get('/page-empty', (_req, res) => page(res, [], { page: 1, page_size: 20, total: 0 }));
    app.get('/csv', (_req, res) => csv(res, 'revenue 2026/10.csv', toCsv(['date', 'note'], [['2026-10-03', 'a,b']])));
    app.get('/async', asyncHandler(async (_req, res) => ok(res, 'fine')));
    server = await serve(app);
  });
  after(() => server.close());

  it('ok(): 200 with { success, data } and no meta', async () => {
    const res = await fetch(`${server.url}/ok`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true, data: { id: 1 } });
  });

  it('ok(): data null (void endpoints) and optional message', async () => {
    assert.deepEqual(await (await fetch(`${server.url}/ok-msg`)).json(), { success: true, data: null, message: 'Done.' });
  });

  it('created(): 201', async () => {
    const res = await fetch(`${server.url}/created`, { method: 'POST' });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { success: true, data: { id: 2 } });
  });

  it('page(): meta with total_pages = ceil(total / page_size)', async () => {
    const body = await (await fetch(`${server.url}/page`)).json();
    assert.deepEqual(body, { success: true, data: [{ n: 1 }, { n: 2 }], meta: { page: 2, page_size: 20, total: 41, total_pages: 3 } });
  });

  it('page(): empty list has total_pages 0', async () => {
    const body = (await (await fetch(`${server.url}/page-empty`)).json()) as { meta: { total_pages: number } };
    assert.equal(body.meta.total_pages, 0);
  });

  it('csv(): text/csv attachment with a sanitised file name, not the JSON envelope', async () => {
    const res = await fetch(`${server.url}/csv`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/csv/);
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="revenue_2026_10.csv"');
    assert.equal(await res.text(), 'date,note\r\n2026-10-03,"a,b"\r\n');
  });

  it('toCsv(): quotes, newlines and nulls', () => {
    assert.equal(toCsv(['a', 'b'], [['say "hi"', 'x\ny'], [null, 1.5]]), 'a,b\r\n"say ""hi""","x\ny"\r\n,1.5\r\n');
  });

  it('requestId: generates an id, or echoes a safe incoming one', async () => {
    const generated = (await fetch(`${server.url}/ok`)).headers.get('x-request-id');
    assert.match(generated ?? '', /^[0-9a-f-]{36}$/);
    const echoed = (await fetch(`${server.url}/ok`, { headers: { 'x-request-id': 'trace-1' } })).headers.get('x-request-id');
    assert.equal(echoed, 'trace-1');
    const rejected = (await fetch(`${server.url}/ok`, { headers: { 'x-request-id': 'bad id with spaces' } })).headers.get('x-request-id');
    assert.notEqual(rejected, 'bad id with spaces');
  });

  it('asyncHandler(): normal path works', async () => {
    assert.deepEqual(await (await fetch(`${server.url}/async`)).json(), { success: true, data: 'fine' });
  });
});
