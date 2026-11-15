# Encrypted customer sync — private backend foundation

**Status: source-code foundation only. NOT activated on the public Telvyo app.**
The current production site continues to store manually entered records on each device. Nothing in this development round changes the public web app, enables account registration, or transmits existing personal records to a server.

## Purpose and threat boundary

Provide an **optional** single-account encrypted cloud snapshot service so that a customer who later signs in on multiple devices can choose to back up/restore their manual Telvyo ledger. This is not live background synchronization, CRDT merging, a carrier subscriber connection, or an automatic replacement for device-local data.

The Node service is deliberately loopback-only by default, requires an **independently configured OIDC identity provider** issuing verified RS256/ES256 JWTs, and **cannot activate** without a PostgreSQL store, exact HTTPS allowed web origin, signed token issuer/audience/JWKS, a 32+ byte account HMAC key, separate 32-byte AES-256-GCM encryption key, and current **server-recorded cloud-sync consent**.

The database never stores a raw email address, OIDC subject or telephone number as an account key. It stores an HMAC-derived pseudonymous key and encrypted snapshot bytes. **However the Node process temporarily handles decrypted contacts, SIM labels and purchases to validate and return them to a signed-in user.** Server-side encryption at rest is **not end-to-end encryption** or zero-knowledge storage. Approved operators with access to the encryption key and database can potentially recover data; key custody and access controls matter.

## Activation prerequisites (not yet satisfied)

1. Approve and deploy an OIDC provider and secure client login with PKCE for web and Android. Verify actual issuers, audience, JWKS rotation, token expiry, logout and token storage. Avoid pass-through tokens in logs or URLs.
2. Provision a dedicated locked-down PostgreSQL database, TLS for remote access if applicable, and least-privilege runtime role. Apply `server/migrations/001_privacy_consent.sql`, then `002_sync_snapshots.sql`.
3. Store `ACCOUNT_HASH_KEY` and a **separate** `ACCOUNT_SYNC_ENCRYPTION_KEY` in a protected secret store, never in source, public JS, GitHub or support screenshots. Generate a distinct cryptographically random 32-byte key in canonical base64 for the latter; do not confuse it with MTN credentials. Rotation requires a migration/re-encryption procedure.
4. Deploy only behind HTTPS and authenticated API routing, with rate limits, payload-size limits, monitoring without personal payloads, backups, encrypted database exports, operational alerts and incident/retention policy. Do not point Cloudflare or Nginx public routes at an untested internal service.
5. Implement a **separate, explicit customer opt-in UI** that explains what is stored, revocation and deletion. Do not silently upload legacy device records. Cloud sync consent is distinct from AI processing and carrier subscriber authorization.
6. Build cross-device conflict-resolution UX: fetch the latest revision, present local vs remote differences, require an explicit choice, protect locally unsynchronized data, and never automatically replace local records. Test offline and concurrent device writes.
7. Complete privacy/legal review under applicable Ghana data protection requirements and QA on physical Android devices and mobile browsers before enabling real customer access.

## Private API contract (not published)

After signed authentication:

- `GET /v1/privacy` shows current AI processing and separate cloud-sync policy states.
- `POST /v1/privacy/cloud-sync` body `{"granted":true,"policyVersion":"2026-11"}` explicitly opts in to cloud snapshots.
- `DELETE /v1/privacy/cloud-sync` revokes opt-in **and clears encrypted snapshot data**, keeping only a pseudonymous deletion tombstone with revision to prevent stale replay.
- `GET /v1/sync` returns `{"revision":0,"ledger":null}` if no previous snapshot, or the authenticated customer's encrypted-at-rest ledger decrypted for delivery over authorized HTTPS, subject to current server-side consent.
- `PUT /v1/sync` accepts exactly `{"expectedRevision":0,"ledger":{"version":1,"sims":[],"purchases":[],"usage":[],"calls":[]}}` (with the user's validated collections). A successful save increments revision. If another device modified or deleted the snapshot, **409 Conflict** returns `currentRevision`; the server does not choose a winner or silently merge.
- `DELETE /v1/sync` with `X-Telvyo-Confirm: DELETE_SYNC_DATA` removes the ciphertext and increments the tombstone revision even if cloud consent has since been revoked. It does not delete the identity-provider account or local files.
- `DELETE /v1/privacy/records` with `X-Telvyo-Confirm: DELETE_CLOUD_RECORDS` removes available encrypted sync data before clearing cloud consent events, while leaving device records and the external IdP account untouched. On a backend failure, do **not** report successful deletion.

All endpoints require signed bearer identity. `GET/PUT` sync additionally require current *server-side* `cloud-sync` opt-in. Cross-site browser requests are allowed only from the exact configured HTTPS web origin; native mobile requests without an Origin still require JWT. HTTP responses are `no-store`. The sync body has explicit size ceilings and strict record schemas. Arbitrary extra fields, future-dated records, duplicate IDs and unknown SIM references are rejected. No carrier subscriber access is granted by these endpoints.

## Encryption and revision model

- AES-256-GCM with a fresh random 96-bit nonce for each snapshot write; associated authenticated data includes the pseudonymous account key **and revision**. Ciphertext cannot be replayed or decrypted under a different account/revision without failing verification.
- Only the ciphertext is stored in PostgreSQL `BYTEA`. The server keeps no plaintext revision history, but database backups and old copies of a ciphertext may require separate lifecycle controls.
- `UPDATE ... WHERE account_key = $1 AND revision = $2` and conflict-safe insert enforce a compare-and-swap revision. Two clients starting at the same revision cannot both overwrite each other; the loser receives 409 and must fetch/compare with an explicit user decision.
- **Consent-revocation race protection (new):** `withAccountLock` acquires a PostgreSQL transaction-scoped advisory lock based on the *pseudonymous account key*. Snapshot reads and writes check current `cloud-sync` consent **inside the same account transaction** before proceeding; opt-in, revoke+erase, cloud-records erase, and snapshot delete use the same lock. If an upload wins first, revocation waits and then erases its ciphertext. If revocation commits first, later uploads observe consent revoked and return 403. Transaction rollback leaves no partially erased snapshot/consent pair. The lock uses a per-account hashed key and is not a global rate limiter.
- An adversarial concurrency regression test in `tests/sync-postgres.test.mjs` uses two real PostgreSQL pool connections, holds an upload transaction while revocation starts, then confirms that revocation erases the completed upload and rejects a late upload. Mock tests assert that the transactional dependency is required; a store without `withAccountLock` returns 503 rather than using the original unsafe preflight-consent check.
- Deletion stores a **pseudonymous tombstone (account hash + incremented revision, no ledger)** so an offline device holding revision 0 cannot silently restore wiped data on reconnection. A completely de-identified deletion is not claimed while that tombstone is retained. Formal retention and erasure policy still require privacy review.
- Rotating either account HMAC or AES key without a migration will disconnect or make existing snapshots unreadable. Protect keys and test restoration before any rotation.

## Test evidence and launch exclusions

Mock tests cover identity isolation, consent, malformed and oversized requests, ciphertext tampering, missing configuration, conflicts, deletion tombstones, failure responses and source validation. An additional PostgreSQL integration test runs **only against the CI-created localhost `telvyo_test` database** and exercises both migrations and versioned snapshot operations.

Do **not** infer end-to-end production readiness from passing tests. Full device login, user-controlled syncing, database governance, safe race-free revoke/write behavior under adversarial concurrency, client merge decisions, operational logging and privacy review remain outstanding. Neither customer accounts nor live carrier data are activated by this source-code change.
