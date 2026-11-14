// SECURITY: Run only behind Sites' trusted identity dispatch. These headers are
// externally spoofable on arbitrary hosts. ADMIN_OWNER_EMAIL is an access
// allowlist, not an application user record. Never expose this Worker directly.
const RESULT_KEY = 'telvyo/mtn-auth-check-v1.json';
const COOLDOWN_MS = 30_000;
const TOKEN_URL = 'https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials';
const MESSAGES = Object.freeze({
  testing: 'Checking app authentication.',
  authenticated: 'MTN app authentication succeeded. Subscriber and product access remain unverified.',
  failed: 'MTN app authentication failed. Check your settings and approved MTN credentials.',
  interrupted: 'The app authentication check was interrupted. Try again.',
});

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function error(status, code, message) { return json({ error: message, code }, status); }
function safeValue(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f-\x9f]/.test(value) ? value : '';
}
function normalizedEmail(value) { return safeValue(value).trim().toLowerCase(); }

export function authorizeAdmin(request, env) {
  const owner = normalizedEmail(env.ADMIN_OWNER_EMAIL);
  if (!owner) return error(503, 'OWNER_NOT_CONFIGURED', 'Owner access is not configured.');
  const id = safeValue(request.headers.get('oai-authenticated-user-id')).trim();
  const email = normalizedEmail(request.headers.get('oai-authenticated-user-email'));
  if (!id || !email) return error(401, 'SIGN_IN_REQUIRED', 'Sign in with the owner account.');
  if (email !== owner) return error(403, 'OWNER_REQUIRED', 'This page is restricted to its owner.');
  return null;
}

function configuration(env) {
  const authMethod = ['oauth', 'apiKey'].includes(env.MTN_AUTH_METHOD) ? env.MTN_AUTH_METHOD : 'unknown';
  const environment = ['sandbox', 'production'].includes(env.MTN_ENVIRONMENT) ? env.MTN_ENVIRONMENT : 'unknown';
  const selected = safeValue(env.MTN_PRODUCTS).split(',').map(value => value.trim());
  const products = [...new Set(selected.filter(value => ['usage', 'plans', 'profiles'].includes(value)))];
  const validProducts = products.length > 0 && selected.every(value => products.includes(value));
  const clientId = safeValue(env.MTN_CLIENT_ID);
  const clientSecret = safeValue(env.MTN_CLIENT_SECRET);
  const apiKey = safeValue(env.MTN_API_KEY);
  const configured = Boolean(authMethod !== 'unknown' && environment !== 'unknown' && validProducts && (authMethod === 'oauth' ? clientId && clientSecret : apiKey));
  let testBlockedReason = null;
  if (authMethod !== 'oauth' || environment !== 'production') testBlockedReason = 'Approved product details are required to test this authentication method or environment.';
  else if (!configured) testBlockedReason = 'Complete the required MTN settings before testing.';
  else if (!env.BUCKET) testBlockedReason = 'Result storage is unavailable. Configure the storage binding before testing.';
  return { authMethod, environment, products, configured, fields: { clientId: Boolean(clientId), clientSecret: Boolean(clientSecret), apiKey: Boolean(apiKey) }, testAvailable: !testBlockedReason, testBlockedReason };
}

async function fingerprint(env, config) {
  const credentials = config.authMethod === 'oauth' ? [safeValue(env.MTN_CLIENT_ID), safeValue(env.MTN_CLIENT_SECRET)] : [safeValue(env.MTN_API_KEY)];
  const encoded = new TextEncoder().encode(JSON.stringify([config.authMethod, config.environment, config.products, config.configured, ...credentials]));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function readMetadata(bucket) {
  const object = await bucket.get(RESULT_KEY);
  if (!object) return { etag: null, value: null };
  if (object.size > 8192 || !object.etag) throw new Error('Storage unavailable');
  const value = await object.json();
  if (!value || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint) || !Number.isFinite(value.attemptedAt) || !['authenticated', 'failed', 'testing'].includes(value.lastTest?.status) || !Number.isFinite(Date.parse(value.lastTest.at))) throw new Error('Storage unavailable');
  return { etag: object.etag, value };
}

function visibleResult(metadata, digest, timestamp) {
  if (!metadata || metadata.fingerprint !== digest) return null;
  const { status, at } = metadata.lastTest;
  if (status === 'testing' && timestamp - metadata.attemptedAt >= COOLDOWN_MS) return { status: 'failed', at: new Date(Date.parse(at)).toISOString(), message: MESSAGES.interrupted };
  // Rebuild all messages rather than reflecting stored or upstream text.
  return { status, at: new Date(Date.parse(at)).toISOString(), message: MESSAGES[status] };
}

async function statusState(env, now) {
  const config = configuration(env);
  let lastTest = null;
  if (env.BUCKET) {
    const digest = await fingerprint(env, config);
    const { value } = await readMetadata(env.BUCKET);
    lastTest = visibleResult(value, digest, now());
  }
  return { user: { email: normalizedEmail(env.ADMIN_OWNER_EMAIL) }, provider: 'MTN', ...config, subscriberAccess: 'not_connected', lastTest };
}

class BodyTooLarge extends Error {}
async function boundedText(stream, limit) {
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0; let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new BodyTooLarge();
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (cause) {
    void reader.cancel().catch(() => {});
    throw cause;
  } finally { reader.releaseLock(); }
}

async function providerCheck(env, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Authentication timeout')); }, 15_000);
  });
  try {
    const operation = (async () => {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ client_id: safeValue(env.MTN_CLIENT_ID), client_secret: safeValue(env.MTN_CLIENT_SECRET) }).toString(),
      });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        void response.body?.cancel().catch(() => {});
        return false;
      }
      const value = JSON.parse(await boundedText(response.body, 64 * 1024));
      const expiry = value?.expires_in;
      const numericExpiry = typeof expiry === 'number' || (typeof expiry === 'string' && /^(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(expiry));
      const seconds = numericExpiry ? Number(expiry) : NaN;
      return typeof value?.access_token === 'string' && value.access_token.trim().length > 0 && !/[\x00-\x1f\x7f-\x9f]/.test(value.access_token) && Number.isFinite(seconds) && seconds > 0;
    })();
    return await Promise.race([operation, timeout]);
  } catch { return false; }
  finally { clearTimeout(timer); }
}

export function createAdminHandler({ fetchImpl = fetch, now = Date.now, waitImpl = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return null;
    const denied = authorizeAdmin(request, env);
    if (denied) return denied;
    if (!['/api/admin/status', '/api/admin/test'].includes(url.pathname)) return error(404, 'NOT_FOUND', 'API route not found.');
    const expectedMethod = url.pathname.endsWith('/status') ? 'GET' : 'POST';
    if (request.method !== expectedMethod) return error(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    try {
      if (expectedMethod === 'GET') return json(await statusState(env, now));
      if (request.headers.get('origin') !== url.origin || request.headers.get('x-telvyo-admin') !== '1') return error(403, 'SAME_ORIGIN_REQUIRED', 'A same-origin admin request is required.');
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error(415, 'JSON_REQUIRED', 'Use an application/json request.');
      let body;
      try { body = JSON.parse(await boundedText(request.body, 1024)); }
      catch (cause) {
        if (cause instanceof BodyTooLarge) return error(413, 'BODY_TOO_LARGE', 'Request body is too large.');
        return error(400, 'INVALID_REQUEST', 'Provide an empty JSON object.');
      }
      if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) return error(400, 'INVALID_REQUEST', 'Provide an empty JSON object.');
      const config = configuration(env);
      if (config.authMethod !== 'oauth' || config.environment !== 'production') return error(422, 'PRODUCT_DETAILS_REQUIRED', 'Approved product details are required to test this authentication method or environment.');
      if (!config.configured) return error(422, 'CONFIGURATION_REQUIRED', 'Complete the required MTN settings before testing.');
      if (!env.BUCKET) return error(503, 'STORAGE_UNAVAILABLE', 'Result storage is unavailable.');
      const digest = await fingerprint(env, config);
      const previous = await readMetadata(env.BUCKET);
      const timestamp = now();
      if (previous.value && timestamp - previous.value.attemptedAt < COOLDOWN_MS) return error(429, 'COOLDOWN', 'Wait 30 seconds between authentication checks.');
      const at = new Date(timestamp).toISOString();
      const metadata = { fingerprint: digest, attemptedAt: timestamp, lastTest: { status: 'testing', at, message: MESSAGES.testing } };
      const lease = await env.BUCKET.put(RESULT_KEY, JSON.stringify(metadata), { onlyIf: previous.etag ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' } });
      if (!lease?.etag) return error(409, 'CHECK_IN_PROGRESS', 'Another authentication check is in progress.');
      const success = await providerCheck(env, fetchImpl);
      const status = success ? 'authenticated' : 'failed';
      metadata.lastTest = { status, at, message: MESSAGES[status] };
      // R2 permits at most one write per second to the same key. Even a fast
      // provider response must leave space after the lease write before saving
      // its result. The provider deadline plus this wait stays below 17 seconds.
      await waitImpl(1100);
      // An expired checker cannot overwrite a newer lease or result.
      await env.BUCKET.put(RESULT_KEY, JSON.stringify(metadata), { onlyIf: { etagMatches: lease.etag } });
      return json(await statusState(env, now));
    } catch {
      // Never reflect thrown errors: dependencies may include credentials.
      return error(503, 'STORAGE_UNAVAILABLE', 'Admin status storage is unavailable. Try again later.');
    }
  };
}
