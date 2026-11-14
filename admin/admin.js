/** Mount the owner workspace. Dependencies may be supplied by an embedding host. */
export function initAdmin({ document = globalThis.document, fetchImpl = globalThis.fetch, requestTimeoutMs = 25_000 } = {}) {
  const $ = (selector) => document.querySelector(selector);
  let snapshot = null;
  let pending = false;
  let disposed = false;
  const controls = {
    refresh: $('#refresh-button'), test: $('#test-button'),
  };
  const text = (selector, value) => { $(selector).textContent = value; };
  const canTest = () => snapshot?.testAvailable === true && snapshot?.lastTest?.status !== 'testing';
  function setPending(value) {
    pending = value;
    controls.refresh.disabled = value;
    controls.test.disabled = value || !canTest();
    $('#dashboard').setAttribute('aria-busy', String(value));
    controls.test.textContent = value ? 'Please wait…' : 'Test app authentication →';
  }
  function notice(message = '') {
    text('#request-message', message);
    $('#request-message').hidden = !message;
  }
  function gate(kind) {
    snapshot = null;
    $('#dashboard').hidden = true;
    $('#auth-gate').hidden = false;
    $('#auth-gate').setAttribute('aria-busy', 'false');
    text('#owner-email', '');
    $('#sign-out').hidden = true;
    $('#sign-in').hidden = kind !== 'unauthenticated';
    $('#gate-sign-out').hidden = kind !== 'forbidden';
    const messages = {
      unauthenticated: ['Sign in to your owner workspace', 'Your session is unavailable or has expired. Sign in with the ChatGPT account configured as this site’s owner.'],
      forbidden: ['Owner access required', 'This ChatGPT account is not the configured owner. Sign out, then use the account allowed by the site’s ADMIN_OWNER_EMAIL setting.'],
      unavailable: ['Status unavailable', 'We could not load the integration status. Check your connection and the site’s runtime settings, then choose Refresh status.'],
    };
    text('#gate-title', messages[kind][0]);
    text('#gate-description', messages[kind][1]);
  }
  function renderResult(result) {
    const state = result?.status || 'none';
    $('#test-result').dataset.state = state;
    const titles = { authenticated: 'App authenticated', failed: 'Authentication check failed', testing: 'Authentication check in progress', none: 'No check recorded' };
    text('#test-result-title', titles[state] || 'Check result unavailable');
    const messages = {
      authenticated: 'MTN accepted the application credentials. Subscriber consent and product access remain unverified.',
      failed: 'The application could not be authenticated. Review the credential settings and approved MTN documentation before retrying.',
      testing: 'A check is already running. Refresh status shortly to retrieve the result.',
      none: 'No authentication check is recorded for the current configuration.',
    };
    text('#test-result-message', messages[state] || 'Refresh status to retrieve the current result.');
    const timestamp = result?.at ? new Date(result.at) : null;
    const validTime = timestamp && Number.isFinite(timestamp.getTime());
    $('#test-result-time').hidden = !validTime;
    if (validTime) {
      $('#test-result-time').dateTime = timestamp.toISOString();
      text('#test-result-time', `Last check: ${timestamp.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`);
    } else {
      text('#test-result-time', '');
      $('#test-result-time').removeAttribute('datetime');
    }
    text('#readiness-auth', state === 'authenticated' ? 'Application credentials verified. Product permissions remain unverified.' : state === 'testing' ? 'Check in progress. Refresh to see the result.' : state === 'failed' ? 'The most recent check failed.' : 'Not yet verified for this configuration.');
  }
  function render(data) {
    snapshot = data;
    $('#auth-gate').hidden = true;
    $('#auth-gate').setAttribute('aria-busy', 'false');
    $('#dashboard').hidden = false;
    text('#owner-email', data.user.email);
    $('#sign-out').hidden = false;
    text('#configuration-status', data.configured ? 'Configured' : 'Setup required');
    $('#configuration-status').dataset.state = data.configured ? 'configured' : 'missing';
    text('#configuration-note', data.configured ? 'Required runtime settings are present. Configuration alone does not verify MTN authentication or subscriber access.' : 'Complete the required environment and secret settings below, then refresh status.');
    const method = data.authMethod;
    text('#auth-method', method === 'oauth' ? 'OAuth · client credentials' : method === 'apiKey' ? 'API key' : 'Not selected');
    text('#environment', { unknown: 'Unknown', sandbox: 'Sandbox', production: 'Production' }[data.environment] || 'Unknown');
    const products = { usage: 'Usage', plans: 'Plans', profiles: 'Profiles' };
    text('#products', data.products.map((product) => products[product]).filter(Boolean).join(', ') || 'Not selected');
    $('#oauth-fields').hidden = method === 'apiKey';
    $('#api-key-fields').hidden = method === 'oauth';
    for (const [field, selector] of [['clientId', '#client-id-state'], ['clientSecret', '#client-secret-state'], ['apiKey', '#api-key-state']]) {
      const present = data.fields[field] === true;
      text(selector, present ? 'Configured' : 'Missing');
      $(selector).dataset.present = String(present);
    }
    text('#readiness-config', data.configured ? 'Required settings are present in the server environment.' : 'Required configuration is incomplete.');
    text('#subscriber-status', 'Subscriber data · Not connected');
    text('#test-blocked-reason', data.testAvailable ? 'App authentication only. No subscriber data is requested.' : data.testBlockedReason || 'Complete setup and select a supported production OAuth configuration.');
    renderResult(data.lastTest);
  }
  function validStatus(data) {
    return data && typeof data.user?.email === 'string' && typeof data.configured === 'boolean' && typeof data.testAvailable === 'boolean' && Array.isArray(data.products) && data.fields && typeof data.fields === 'object';
  }
  async function request(kind) {
    if (disposed || pending || (kind === 'test' && !canTest())) return;
    notice();
    setPending(true);
    const isTest = kind === 'test';
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(isTest ? '/api/admin/test' : '/api/admin/status', {
        method: isTest ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: abortController.signal,
        headers: isTest ? { 'Content-Type': 'application/json', 'X-Telvyo-Admin': '1', Accept: 'application/json' } : { Accept: 'application/json' },
        ...(isTest ? { body: '{}' } : {}),
      });
      if (disposed) return;
      if (response.status === 401 || response.status === 403) {
        gate(response.status === 401 ? 'unauthenticated' : 'forbidden');
        return;
      }
      if (!response.ok) {
        if (response.status === 429 || response.status === 409) {
          notice('A check is already running or was requested recently. Wait at least 30 seconds, then refresh status.');
          if (snapshot) {
            snapshot = { ...snapshot, lastTest: { status: 'testing' } };
            renderResult(snapshot.lastTest);
          } else {
            gate('unavailable');
          }
          return;
        }
        throw new Error('Request unavailable');
      }
      const data = await response.json();
      if (disposed) return;
      if (!validStatus(data)) throw new Error('Invalid status');
      render(data);
    } catch {
      if (disposed) return;
      if (isTest && snapshot) {
        notice('Could not complete the authentication check. Refresh status to confirm the result before retrying.');
        $('#test-result').dataset.state = 'failed';
        text('#test-result-title', 'Check result unavailable');
        text('#test-result-message', 'The check result could not be retrieved. Refresh status to see whether MTN recorded a result.');
        $('#test-result-time').hidden = true;
        text('#readiness-auth', 'Check result unavailable. Refresh status to confirm.');
      } else {
        gate('unavailable');
      }
    } finally {
      clearTimeout(timeout);
      if (!disposed) setPending(false);
    }
  }
  const refresh = () => request('status');
  const check = () => request('test');
  controls.refresh.addEventListener('click', refresh);
  controls.test.addEventListener('click', check);
  const ready = refresh();
  return { ready, refresh, test: check, destroy() { disposed = true; controls.refresh.removeEventListener('click', refresh); controls.test.removeEventListener('click', check); } };
}

if (globalThis.document?.body?.hasAttribute('data-admin-page')) initAdmin();
