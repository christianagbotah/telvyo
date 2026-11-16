# Customer sign-in foundation — web OAuth 2.0 / OpenID Connect PKCE

**Status: source-only and deliberately disconnected. No customer account sign-in is live.**

Telvyo now includes a **browser-only** authorization-code/PKCE module at `client/oidc-pkce.js`. It is NOT imported by `dist/app.js`, bundled into the Android or iOS builds, connected to a registered real identity provider, or served from the VPS public root. No changes are made to personal records or existing offline behavior. It is a starting point for an assessed identity integration, **not a security certification or customer login feature**.

## Scope and security boundary

The module accepts explicitly configured and audited HTTPS issuer, authorization endpoint, token endpoint, public client ID, *exact registered* HTTPS redirect URI and Telvyo private API origin. Do not load endpoint values from user input. A production provider must actually issue signed, short-lived JWT **access tokens for Telvyo's API audience**. ID tokens alone are not valid API access credentials. The server continues to independently verify signatures, issuer, audience, issue time, expiration and subject using JWKS and the configured trust rules.

The browser flow:
1. `beginAuthorization()` creates a cryptographically random 32-byte state, 64-byte PKCE verifier, 32-byte nonce and an S256 code challenge; no client secret, subscriber ID or ledger data is included. Stores **only short-lived pending state/PKCE verifier/nonce** in same-tab `sessionStorage`, expiring after five minutes, so that a full-page IdP redirect can return safely. A blocked storage operation **fails closed**, preventing sign-in from starting without the verifier.
2. The caller sends the user to the returned fixed provider authorization URL in a top-level browser navigation. Neither implicit grant nor password grant is used. No automatic redirects are performed by the module.
3. `finishAuthorization(callbackUrl)` accepts only the registered callback origin and path, strips the query/fragment from the displayed address before any network request, and **consumes the pending verifier once**. Checks state, optional RFC 9207 issuer response, expiration, allowed/unique response parameters, authorization code and absence of fragment. A duplicate callback, unexpected issuer, error or mismatched state cannot reuse an authorization code.
4. Exchanges the code at the fixed configured token endpoint with `grant_type=authorization_code`, `code_verifier`, public `client_id` and registered `redirect_uri`, with no cookies, no redirects, no referrer and no caching.
5. Treats the token response as untrusted. **Only after** querying signed bearer `GET /v1/privacy` and receiving a server-verified `accountConnected:true` does it activate a short-lived in-memory access token. An ID token is *not* decoded or trusted on the browser; any provider refresh token returned is deliberately dropped, not stored.
6. `getAccessToken()` fails if expired or close to expiry. `logout()` clears in-memory token and pending PKCE state. **It does not terminate the identity provider's SSO cookie**, revoke tokens remotely, or erase account/cloud records. Wire provider end-session and backend logout/revocation under a reviewed separate release.

The only use of `sessionStorage` is a one-time temporary authorization request, NOT tokens or user records. This reduces persistence but **does not prevent XSS from accessing current browser memory or pending PKCE material**. A reviewed CSP, dependency audit, input sanitization, token leakage controls, XSS testing and ideally a backend-for-frontend (BFF) holding tokens server-side are still needed for production.

## What it DOES NOT do

- No real registration, email/phone OTP, password reset, verification or account recovery.
- No actual registered identity-provider client, token issuance, tested issuer/JWKS, account linking, native Android secure system-browser redirect, App Links or iOS Universal Links.
- No public account page, login button, logout routing, consent screen or cloud upload. The existing client manual sync foundation remains unreferenced by the public UI.
- No refresh token processing, background silent sign-in, identity data storage or account recovery.
- No provider metadata discovery or dynamic selection. Single configured issuer only; approve provider endpoints before constructing this module.
- No MTN authorization, telecom subscriber mapping, mobile number identification or access to customer balances.

## Activation prerequisites

1. Select a trusted OIDC service (e.g., an enterprise-configured provider) and obtain actual issuer, authorization and token endpoint metadata from the provider, with exactly registered web redirect and a **public** OAuth client.
2. Verify the chosen provider issues an API-audience signed JWT access token accepted by Telvyo's server verifier, and configure JWKS/issuer/audience on the **server**; ensure metadata discovery, key rotation, signed-token type, expiry and audience are audited.
3. Review whether a BFF-based browser model is appropriate to avoid distributing access tokens to JavaScript. If choosing public-client PKCE, implement and audit CORS, exact origin, CSP, XSS controls and secure callback deployment.
4. Provide working user registration/login/account recovery/logout and native Android/iOS login through a system browser with registered redirect verification. Do NOT use an embedded WebView to capture IdP credentials.
5. Provide user-visible account and **separate optional** cloud-sync consent screens; connect authenticated consent and reviewed manual sync only after a real-token integration test, PostgreSQL/key provisioning, privacy review and rate limits.
6. Test multi-device sessions, token expiry, backend invalidation, logout, recovery, malicious callback attempts, concurrent revocation, network failures, accessibility and real phone behavior.

## Standards

- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html) — exact redirects, authorization code with PKCE, no implicit/password grant, protection against CSRF and mix-up.
- [RFC 10017: OAuth 2.0 for Browser-Based Applications](https://www.rfc-editor.org/rfc/rfc10017.html) — browser threat model, public-client constraints, PKCE, token handling and BFF alternatives.
- [RFC 9207: OAuth 2.0 Authorization Server Issuer Identification](https://www.rfc-editor.org/rfc/rfc9207.html) — issuer response guidance.
- [RFC 8252: OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html) — separately required for system-browser native authentication.

## Verification

`tests/oidc-pkce.test.mjs` exercises PKCE S256, randomness, exact redirect, expiry, callback replay, state and issuer mismatch, fragment rejection, blocked storage, invalid provider tokens, failed private-API verification, in-memory expiry, logout and token/secret non-persistence. These are deterministic tests with **mocked IdP/private API**; they do not establish compatibility with any actual provider or verify tokens end-to-end.

**Live environment policy:** After GitHub CI, merge source only. Deploy public static assets using the protected release script if appropriate; `client/oidc-pkce.js` must not appear in the document root or be loaded by the public index. Keep private sync/API routes inaccessible until provider integration and full security review.
