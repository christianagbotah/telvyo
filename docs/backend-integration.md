# Server integrations and access requirements

Status: the hosted owner-admin Worker provides configuration status and a protected MTN application-authentication check. The separate Node service described below remains undeployed and disconnected from the tracker. No subscriber-data feed or cloud AI is connected. The tracker advisor uses explicitly labeled local calculations. See [admin setup](admin-setup.md) for secure runtime-secret configuration.

## Run and configure the service

Requires Node 22+. Install with `npm ci --prefix server`. Configure secrets in the hosting platform or an untracked local environment file. Run `node --env-file=server/.env server/index.js` behind HTTPS with a bounded reverse proxy. The default listener is loopback only.

`server/.env.example` lists the names. A deployment needs an identity provider that issues signed RS256/ES256 access tokens with `sub`, `iat`, `exp`, issuer and audience. Configure `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE` and the exact HTTPS `WEB_ORIGIN`. Implement the web/mobile sign-in and secure token lifecycle before wiring the advisor UI to the server; no token entry or bypass is built into the client.

`GET /v1/status` reports configuration availability. `POST /v1/advisor` requires an access token, explicit `consent: true`, a question and a closed aggregate schema. The service rejects unknown fields, unauthenticated requests, disallowed browser origins, oversized bodies and excess requests. It calls OpenAI's Responses API only with `OPENAI_API_KEY` and `OPENAI_MODEL` configured, uses a 20-second timeout and `store: false`, and returns sanitized errors. It does not log questions, usage values or tokens.

Only `source`, `daysObserved`, `averageDailyMB`, `backgroundShare` and `projectedDaysRemaining` are accepted in `summary`. No call list, contact names, subscriber number, package list or raw usage history is accepted. Questions themselves may contain information a user chooses to type; the consent UI must explain that the question and summary go to the configured AI provider. `store: false` is not a promise of zero provider retention; review the provider's applicable data controls and terms.

The rate limiter is process-local and bounded. Multi-instance production deployment needs a shared limiter or API gateway. Add operational monitoring, a secrets-rotation policy and audited deployment controls before launch. The source tests use stub provider responses; they do not establish live account access or provider availability.

## Private encrypted cross-device snapshot foundation — not activated

The Node service now has a source-only, **opt-in encrypted sync** backend. See [private sync architecture, migration steps, security and remaining launch gates](private-sync-foundation.md). It is not publicly reverse-proxied, and web/mobile sign-in and sync UI are not connected.

- Apply `server/migrations/001_privacy_consent.sql` and **then** `002_sync_snapshots.sql` to an approved, isolated PostgreSQL instance; provide a dedicated least-privilege runtime DB role.
- Configure a protected, unique 32-byte base64 `ACCOUNT_SYNC_ENCRYPTION_KEY` separate from `ACCOUNT_HASH_KEY`. Do not rotate either without planning how to migrate existing encrypted records.
- `POST /v1/privacy/cloud-sync` with the current policy version explicitly opts an authenticated account into cloud sync; `DELETE` revokes and clears encrypted records. `GET /v1/privacy` reports separate AI and sync consent states. None of this is permission to access MTN, Telecel or AT subscriber billing.
- `GET /v1/sync`, `PUT /v1/sync` and confirmed `DELETE /v1/sync` require verified JWT identity. Reads and writes additionally require a server-side current sync consent check. Writes require an expected revision and return 409 instead of silently overwriting newer data.
- All cloud-sync reads/writes and grant/revoke/delete mutations share a **per-account PostgreSQL transaction-scoped lock**. Consent is checked using that same DB transaction: uploads cannot commit after revocation. The isolated PostgreSQL CI test exercises both upload-first and revoke-first cases. The lock and version check do not replace identity-provider security, consent UX or abuse rate limits.
- Snapshots are AES-256-GCM encrypted before entering PostgreSQL, authenticated to the pseudonymous account key and revision. The server can decrypt them for authorized responses; this is **not end-to-end encryption** or a claim of zero operator access.
- Clearing cloud sync retains a pseudonymous revision tombstone to stop stale devices restoring an erased snapshot, not a raw subscriber identifier or the erased ledger. Retention and data protection review remain required.

**Release gates:** OIDC/PKCE login on web + Android, access token lifecycle, explicit sync opt-in UX, conflict resolution, post-revoke concurrency tests, rate limits, formal deletion/retention controls, backups, audits, physical-phone testing and a privacy/legal assessment. Existing device records remain local until a customer separately and explicitly chooses to upload. No public API is activated by this addition.

## MTN Ghana adapter

The internal `server/mtn.js` adapter implements the documented production host and paths:

- OAuth client credentials: `POST https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials` with a form body containing `client_id` and `client_secret`.
- Customer Plans is a **separate MTN product**, not included in the currently approved Usage Management v3 contract. It is not callable through this adapter without separate product approval.
- Usage: `GET /usage/{id}`.
- Out-of-bundle charges: `GET /usageCharge/{id}`.
- Recharges: `GET /recharge/{id}`.

The reviewed [Usage Management v3.0.0 Swagger](https://developers.mtn.com/products/usage-management/download/swagger) was updated 11 November 2026. `GET /usage/{id}` and `GET /usageCharge/{id}` require the `countryCode` header and `usageType` query parameter. They use `pageNumber` for pagination. `GET /recharge/{id}` permits a `countryCode` header but uses **`pageNum`**, not `pageNumber`; its optional `historyType` is supported. These operations belong to the documented `usagemanagementsssd` group. 

Usage requests require explicitly approved `countryCode` and `usageType` values. Public shared schemas do not establish Ghana's enum values, timestamp formats, all billing units or the complete rated-call fields. The adapter deliberately does not assume GH/GHA, seconds, cedis or bundle sizes. It returns the raw provider payload with operation and fetch-time provenance and `mapped: false`. A Ghana-tested normalizer must map units, currency, event times, freshness, pagination and errors before any figure can appear as a verified balance or charge.

The adapter requires an internal authorization context matching customer, operation scope and expiry. **Do not pass a client-supplied consent object to this adapter.** There is no public subscriber-data route. First implement MTN-approved verification/consent and an authoritative server-side mapping between the signed-in user and carrier customer account, including revocation. Application OAuth alone does not authorize arbitrary subscriber access.

Needed from MTN: Ghana production product approval for Plans/Profiles/Usage, approved customer verification and consent, server credentials, consented test accounts, country/usage routing values, field definitions, rate limits, history/latency guarantees and product terms. Exact per-call cost must come from a rated record; multiplying duration by a flat tariff remains an estimate.

## Telecel and AT

No unverified endpoints have been invented. Obtain private partner documentation and access for consented subscriber balances, purchases and rated usage. Retail top-up APIs, MoMo wallets and consumer USSD codes are not replacements for subscriber billing access.

See [official carrier research](carrier-integration-research.md) for verified product links, exclusions and the contact routes. No carrier was contacted on the user's behalf.

## Before customer release

Complete live contract testing with consented subscribers, authenticated account mapping and revocation, web/mobile login, shared rate limits, audit/monitoring and privacy review. Reconcile measured OS traffic with carrier-rated traffic without assuming they must match. Keep provenance and measurement timestamps visible, and test zero/stale/missing values, refunds, promotion rules, number portability and dual-SIM changes.

## Private customer identity and consent foundation (not yet publicly activated)

The server includes a consent API backed by PostgreSQL. It **requires valid OIDC issuer, JWKS, audience, a 32+ byte random `ACCOUNT_HASH_KEY`, an isolated PostgreSQL `ACCOUNT_DATABASE_URL`, and the migration at `server/migrations/001_privacy_consent.sql`. The deployment is **not connected** to a customer identity provider or published on the VPS. Never proxy these routes until those dependencies, TLS and real-token login are tested.

The server derives a pseudonymous HMAC-SHA256 account key from the verified issuer and subject. Raw email, phone numbers and OIDC subjects are never written to the consent table. Only AI aggregate-processing consent can be granted with the server-recognized policy version `2026-11`. Carrier permission is never granted through this API; each network requires its separately approved subscriber-verification and consent flow.

- `GET /v1/privacy`: signed-in customer's current AI consent status and clear data-provenance limits.
- `POST /v1/privacy/ai-advisor`: explicit `{ "granted": true, "policyVersion": "2026-11" }` from a verified account.
- `DELETE /v1/privacy/ai-advisor`: revokes AI processing consent immediately by appending a new event.
- `DELETE /v1/privacy/records`: explicit `X-Telvyo-Confirm: DELETE_CLOUD_RECORDS` deletes the authenticated customer's server-side consent history only; it does **not** delete the identity-provider account or phone-local records.

The advisor gateway now **fails closed** unless it has a server-side consent checker. It checks the authenticated account's *latest* consent and current policy version for every AI request; a client-supplied `consent: true` field is never sufficient. A missing PostgreSQL connection, missing identity configuration, absent consent or revoked/expired policy prevents provider access. The PostgreSQL store uses parameterized queries. Use a dedicated low-privilege DB role, transport encryption for remote DB hosts, protected backups, rotation planning for the HMAC key, and privacy/compliance review before live use.

This foundation is not a complete sign-in flow or automatic carrier linking. Remaining: choose and configure an identity provider, implement PKCE on web/native clients and secure token lifecycle, deploy the database migration, obtain carrier approvals, add rate limits and monitor all customer consent transitions without recording sensitive payloads.

## MTN application-credential check (private; no subscriber queries)

MTN's current OAuth guide confirms that the approved Consumer Key and Consumer Secret are the production app credentials for the `client_credentials` flow. Never put them in source, GitHub, public JavaScript or screenshots. Use the private file `/home/lightworld/.config/telvyo/mtn.env` (outside the web document root, owner-only `0600` permissions) with exactly `MTN_CLIENT_ID` and `MTN_CLIENT_SECRET`. An operator can enter their own credentials directly through an authorized secure VPS session.

After securely filling that file, run from the private source checkout:

```bash
cd /home/lightworld/.telvyo-source
node --env-file=/home/lightworld/.config/telvyo/mtn.env scripts/check-mtn-token.mjs
```

The output contains only success/failure and expiry timing, **never a token or secret**. This verifies **application** authentication only; it does not grant subscriber access, verify Ghana's `countryCode` or `usageType` values, or establish carrier consent. Do not enable any public subscriber API before MTN confirms its subscriber ownership/consent procedure, test MSISDN, permitted routing values and response units. No live provider request is made until an operator adds credentials and runs the check.
