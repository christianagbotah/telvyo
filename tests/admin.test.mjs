import test from 'node:test';
import assert from 'node:assert/strict';

const { authorizeAdmin, createAdminHandler } = await import('../worker/admin.js').catch(() => ({}));
const KEY = 'telvyo/mtn-auth-check-v1.json';
const ORIGIN = 'https://telvyo.example';
const identity = { 'oai-authenticated-user-id': 'owner-id', 'oai-authenticated-user-email': 'Owner@Example.com' };
const instant = Date.parse('2026-11-14T12:00:00Z');
class Bucket {
  entries = new Map(); writes = []; sequence = 0; fail = false;
  async get(key) {
    if (this.fail) throw new Error('private storage diagnostic');
    const value = this.entries.get(key);
    return value ? { etag: value.etag, json: async () => JSON.parse(value.body) } : null;
  }
  async put(key, body, options = {}) {
    if (this.fail) throw new Error('private storage diagnostic');
    const old = this.entries.get(key);
    if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== old?.etag) return null;
    if (options.onlyIf?.etagDoesNotMatch === '*' && old) return null;
    const value = { body, etag: `v${++this.sequence}` };
    this.entries.set(key, value); this.writes.push(body);
    return { etag: value.etag };
  }
}
function config(extra = {}) {
  return { ADMIN_OWNER_EMAIL: 'owner@example.com', MTN_AUTH_METHOD: 'oauth', MTN_ENVIRONMENT: 'production', MTN_PRODUCTS: 'usage,plans', MTN_CLIENT_ID: 'private-client-id', MTN_CLIENT_SECRET: 'private-client-secret', MTN_API_KEY: 'private-api-key', BUCKET: new Bucket(), ...extra };
}
function req(path = '/api/admin/status', options = {}) {
  const headers = { ...identity, ...options.headers };
  return new Request(`${ORIGIN}${path}`, { ...options, headers });
}
function post(body = '{}', headers = {}) {
  return req('/api/admin/test', { method: 'POST', body, headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-telvyo-admin': '1', ...headers } });
}
function handler(options = {}) {
  assert.equal(typeof createAdminHandler, 'function', 'admin handler is implemented');
  return createAdminHandler({ now: () => instant, waitImpl: async () => {}, fetchImpl: async () => Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: 3600 }), ...options });
}
async function state(handle, env) { const response = await handle(req(), env); assert.equal(response.status, 200); return response.json(); }

test('owner authorization rejects missing identity, wrong owner and unset allowlist', async () => {
  assert.equal(typeof authorizeAdmin, 'function', 'owner authorization is implemented');
  for (const headers of [{}, { 'oai-authenticated-user-id': 'id' }, { 'oai-authenticated-user-email': 'owner@example.com' }]) {
    assert.equal(authorizeAdmin(new Request(ORIGIN, { headers }), config()).status, 401);
  }
  assert.equal(authorizeAdmin(req('/', { headers: { 'oai-authenticated-user-email': 'other@example.com' } }), config()).status, 403);
  assert.equal(authorizeAdmin(req(), config({ ADMIN_OWNER_EMAIL: undefined })).status, 503);
  assert.equal(authorizeAdmin(req(), config({ ADMIN_OWNER_EMAIL: ' OWNER@example.com ' })), null);
});

test('status exposes configuration flags without any credentials', async () => {
  const env = config(); const handle = handler(); const response = await handle(req(), env);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const value = await response.json();
  assert.deepEqual(value, { user: { email: 'owner@example.com' }, provider: 'MTN', authMethod: 'oauth', environment: 'production', products: ['usage', 'plans'], configured: true, fields: { clientId: true, clientSecret: true, apiKey: true }, testAvailable: true, testBlockedReason: null, subscriberAccess: 'not_connected', lastTest: null });
  for (const secret of [env.MTN_CLIENT_ID, env.MTN_CLIENT_SECRET, env.MTN_API_KEY]) assert.ok(!JSON.stringify(value).includes(secret));
});

test('configuration rejects unsafe credentials and unsupported configuration values', async () => {
  for (const extra of [{ MTN_CLIENT_SECRET: 'a\nb' }, { MTN_CLIENT_SECRET: 's'.repeat(4097) }, { MTN_AUTH_METHOD: 'invented' }, { MTN_ENVIRONMENT: 'invented' }, { MTN_PRODUCTS: 'usage,private-product' }, { MTN_PRODUCTS: '' }]) {
    const value = await state(handler(), config(extra));
    assert.equal(value.configured, false); assert.equal(value.testAvailable, false);
  }
  const missing = await state(handler(), config({ BUCKET: undefined }));
  assert.equal(missing.configured, true); assert.equal(missing.testAvailable, false); assert.match(missing.testBlockedReason, /storage/i);
});

test('all API routes authorize first, reject unknown routes and methods, and leave public paths alone', async () => {
  const handle = handler(); const env = config();
  assert.equal(await handle(req('/index.html'), env), null);
  assert.equal((await handle(new Request(`${ORIGIN}/api/anything`), env)).status, 401);
  assert.equal((await handle(req('/api/anything'), env)).status, 404);
  assert.equal((await handle(req('/api/admin/status', { method: 'POST' }), env)).status, 405);
  assert.equal((await handle(req('/api/admin/test'), env)).status, 405);
});

test('test requires exact same-origin JSON and explicit admin header', async () => {
  const handle = handler({ fetchImpl: () => assert.fail('must not contact provider') });
  for (const headers of [{ origin: '' }, { origin: 'https://evil.example' }, { origin: `${ORIGIN}/` }, { 'x-telvyo-admin': '' }]) assert.equal((await handle(post('{}', headers), config())).status, 403);
  assert.equal((await handle(post('{}', { 'content-type': 'text/plain' }), config())).status, 415);
});

test('test rejects caller fields, malformed JSON and bodies over streaming cap', async () => {
  const handle = handler({ fetchImpl: () => assert.fail('must not contact provider') });
  for (const body of ['{"url":"https://evil.example"}', '{"clientSecret":"secret"}', 'null', '[]', '{']) assert.equal((await handle(post(body), config())).status, 400);
  assert.equal((await handle(post(' '.repeat(1024) + '{}'), config())).status, 413);
  let delivered = false;
  const request = req('/api/admin/test', { method: 'POST', duplex: 'half', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-telvyo-admin': '1', 'content-length': '2' }, body: new ReadableStream({ pull(controller) { if (!delivered) { controller.enqueue(new TextEncoder().encode('x'.repeat(1025))); delivered = true; } else controller.close(); } }) });
  assert.equal((await handle(request, config())).status, 413);
});

test('unsupported environments and API-key mode never call provider', async () => {
  const handle = handler({ fetchImpl: () => assert.fail('must not contact provider') });
  for (const extra of [{ MTN_ENVIRONMENT: 'sandbox' }, { MTN_AUTH_METHOD: 'apiKey' }]) {
    const response = await handle(post(), config(extra)); assert.equal(response.status, 422); assert.equal((await response.json()).code, 'PRODUCT_DETAILS_REQUIRED');
  }
  assert.equal((await handle(post(), config({ MTN_CLIENT_SECRET: '' }))).status, 422);
});

test('successful test uses the fixed OAuth request and never returns or persists the token', async () => {
  const env = config();
  const handle = handler({ fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    const form = new URLSearchParams(options.body); assert.equal(form.get('client_id'), env.MTN_CLIENT_ID); assert.equal(form.get('client_secret'), env.MTN_CLIENT_SECRET);
    assert.match(new Headers(options.headers).get('content-type'), /application\/x-www-form-urlencoded/);
    return Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: 3600 });
  } });
  const response = await handle(post(), env); assert.equal(response.status, 200);
  const value = await response.json(); assert.equal(value.lastTest.status, 'authenticated'); assert.match(value.lastTest.message, /app.*authentication/i); assert.match(value.lastTest.message, /unverified/i); assert.equal(value.subscriberAccess, 'not_connected');
  for (const secret of ['PRIVATE-TOKEN', env.MTN_CLIENT_ID, env.MTN_CLIENT_SECRET, env.MTN_API_KEY]) {
    assert.ok(!JSON.stringify(value).includes(secret)); assert.ok(!env.BUCKET.writes.join('').includes(secret));
  }
  assert.equal((await state(handle, env)).lastTest.status, 'authenticated');
});

test('provider errors, malformed tokens, and oversized responses produce only sanitized failures', async () => {
  for (const fetchImpl of [async () => new Response('private-client-secret', { status: 401 }), async () => { throw new Error('PRIVATE-TOKEN'); }, async () => Response.json({ access_token: '', expires_in: 3600 }), async () => Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: 0 }), async () => Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: true }), async () => new Response('{oops', { headers: { 'content-type': 'application/json' } }), async () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }), async () => new Response('{"access_token":"PRIVATE-TOKEN","expires_in":3600}', { headers: { 'content-type': 'text/html' } })]) {
    const env = config(); const response = await handler({ fetchImpl })(post(), env);
    assert.equal(response.status, 200); const value = await response.json(); assert.equal(value.lastTest.status, 'failed');
    assert.ok(!JSON.stringify(value).includes('private-client-secret')); assert.ok(!JSON.stringify(value).includes('PRIVATE-TOKEN'));
  }
});

test('R2 conditional lease prevents concurrent checks and shares cooldown across instances', async () => {
  const env = config(); let finish; let started;
  const running = new Promise(resolve => { started = resolve; });
  const first = handler({ fetchImpl: () => { started(); return new Promise(resolve => { finish = resolve; }); } });
  const pending = first(post(), env); await running;
  const testing = await state(first, env); assert.equal(testing.lastTest.status, 'testing');
  const response = await handler({ fetchImpl: () => assert.fail('lease must block provider') })(post(), env);
  assert.ok([409, 429].includes(response.status));
  finish(Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: 3600 })); await pending;
  assert.equal((await handler()(post(), env)).status, 429);
  assert.equal((await handler({ now: () => instant + 30001 })(post(), env)).status, 200);
});

test('simultaneous lease acquisition allows only one provider check', async () => {
  const env = config(); let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: 3600 }); };
  const responses = await Promise.all([handler({ fetchImpl })(post(), env), handler({ fetchImpl })(post(), env)]);
  assert.equal(calls, 1); assert.equal(responses.filter(value => value.status === 200).length, 1); assert.ok(responses.some(value => [409, 429].includes(value.status)));
});

test('configuration rotation hides previous results and does not bypass shared cooldown', async () => {
  const env = config(); await handler()(post(), env);
  for (const extra of [{ MTN_CLIENT_SECRET: 'new-secret' }, { MTN_PRODUCTS: 'profiles' }, { MTN_ENVIRONMENT: 'sandbox' }]) assert.equal((await state(handler(), { ...env, ...extra })).lastTest, null);
  assert.equal((await handler()(post(), { ...env, MTN_CLIENT_SECRET: 'new-secret' })).status, 429);
});

test('expired testing state becomes interrupted and an old lease cannot overwrite a newer result', async () => {
  const env = config(); let finish; let started;
  const running = new Promise(resolve => { started = resolve; });
  const handle = handler({ fetchImpl: () => { started(); return new Promise(resolve => { finish = resolve; }); } });
  const pending = handle(post(), env); await running;
  const later = handler({ now: () => instant + 30001 });
  const stale = await state(later, env); assert.equal(stale.lastTest.status, 'failed'); assert.match(stale.lastTest.message, /interrupted/i);
  await later(post(), env); finish(Response.json({ access_token: 'PRIVATE-TOKEN', expires_in: 3600 })); await pending;
  assert.equal((await state(later, env)).lastTest.at, new Date(instant + 30001).toISOString());
});

test('R2 read/write failures fail closed without reflecting storage diagnostics', async () => {
  const env = config(); env.BUCKET.fail = true;
  const handle = handler({ fetchImpl: () => assert.fail('storage failure must stop provider') });
  for (const request of [req(), post()]) { const response = await handle(request, env); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private storage diagnostic')); }
  const badPut = config(); badPut.BUCKET.put = async () => { throw Error('private write'); };
  assert.equal((await handle(post(), badPut)).status, 503);
});


test('OAuth accepts positive numeric-string expiry and rejects coercion-only values', async () => {
  for (const expires_in of ['3600', '3600.5', '1e3']) {
    const response = await handler({ fetchImpl: async () => Response.json({ access_token: 'PRIVATE-TOKEN', expires_in }) })(post(), config());
    assert.equal(response.status, 200); assert.equal((await response.json()).lastTest.status, 'authenticated', `accept numeric expiry ${expires_in}`);
  }
  for (const expires_in of [true, false, null, {}, [], '', ' ', ' 3600 ', 'Infinity', 'NaN', '1e999', '0x10', '0', '-1']) {
    const response = await handler({ fetchImpl: async () => Response.json({ access_token: 'PRIVATE-TOKEN', expires_in }) })(post(), config());
    assert.equal(response.status, 200); assert.equal((await response.json()).lastTest.status, 'failed', `reject invalid expiry ${JSON.stringify(expires_in)}`);
  }
});


test('result persistence respects R2 per-key write spacing after acquiring a lease', async () => {
  let clock = instant; let waited = 0;
  class RateLimitedBucket extends Bucket {
    writtenAt = null;
    async put(key, body, options) {
      if (this.writtenAt !== null && clock - this.writtenAt < 1000) throw Error('R2 same-key write rate exceeded');
      const result = await super.put(key, body, options);
      if (result) this.writtenAt = clock;
      return result;
    }
  }
  const env = config({ BUCKET: new RateLimitedBucket() });
  const handle = handler({ now: () => clock, waitImpl: async milliseconds => { waited += milliseconds; clock += milliseconds; } });
  const response = await handle(post(), env);
  assert.equal(response.status, 200); assert.equal((await response.json()).lastTest.status, 'authenticated');
  assert.ok(waited >= 1100); assert.equal((await state(handle, env)).lastTest.status, 'authenticated');
});

test('a rejected conditional lease never starts a provider check or completion wait', async () => {
  const env = config(); env.BUCKET.put = async () => null;
  const handle = handler({ fetchImpl: () => assert.fail('rejected lease must block provider'), waitImpl: () => assert.fail('rejected lease needs no completion wait') });
  assert.equal((await handle(post(), env)).status, 409);
});
