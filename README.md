# Telvyo — connected tracking preview

A mobile data and airtime app with a carrier-inspired yellow theme, a web preview, Android native measurements, iOS source, local analytics and prepared server integrations.

## What is implemented

- Android active-SIM discovery after permission; on reopening, already-granted access refreshes discovery automatically.
- Android 10+ `NetworkStatsManager` mobile traffic by app/UID and local day, with usage-source and read-time labels. Mobile networks are combined; measurements are never falsely assigned to one SIM or converted to a carrier balance.
- Personal onboarding starts empty. Demo records are separate. Existing records are preserved, and detected SIMs have no assumed call tariff.
- Manual purchase/usage/call records, per-SIM ledger filters, estimated versus entered costs, CSV exports, JSON backup/restore and native sharing.
- Local completed-day forecasts, robust unusual-day checks and evidence-based recommendations. The local advisor is rules-based and labeled accordingly.
- Internal MTN OAuth/resource adapter using official documented paths, plus a separate JWT-authenticated, consent-gated aggregate-only cloud advisor service. Neither is connected to a live provider account.

## Important limits

This is a tested development build, not a certified production release. Exact balances and charges require approved carrier access and a verified subscriber-consent mapping. MTN lists Ghana-relevant products; Telecel/AT partner APIs still require documentation. No public subscriber-data endpoint is exposed. The AI service is not deployed, and web/mobile login must be connected before enabling cloud AI.

Ordinary iOS apps cannot read other apps' cellular usage or historical cellular calls, or reliably discover all SIM details. Modern Android restricts per-SIM identifiers; this build reports combined mobile traffic. OS records may be delayed and aggregated. No call-log, SMS, phone-number or contact collection is implemented.

Recorded balances are arithmetic over entered records. They do not apply bundle expiry, promotions, rollover or unlogged adjustments. A flat call-rate calculation is an estimate. 1 GB = 1,000 MB. Dates follow the device timezone.

## Run and verify

Node 22.13 or newer is required for development tools. The native tracker assets in `dist/` are buildless. The hosted admin backend has a separate Worker build.

```sh
npm ci
npm ci --prefix server
npm test
npm run check
python3 -m http.server 5173 --directory dist
```

Open http://localhost:5173. The browser cannot access native SIM/usage APIs. Assets are self-hosted; no browser offline service worker is installed. Native web assets are packaged for offline launch.

## Owner administration

Open `/admin` on the hosted Site and sign in with the configured owner ChatGPT account. Administrative routes require Sites-injected identity plus the `ADMIN_OWNER_EMAIL` allowlist, even if the tracker is public. Do not expose this Worker directly through an untrusted host that permits spoofed identity headers.

Configure API credentials in **ChatGPT → Sites → Telvyo → More actions → Settings**, as runtime secrets. The admin page never accepts or returns credentials. It reports missing settings and can test the documented MTN production OAuth token endpoint. This checks application authentication only; subscriber consent and product access remain unverified. Sandbox and API-key tests require the exact approved product documentation. See [Admin setup](docs/admin-setup.md).

Run `npm run build:hosted` for `hosted-dist/server` and `hosted-dist/client`. The build stages copies of the tracker and downloads, adds hosted-only admin navigation, and leaves native assets unchanged. The Sites manifest declares the `BUCKET` storage binding for non-secret connection-check metadata and a shared test cooldown. Deploy the generated Worker through Sites; a plain local static server cannot run the admin APIs.

## Native apps

See [mobile/README.md](mobile/README.md) and [Android implementation](docs/android-telemetry.md). Install mobile dependencies, sync assets and build with the appropriate platform SDK. The Android APK provided with the preview is debug-signed for testing, not a store release. The iOS project needs macOS/Xcode, signing and device testing.

Before `npm run sync`, remove deployment-only downloads (all `dist/*.apk` and `dist/*source.zip`, including old-name aliases) if present. They are not needed inside the phone app. The source download excludes them.

## Integrations and release

- [Carrier API research](docs/carrier-integration-research.md): official products, paths, market constraints and sources.
- [Backend integration](docs/backend-integration.md): authentication, consent, secrets, exact contracts and deployment requirements.
- [Release requirements](docs/release-requirements.md): what needs provider approval and physical-device validation.
- [Verification evidence](docs/verification.md): automated results and remaining verification limits.

## Data handling

Manual records remain in WebView/browser local storage. Device measurements are session snapshots and do not modify the ledger. Explicit export/share creates files selected by the user. The native tracker makes no cloud AI or carrier call. A signed-in owner can explicitly request a server-side OAuth authentication check from the hosted administration page; it does not query subscribers. Clear device snapshots in Connections; export a backup before clearing app data. Android cloud backup/device transfer are excluded by configuration, but storage and operating-system behavior require physical-device validation before release.
