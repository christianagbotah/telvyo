# Telvyo release status and access requirements

This upgrade is a tested development build, not a production release certification.

## Implemented

- Yellow/ivory/charcoal design with Telecel red and AT blue accents.
- Android active-SIM discovery after Phone permission, and automatic refresh on opening once granted.
- Android 10+ mobile data measurements after Usage Access: app/UID, foreground/background where reported, daily totals and freshness. All mobile networks are combined; no false per-SIM attribution.
- Empty personal onboarding, separate sample records, preserved manual history and unconfigured rates for detected SIMs.
- Local completed-day analysis, conditional data forecasts, unusual-usage detection and evidence-based suggestions. The local advisor is explicitly rules-based.
- Internal MTN adapter using documented paths and a separate authenticated, consent-gated AI service. These are not live carrier/cloud-AI connections.
- Android test APK, iOS source, backups and exports.

## Needed from the business owner

1. **MTN Ghana:** developer organization/product approval, production client credentials, Ghana-specific field/routing definitions, an approved customer verification/consent flow and consented test subscribers. Relevant products: Plans v2, Profiles v2, Usage Management; check the approved scope of Consent Validation V1.
2. **Telecel and AT:** partner/API contacts, technical specifications, commercial approval, consent/identity requirements and test credentials. Public subscriber-billing endpoints were not verified.
3. **Identity and AI:** select an identity provider for web/mobile OAuth login; configure its issuer/audience/JWKS. Configure an AI provider account/model and server key. Implement sign-in and opt-in summary sharing before activating cloud AI.
4. **Distribution:** organization-owned Android release signing and Apple Developer signing. An Android debug APK is for testing. iOS needs macOS/Xcode for build and device testing.

## Platform boundaries that credentials do not remove

An ordinary iOS app cannot read other apps' cellular usage or historical carrier call logs, and reliable automatic SIM discovery is not generally exposed. Modern Android restricts per-SIM subscriber identifiers. Carrier approval or privileged access may change a specific integration's capabilities, but the app must not promise universal per-SIM OS attribution. OS usage can be delayed and aggregated; exact minute-level attribution is not guaranteed.

## Remaining release checks

Physical Android tests across manufacturers, single/dual SIM and eSIM, permission denial/revocation, package labels, background/foreground accounting and real cellular traffic; iOS build/safe-area/share-sheet tests; visual browser/accessibility testing; carrier billing reconciliation; account/consent revocation; secure token lifecycle; monitoring, shared throttling and recovery; privacy disclosures and store review. No automatic calling, purchasing or tariff changes are performed.

See the source package's docs/backend-integration.md, docs/carrier-integration-research.md and docs/android-telemetry.md for exact contracts and verification evidence.
