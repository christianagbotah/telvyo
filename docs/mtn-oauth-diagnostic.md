# MTN Ghana OAuth diagnostic and escalation — 22 November 2026

**Status: BLOCKED by HTTP 401 at the production token endpoint. Subscriber access NOT tested and NOT enabled.**

## 22 November 2026 — verified private-VPS credential load

- The authorized VPS was checked live. `/home/lightworld/.config/telvyo/mtn.env` exists, is owned by `lightworld`, and remains private (`0600`).
- Node.js was run as `lightworld` with the explicit `--env-file=/home/lightworld/.config/telvyo/mtn.env` flag. Both `MTN_CLIENT_ID` and `MTN_CLIENT_SECRET` were **loaded and nonempty**; no credential contents were displayed.
- An authorized single OAuth check with those variables reached MTN and returned **HTTP 401**, without issuing a token. Thus missing env-file loading is **not** the explanation for this result; credential validity, product-level gateway provisioning and account/project routing still require MTN confirmation.
- The public `https://telvyo.lightworldtech.com/` returned HTTP 200. Its `/api/health`, `/api/mtn` and `/api/status` returned HTTP 404. The static customer website intentionally does not read the private env file or expose an MTN subscriber API.
- The owner has since created a new Telvyo application on the current AppX Ghana platform, with Usage Management and other customer products listed as approved. **This does not establish production token-gateway provisioning**; the 401 persists with the configured credential pair.
- VPS test suite: 158 total, **156 passed, 0 failed, 2 skipped**; source syntax checks passed. These results do not prove carrier access or live subscriber readiness.
- The private OAuth CLI now explicitly distinguishes loaded server environment variables from successful MTN authentication. It never prints credential values or response bodies.

## Grounded observations

- The account owner has an application named **Telvyo** under **Approved apps** at https://developers.mtn.com/apps, created on **14 November 2026**, country **Ghana**. The owner’s product selection screenshot shows **Usage Management** ticked. An approved application entry and a selected product checkbox do **not** prove that a given API product has a separately approved **production** subscription on the token gateway.
- Telvyo’s server-side key/secret configuration exists in `/home/lightworld/.config/telvyo/mtn.env` and is protected with owner-only `0600` permissions. Do not copy the values into GitHub, chat messages, logs or support tickets.
- The private VPS makes a single MTN application OAuth call using `POST https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials` with `Content-Type: application/x-www-form-urlencoded` and the Consumer Key and Consumer Secret as `client_id` and `client_secret` form parameters. **This matches MTN's specific published OAuth guide:** https://developers.mtn.com/getting-started/understanding-oauth-20
- A real credentialed request on 20 November 2026 received **HTTP 401**, with no allowlisted OAuth error code the new safe diagnostic could identify. No access token was issued. The provider's raw response, credentials and tokens were deliberately not displayed or persisted.
- The general MTN Security page also documents a **different** token path `/oauth/client_credential/accesstoken`: https://developers.mtn.com/categories/security . It is not automatically interchangeable with the specific OAuth guide's `/v1/oauth/access_token`. Do **not** send production secrets to arbitrary URLs or silently fall back to a second endpoint; ask MTN which route is provisioned for the exact product and application.
- MTN's current FAQ (https://appx.developers.mtn.com/faq) distinguishes app approval from product approval. It also notes a July 2026 migration for group/multi-market products; a newly created legacy-portal app may lack access to the newer platform. Whether **this particular Telvyo app** was affected requires MTN confirmation.
- The Ghana Usage Management product is listed at https://developers.mtn.com/products/usage-management . MTN's resource adapter builds `GET /v1/usage/{id}`, `GET /v1/usageCharge/{id}` and `GET /v1/recharge/{id}` requests under independent, verified subscriber consent. These resource calls have **not** succeeded against real carrier data; they are tested using safe mock fixtures. No physical subscriber identifier, actual balances or call costs have been tested or verified.

## Technical follow-up

1. Open the **existing Telvyo application** and inspect each subscribed product's state, not only the application status. Confirm Usage Management is **Approved** in the **production** environment for Ghana. A checked box in the app edit form alone may indicate selection, not approval.
2. Ask MTN to confirm whether the application created 14 November 2026 is provisioned on the production gateway and belongs to the proper Ghana market/project after the July 2026 migration. Check the new AppX Ghana app's product-level production provisioning and its project mapping; do not create additional duplicates unless MTN instructs you.
3. Ask MTN to identify the correct production OAuth token URL for this exact subscription, the required credential type and environment, and whether the Consumer Key and Secret displayed in the current application are active gateway credentials. Never email actual keys or secrets in plaintext.
4. Once MTN confirms, perform **one** authorized private-VPS OAuth smoke check using `runuser -u lightworld -- node --env-file=/home/lightworld/.config/telvyo/mtn.env /home/lightworld/.telvyo-source/scripts/check-mtn-token.mjs`. It prints only authentication outcome, HTTP status and a narrowly allowlisted OAuth error code, never token/body/credentials.
5. A successful token would prove **application authentication only**, not entitlement to usage records. Before any subscriber call: obtain Ghana-specific `countryCode` and `usageType`, production product scope, server-side consent/mapping, audit and revocation rules, and a consented test account. Never use an arbitrary mobile number as an authentication test.

## Ready-to-send MTN support request (NO secrets)

Subject: Ghana Telvyo Usage Management — Approved app, production OAuth HTTP 401

Hello MTN API Support,

Our Telvyo application is now present on the current AppX Ghana platform with Usage Management selected and an approved application listing. The private VPS has confirmed that both saved credential fields load, but the production API token request remains unsuccessful:

- Endpoint: `POST https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials`
- Content type: `application/x-www-form-urlencoded`
- Body parameter names only: `client_id` and `client_secret` (using the app's saved Consumer Key and Secret; values withheld)
- Result: **HTTP 401** reconfirmed on 22 November 2026; no access token issued

Please verify (1) whether this application and its **production Usage Management subscription** are approved and provisioned on the correct Ghana gateway/project; (2) whether the current AppX Ghana application's production gateway/project mapping and subscription are fully provisioned; (3) which documented OAuth endpoint and credential type is correct for this exact application; and (4) whether there is a gateway error or migration mapping issue explaining the 401.

We can provide the application ID and a redacted transaction/time reference through your authenticated support channel if needed. We will not transmit the Consumer Secret, access tokens or any customer subscriber information in email.

Thank you.

## Release/testing constraints

- This diagnostic improvement does not change the OAuth endpoint, business logic, sensitive-data policy or the public customer app. It only preserves **safe internal upstream HTTP status** and an explicit allowlist of OAuth codes, without logging provider response bodies, headers, raw exception messages or credentials.
- No extra credentialed endpoint probing, retries or unattended OAuth polling was introduced.
- Private source only; customer MTN endpoints remain HTTP 404 publicly.
