import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { initAdmin } from '../admin/admin.js';

const html = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8');
const status = (changes = {}) => ({
  user: { email: 'owner@example.com' }, provider: 'MTN', authMethod: 'oauth',
  environment: 'production', products: ['usage', 'plans', 'profiles'], configured: true,
  fields: { clientId: true, clientSecret: true, apiKey: false }, testAvailable: true,
  testBlockedReason: null, subscriberAccess: 'not_connected', lastTest: null, ...changes,
});
const response = (body, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
function mount(fetchImpl) {
  const dom = new JSDOM(html, { url: 'https://telvyo.test/admin' });
  const controller = initAdmin({ document: dom.window.document, fetchImpl });
  return { dom, controller, $: (selector) => dom.window.document.querySelector(selector) };
}

test('expired identity offers top-level sign-in and removes owner data', async () => {
  let expired = false;
  const { dom, controller, $ } = mount(async () => expired ? response({ error: 'Sign in', code: 'UNAUTHENTICATED' }, 401) : response(status()));
  await controller.ready;
  expired = true;
  await controller.refresh();
  assert.equal($('#auth-gate').hidden, false);
  assert.equal($('#dashboard').hidden, true);
  assert.equal($('#owner-email').textContent, '');
  assert.equal($('#sign-in').getAttribute('href'), '/signin-with-chatgpt?return_to=%2Fadmin');
  assert.equal($('#sign-in').getAttribute('target'), '_top');
  assert.equal($('#test-button').disabled, true);
  dom.window.close();
});

test('wrong owner gets denied rather than a misleading sign-in or configuration state', async () => {
  const { dom, controller, $ } = mount(async () => response({ error: 'Forbidden', code: 'FORBIDDEN' }, 403));
  await controller.ready;
  assert.equal($('#dashboard').hidden, true);
  assert.match($('#gate-title').textContent, /owner access required/i);
  assert.equal($('#sign-in').hidden, true);
  assert.equal($('#gate-sign-out').hidden, false);
  dom.window.close();
});

test('missing setup exposes required OAuth fields and keeps testing unavailable', async () => {
  const { dom, controller, $ } = mount(async () => response(status({ configured: false, fields: {clientId: false, clientSecret: false, apiKey: false}, testAvailable: false, testBlockedReason: 'Required credentials are missing.' })));
  await controller.ready;
  assert.match($('#configuration-status').textContent, /setup required/i);
  assert.equal($('#test-button').disabled, true);
  assert.match($('#client-id-state').textContent, /missing/i);
  assert.match($('#client-secret-state').textContent, /missing/i);
  assert.equal($('#oauth-fields').hidden, false);
  assert.equal($('#api-key-fields').hidden, true);
  assert.equal(dom.window.document.querySelectorAll('input, textarea').length, 0);
  dom.window.close();
});

test('test request has fixed same-origin shape and an authenticated app never becomes a connected subscriber', async () => {
  const calls = [];
  const { dom, controller, $ } = mount(async (url, options) => {
    calls.push({url, options});
    return response(status(calls.length > 1 ? { lastTest: { status: 'authenticated', at: '2026-11-14T10:00:00Z', message: 'App authentication only.' }} : {}));
  });
  await controller.ready;
  assert.equal(calls[0].url, '/api/admin/status');
  assert.equal(calls[0].options.cache, 'no-store');
  await controller.test();
  assert.equal(calls[1].url, '/api/admin/test');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.cache, 'no-store');
  assert.equal(calls[1].options.headers['X-Telvyo-Admin'], '1');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[1].options.body, '{}');
  assert.match($('#test-result-title').textContent, /app authenticated/i);
  assert.match($('#subscriber-status').textContent, /not connected/i);
  assert.match($('#subscriber-note').textContent, /consent.*product access/i);
  assert.doesNotMatch($('#configuration-status').textContent, /^connected$/i);
  dom.window.close();
});

test('a rejected request restores actions and does not reflect raw upstream errors', async () => {
  let shouldFail = false;
  const { dom, controller, $ } = mount(async () => {
    if (shouldFail) throw new Error('secret-token-never-reflect');
    return response(status());
  });
  await controller.ready;
  shouldFail = true;
  await controller.test();
  assert.equal($('#test-button').disabled, false);
  assert.equal($('#refresh-button').disabled, false);
  assert.match($('#request-message').textContent, /could not complete/i);
  assert.doesNotMatch(dom.window.document.body.textContent, /secret-token-never-reflect/);
  dom.window.close();
});

test('initial network failure offers retry without showing configuration as loaded', async () => {
  let fail = true;
  const { dom, controller, $ } = mount(async () => {
    if (fail) throw new Error('offline');
    return response(status());
  });
  await controller.ready;
  assert.equal($('#dashboard').hidden, true);
  assert.match($('#gate-title').textContent, /status unavailable/i);
  assert.equal($('#refresh-button').disabled, false);
  fail = false;
  await controller.refresh();
  assert.equal($('#dashboard').hidden, false);
  dom.window.close();
});

test('pending and server-reported testing states prevent duplicate requests', async () => {
  let resolveTest;
  let count = 0;
  const { dom, controller, $ } = mount(async () => {
    count++;
    if (count === 1) return response(status());
    return new Promise((resolve) => { resolveTest = resolve; });
  });
  await controller.ready;
  const pending = controller.test();
  assert.equal($('#test-button').disabled, true);
  assert.equal($('#refresh-button').disabled, true);
  await controller.test();
  assert.equal(count, 2);
  resolveTest(response(status({ lastTest: {status:'testing', at:'2026-11-14T10:00:00Z', message:'Check running.'} })));
  await pending;
  assert.equal($('#test-button').disabled, true);
  assert.equal($('#refresh-button').disabled, false);
  assert.match($('#test-result-title').textContent, /in progress/i);
  dom.window.close();
});

test('email is text and API-key configuration only displays relevant secret readiness', async () => {
  const { dom, controller, $ } = mount(async () => response(status({user:{email:'<img src=x onerror=alert(1)>'}, authMethod:'apiKey', environment:'sandbox', testAvailable:false, testBlockedReason:'Product documentation is required.', fields:{clientId:false,clientSecret:false,apiKey:true}})));
  await controller.ready;
  assert.equal($('#owner-email').querySelector('img'), null);
  assert.match($('#owner-email').textContent, /<img/);
  assert.equal($('#api-key-fields').hidden, false);
  assert.equal($('#oauth-fields').hidden, true);
  assert.match($('#api-key-state').textContent, /configured/i);
  assert.equal($('#test-button').disabled, true);
  dom.window.close();
});

test('rate-limited checks require a status refresh before another check', async () => {
  let count = 0;
  const { dom, controller, $ } = mount(async () => {
    count++;
    return count === 2 ? response({error:'Cooldown',code:'RATE_LIMITED'}, 429) : response(status());
  });
  await controller.ready;
  await controller.test();
  assert.equal($('#test-button').disabled, true);
  assert.equal($('#refresh-button').disabled, false);
  await controller.test();
  assert.equal(count, 2);
  await controller.refresh();
  assert.equal($('#test-button').disabled, false);
  dom.window.close();
});

test('stalled requests abort and restore retry controls', async () => {
  const dom = new JSDOM(html, {url:'https://telvyo.test/admin'});
  let aborted = false;
  const controller = initAdmin({ document:dom.window.document, requestTimeoutMs:10, fetchImpl:(_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, {once:true});
  }) });
  await controller.ready;
  assert.equal(aborted, true);
  assert.equal(dom.window.document.querySelector('#refresh-button').disabled, false);
  assert.match(dom.window.document.querySelector('#gate-title').textContent, /status unavailable/i);
  dom.window.close();
});
