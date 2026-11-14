# Server integrations and access requirements

Status: the hosted owner-admin Worker provides configuration status and a protected MTN application-authentication check. The separate Node service described below remains undeployed and disconnected from the tracker. No subscriber-data feed or cloud AI is connected. The tracker advisor uses explicitly labeled local calculations. See [admin setup](admin-setup.md) for secure runtime-secret configuration.

## Run and configure the service

Requires Node 22+. Install with `npm ci --prefix server`. Configure secrets in the hosting platform or an untracked local environment file. Run `node --env-file=server/.env server/index.js` behind HTTPS with a bounded reverse proxy. The default listener is loopback only.

`server/.env.example` lists the names. A deployment needs an identity provider that issues signed RS256/ES256 access tokens with `sub`, `iat`, `exp`, issuer and audience. Configure `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE` and the exact HTTPS `WEB_ORIGIN`. Implement the web/mobile sign-in and secure token lifecycle before wiring the advisor UI to the server; no token entry or bypass is built into the client.

`GET /v1/status` reports configuration availability. `POST /v1/advisor` requires an access token, explicit `consent: true`, a question and a closed aggregate schema. The service rejects unknown fields, unauthenticated requests, disallowed browser origins, oversized bodies and excess requests. It calls OpenAI's Responses API only with `OPENAI_API_KEY` and `OPENAI_MODEL` configured, uses a 20-second timeout and `store: false`, and returns sanitized errors. It does not log questions, usage values or tokens.

Only `source`, `daysObserved`, `averageDailyMB`, `backgroundShare` and `projectedDaysRemaining` are accepted in `summary`. No call list, contact names, subscriber number, package list or raw usage history is accepted. Questions themselves may contain information a user chooses to type; the consent UI must explain that the question and summary go to the configured AI provider. `store: false` is not a promise of zero provider retention; review the provider's applicable data controls and terms.

The rate limiter is process-local and bounded. Multi-instance production deployment needs a shared limiter or API gateway. Add operational monitoring, a secrets-rotation policy and audited deployment controls before launch. The source tests use stub provider responses; they do not establish live account access or provider availability.

## MTN Ghana adapter

The internal `server/mtn.js` adapter implements the documented production host and paths:

- OAuth client credentials: `POST https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials` with a form body containing `client_id` and `client_secret`.
- Plans: `GET /customers/{id}/plans`.
- Usage: `GET /usage/{id}`.
- Out-of-bundle charges: `GET /usageCharge/{id}`.
- Recharges: `GET /recharge/{id}`.

Usage requests require explicitly approved `countryCode` and `usageType` values. Public shared schemas do not establish Ghana's enum values, timestamp formats, all billing units or the complete rated-call fields. The adapter deliberately does not assume GH/GHA, seconds, cedis or bundle sizes. It returns the raw provider payload with operation and fetch-time provenance and `mapped: false`. A Ghana-tested normalizer must map units, currency, event times, freshness, pagination and errors before any figure can appear as a verified balance or charge.

The adapter requires an internal authorization context matching customer, operation scope and expiry. **Do not pass a client-supplied consent object to this adapter.** There is no public subscriber-data route. First implement MTN-approved verification/consent and an authoritative server-side mapping between the signed-in user and carrier customer account, including revocation. Application OAuth alone does not authorize arbitrary subscriber access.

Needed from MTN: Ghana production product approval for Plans/Profiles/Usage, approved customer verification and consent, server credentials, consented test accounts, country/usage routing values, field definitions, rate limits, history/latency guarantees and product terms. Exact per-call cost must come from a rated record; multiplying duration by a flat tariff remains an estimate.

## Telecel and AT

No unverified endpoints have been invented. Obtain private partner documentation and access for consented subscriber balances, purchases and rated usage. Retail top-up APIs, MoMo wallets and consumer USSD codes are not replacements for subscriber billing access.

See [official carrier research](carrier-integration-research.md) for verified product links, exclusions and the contact routes. No carrier was contacted on the user's behalf.

## Before customer release

Complete live contract testing with consented subscribers, authenticated account mapping and revocation, web/mobile login, shared rate limits, audit/monitoring and privacy review. Reconcile measured OS traffic with carrier-rated traffic without assuming they must match. Keep provenance and measurement timestamps visible, and test zero/stale/missing values, refunds, promotion rules, number portability and dual-SIM changes.
