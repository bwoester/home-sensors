import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHandler, signHeaders, type Config } from '../supabase/functions/collect-switchbot/collector.ts';

const config: Config = { token: 'test-token', secret: 'test-secret', collectorToken: 'test-collector-token', supabaseUrl: 'https://example.supabase.co', databaseKey: 'test-database-key' };
const request = () => new Request('https://example.test', { method: 'POST', headers: { 'x-collector-token': config.collectorToken } });
const now = () => new Date('2026-01-01T10:01:12Z');

test('HMAC matches an independent Node crypto implementation', async () => {
  const headers = await signHeaders(config.token, config.secret, '1234567890123', 'test-nonce');
  assert.equal(headers.sign, createHmac('sha256', config.secret).update(config.token + '1234567890123test-nonce').digest('base64'));
});

test('rejects unauthenticated requests without accessing upstream services', async () => {
  let calls = 0;
  const handler = createHandler(config, async () => { calls++; throw Error(); });
  assert.equal((await handler(new Request('https://example.test', { method: 'POST' }))).status, 401);
  assert.equal(calls, 0);
});

test('retains unknown nested fields and unchanged observations, with retry-safe poll slots', async () => {
  const payload = { statusCode: 100, body: { deviceId: 'synthetic-meter', temperature: 20, future: { values: [1, 2] } }, message: 'success' };
  let written: any;
  const handler = createHandler(config, async (input, init) => {
    const url = String(input);
    if (url.endsWith('/devices')) return Response.json({ statusCode: 100, body: { deviceList: [{ deviceId: 'synthetic-meter', deviceType: 'Meter Plus (US)' }] } });
    if (url.endsWith('/status')) return Response.json(payload);
    assert.match(url, /on_conflict=device_id,poll_slot/);
    written = JSON.parse(String(init?.body));
    return new Response(null, { status: 201 });
  }, now);
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(written[0].payload, payload);
  assert.equal(written[0].poll_slot, '2026-01-01T10:00:00.000Z');
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(written[0].payload, payload);
});

test('stores successful readings even if another device fails', async () => {
  let stored = 0;
  const handler = createHandler(config, async (input, init) => {
    const url = String(input);
    if (url.endsWith('/devices')) return Response.json({ statusCode: 100, body: { deviceList: [{ deviceId: 'good', deviceType: 'Hub 2' }, { deviceId: 'bad', deviceType: 'Meter Plus' }] } });
    if (url.includes('/bad/status')) return Response.json({ statusCode: 161 });
    if (url.includes('/good/status')) return Response.json({ statusCode: 100, body: { deviceId: 'good', humidity: 60 } });
    stored = JSON.parse(String(init?.body)).length;
    return new Response(null, { status: 201 });
  }, now);
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.equal(stored, 1);
  assert.equal((await response.json()).failed, 1);
});

test('does not report successful collection when database writes fail', async () => {
  const handler = createHandler(config, async (input) => {
    const url = String(input);
    if (url.endsWith('/devices')) return Response.json({ statusCode: 100, body: { deviceList: [{ deviceId: 'x', deviceType: 'Hub 2' }] } });
    if (url.endsWith('/status')) return Response.json({ statusCode: 100, body: { deviceId: 'x' } });
    return new Response('private database error', { status: 403 });
  }, now);
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'database_write_failed');
});
