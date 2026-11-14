# Ghana carrier integration research

Verified against official public documentation on 14 November 2026. No production credentials, subscriber records, messages, purchases, or carrier accounts were accessed. This document separates documented products from an integration that has actually been provisioned and tested.

## Decision

MTN has relevant public developer documentation that explicitly lists Ghana. Production access still requires MTN approval and Ghana-specific validation. Telecel Ghana and AT subscriber billing APIs were not verified in the public official material searched; their consumer apps and USSD services are not evidence of an authorized third-party API. Do not mark any of the three carriers connected until its approved integration succeeds.

## MTN Ghana

| Need | Verified official documentation | What remains to validate |
| --- | --- | --- |
| Remaining plan/data balance | [Plans v2](https://developers.mtn.com/products/mtn-customer-plans-api-v2) lists Ghana. Its [OpenAPI specification](https://developers.mtn.com/products/mtn-customer-plans-api-v2/download/swagger) documents `GET /customers/{id}/plans` and `GET /customers/{id}/plans/{productCode}`; the latter retrieves plan balance details. | Which Ghana balance buckets, units, expiry fields and customer identifiers are enabled for the approved app. Do not interpret a wallet balance as airtime. |
| Airtime/profile summary | [Profiles V2](https://developers.mtn.com/products/mtn-customer-profiles-api-v2-product) lists Ghana. Its [specification](https://developers.mtn.com/products/mtn-customer-profiles-api-v2-product/download/swagger) contains customer summary and balance structures. | Exact Ghana main-account airtime field, prepaid/postpaid behavior and allowed response fields. A shared schema does not guarantee every market returns every field. |
| Usage, call records, top-ups | [Usage Management](https://developers.mtn.com/products/usage-management) explicitly advertises subscriber usage history, out-of-bundle charges and recharge history, with Ghana listed. Its [specification](https://developers.mtn.com/products/usage-management/download/swagger) documents `GET /usage/{id}`, `GET /usageCharge/{id}`, and `GET /recharge/{id}`. | Ghana routing and permissions, record latency, historical retention, pagination, rated voice charges and whether all bundle purchase/activation timestamps are available. An out-of-bundle charge endpoint alone does not prove complete per-call billing coverage. |
| Subscriber verification/consent | [Consent Validation V1](https://developers.mtn.com/products/ayo-preapproval) lists Ghana. Its [specification](https://developers.mtn.com/products/ayo-preapproval/download/swagger) documents `POST /consent/{customerId}/generateotp` and `POST /consent/{customerId}/verifyotp`. | Approved end-user consent flow, OTP requirements, claims and identifiers. This does not establish a generally available silent SIM-authentication flow. |

The above OpenAPI documents identify `https://api.mtn.com/v1` as their production base and OAuth 2.0 client credentials for API authentication. That authenticates the integrating application; it does not itself prove ownership of an arbitrary subscriber number or grant unrestricted access. Store integration secrets on the server and follow the market's approved subscriber-consent process. The consent OTP generation operation also declares authorization/claims headers, so merely supplying an MSISDN is insufficient. [Plans specification](https://developers.mtn.com/products/mtn-customer-plans-api-v2/download/swagger), [consent specification](https://developers.mtn.com/products/ayo-preapproval/download/swagger).

MTN's [current FAQ](https://appx.developers.mtn.com/faq) describes sandbox access, separate production review, and product approval by the selected market administrator. Its [terms](https://developers.mtn.com/terms-and-conditions) distinguish development/testing access from production use. Obtain product approval and contractual scope for a cross-carrier consumer dashboard before enabling live adapters. Public documentation is a credible integration lead, not proof that this app is approved.

Two similarly named products must not be substituted without checking geography:

- [Balance Management V1](https://developers.mtn.com/products/balance-management-v1) currently lists Côte d'Ivoire, Liberia, Nigeria and Zambia; Ghana is absent.
- [Customer Authorization](https://developers.mtn.com/products/mtn-nigeria-customer-authorization) lists Nigeria only and shows no available specification.

[MTN MoMo Get Balance](https://momodeveloper.mtn.com/content/html_widgets/7f0h8.html) reads the default financial account connected to an API user. It is not a consumer's mobile airtime or remaining data balance. MoMo payment or reseller top-up access must not be presented as access to subscriber billing history.

## Telecel Ghana and AT

Targeted searches of the official carrier domains did not locate public subscriber authentication, airtime/data-balance, bundle-history or rated-call API specifications. This is a research limitation, not proof that private partner APIs do not exist. Production implementation should remain pending carrier-provided documentation, credentials and written product scope.

- Telecel's official [contact page](https://telecel.com.gh/contact-us/) publishes a business contact route. Its [data usage page](https://play.telecel.com.gh/data-usage/) is a consumer request form for **broadband** usage within a month; it does not document a mobile SIM API. Ask Telecel's business/API team for consented mobile subscriber balance and rated-usage access.
- AT's official [customer care page](https://www.at.com.gh/personal/customer-care) describes checking relevant balances through its mobile app and USSD. Its [top-up page](https://www.at.com.gh/personal/topup-recharge) describes consumer recharge channels. Neither establishes a public developer contract. Confirm partner access directly with AT before implementing live requests.
- Third-party airtime/data reseller APIs can support purchases made through that reseller. They do not, by implication, reveal a subscriber's remaining balance, historical purchases made elsewhere, or exact billed cost of every call.

## Tariffs and exact cost

Use official [MTN tariffs](https://mtn.com.gh/personal-home/tariffs/), [Telecel tariffs](https://telecel.com.gh/personal/mobile/offers/tariffs/) and [AT bundle terms](https://www.at.com.gh/learn-more/at-unlimited-data-bundles-) as dated reference sources. Validate each plan's billing unit, tax treatment, rounding interval, destination category, promotional rules and effective date before calculations. Avoid deriving a per-second rate from a page that omits the unit.

A duration multiplied by a published rate is an **estimate**. A historical **actual billed cost** must come from the carrier's rated record or an authentic imported statement. MTN's [Free After 1 Extra terms](https://mtn.com.gh/wp-content/uploads/2025/04/MTN-FA1-Extra-Terms-and-Conditions-Updated-2025-Final.pdf) illustrate why a flat duration formula can fail: the plan has conditional first-minute/bonus rules. Do not use the prices in old terms as current rates.

## Native platform boundaries

| Platform | Available capability | Limit for this product |
| --- | --- | --- |
| Android | `SubscriptionManager.getActiveSubscriptionInfoList()` exposes active subscriptions with `READ_PHONE_STATE` or carrier privileges. [Android reference](https://developer.android.com/reference/android/telephony/SubscriptionManager#getActiveSubscriptionInfoList()) | An active subscription is not authentication to carrier billing. Permission denial, empty lists and device differences need explicit handling. |
| Android | `NetworkStatsManager` can expose device/app traffic with user-granted Usage Access. From API 29, subscriber-ID access has additional restrictions; passing `null` returns aggregate mobile-network usage. Detail buckets can span hours. [Android reference](https://developer.android.com/reference/android/app/usage/NetworkStatsManager) | Ordinary applications cannot promise accurate per-SIM attribution on every device. Device byte counters are not remaining carrier bundle balances or billed charges. |
| iOS | `CTCarrier` is deprecated; Apple DTS states there is no replacement. [Apple documentation](https://developer.apple.com/documentation/coretelephony/ctcarrier), [Apple DTS explanation](https://developer.apple.com/forums/thread/714876) | Do not promise automatic carrier/SIM discovery from this API. Use an approved carrier sign-in or user-selected line. |
| iOS | Apple DTS says no public API exposes other apps' per-app network usage; raw interface counters have caveats. [Apple DTS explanation](https://developer.apple.com/forums/thread/81833) | Do not promise Android-style per-app cellular consumption or carrier-accurate balance from device counters. |

## Requirements before enabling a live adapter

1. Approved Ghana market/product access and server-side credentials.
2. Documented subscriber verification, consent scopes, revocation and expiry.
3. Confirmed field mapping for airtime, data buckets, activation/purchase time, validity, usage units and rated costs.
4. Real, consented test-account checks for multiple SIMs, number portability, bundled versus out-of-bundle calls, top-ups, refunds, stale records and permission denial.
5. UI provenance for each value: carrier reported, imported, device measured, estimated or demonstration. Record `observedAt` and preserve the carrier's own event timestamp separately.

Until these requirements are satisfied, the reviewable app can provide demonstration data, explicitly labelled estimates and user-authorized imports; it must not claim live SIM connection or carrier verification.
