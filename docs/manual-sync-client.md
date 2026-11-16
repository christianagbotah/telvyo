# Consent-first manual cross-device sync client (source-only)

**STATUS: NOT ENABLED ON THE PUBLIC WEBSITE OR ANDROID APP.**

This round introduces a browser-compatible, dormant client-side foundation in `client/sync-review.js` and `client/manual-sync.js`. The modules are unit-tested in the repository but **are not imported by `dist/app.js`, copied to the public Webuzo document root, used by a scheduled service worker, or connected to a customer login**. No existing local Telvyo ledger is uploaded by this change.

## Purpose

A customer who later signs in with a verified identity provider may **manually** compare their device's records with an encrypted-at-rest account snapshot, make an explicit decision, and obtain conflict feedback. It is deliberately not automatic background synchronization and does **not** merge records without user review.

`reviewSyncChanges(local, cloud)` counts records in four groups (SIMs, data/airtime purchases, data usage, calls) and reports:

- Present only on the current device
- Present only in the cloud
- Same record ID with different contents
- Identical entries

It discloses that neither side is carrier-verified. There is no winner selection and no automatic cross-device merge. Unknown fields, invalid or duplicate records, oversized payloads, unknown SIM references and unsafe SIM metadata are rejected locally before upload. The server independently validates requests.

## Required future sign-in and privacy integration

The transport factory **must** receive a trusted exact HTTPS API origin, `fetch` implementation and an access-token callback from a real, configured identity session. There are no token constants or client secrets in the module. The callback must provide a valid ephemeral bearer access token issued to the Telvyo API; the **server** verifies the signature, issuer, audience and expiry. Browser tokens should not be placed in `localStorage`, URLs, logs or JSON backups.

Before activation, choose a reviewed OIDC/PKCE provider and implement web and native login/logout securely. Prefer a backend-for-frontend session approach for browser users when feasible to reduce browser token exposure. OAuth 2.0 Security BCP [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) and browser-based apps best practice [RFC 10017](https://www.rfc-editor.org/rfc/rfc10017.html) inform future implementation. No real IdP is configured today; no public account feature can be claimed.

Cloud provider authorization is separate from AI advisory consent and MTN/Telecel/AT subscriber access.

## Manual client behavior

- `status()`: explicitly retrieves consent state via `GET /v1/privacy`. No private records are fetched without an authenticated session.
- `enable({confirmation:"ENABLE CLOUD SYNC"})`: checks that the backend is available and the IdP account is connected, then sends a version-specific, explicit opt-in to `POST /v1/privacy/cloud-sync`. **This grants permission but uploads nothing.**
- `preview(localLedger)`: after server-confirmed consent, obtains the current snapshot with `GET /v1/sync`, validates its shape, calculates a SHA-256 fingerprint of local data and displays a side-by-side comparison plan. No local or remote changes occur. The server's integer revision is preserved.
- `upload(preview, currentLocal, {confirmation:"UPLOAD LOCAL"})`: verifies that the user explicitly chose to replace the cloud copy, that the local records have not changed since the preview, and submits a frozen copy with `expectedRevision`. Server 409 conflicts stop the operation; there is **no retry, merge or winner selection**. On success, the review is consumed; another upload requires a fresh preview.
- `useCloudCopy(preview, currentLocal, {confirmation:"USE CLOUD COPY"})`: verifies unchanged local records and the latest server revision. It returns a **proposed** cloud ledger without saving any local data. A future UI must send the proposed ledger through the existing reviewed JSON restore flow with its own explicit confirmation and durable storage safety checks.
- `disable({confirmation:"ERASE CLOUD COPY"})`: revokes cloud-sync consent and requests encrypted snapshot deletion. It does not delete the local device history or identity-provider account.

Transport details: exact HTTPS origin, only fixed same-account API paths, bearer header only, `no-store`, no cookies, no redirected requests, sanitized failures, and limited JSON responses. Tokens are supplied only when a real user operation runs; this module never persists them. There is **no autonomous polling, background sync, offline retry queue or client-side refresh token**.

## Remaining release blockers

1. Select and secure a production identity provider (or reviewed BFF), configure issuer, client(s), API audience, and PKCE login for web/Android.
2. Finish customer registration, verified identity recovery and logout; validate session/token expiry across multiple devices.
3. Provision and audit private PostgreSQL runtime role, migration, key custody and retention controls.
4. Build explicit account and consent screens, then wire the manual preview and confirmation experience. Include a human-readable record diff and warnings for deleting entries.
5. Connect the proposed cloud download to the existing fail-safe local restore screen. Do not replace or merge automatically.
6. Implement API rate limits, operational monitoring, secure CORS/CSP requirements, and adversarial security tests.
7. QA on physical Android phones and browsers, especially offline, multi-device races, user privacy and accessibility.
8. Only after those gates pass, enable customer cloud sync. Official carrier usage remains a separate integration and needs its own authorization.

**Tests:** `tests/sync-review.test.mjs` and `tests/manual-sync-client.test.mjs` cover permission gating, record validation, typed decisions, unchanged data fingerprints, stale cloud revision rejection, no automatic merge, no token persistence, offline responses, and local mutations during asynchronous requests. They are unit tests and do not establish that sign-in or customer sync works in production.
