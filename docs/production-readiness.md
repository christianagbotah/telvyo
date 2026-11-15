# Telvyo production-readiness tracker

**Status: NOT READY FOR GENERAL RELEASE.** This is an engineering tracker, not proof of certification. Preserve the existing manual/offline tracker while verified carrier, account and distribution capabilities are developed. A successful CI run verifies source and build steps only.

## Release gates and evidence

| Gate | Current state | Required evidence |
| --- | --- | --- |
| Web source, backend tests and hosted Worker build | Automated checks added; first workflow run pending | Green GitHub Actions run on exact release commit |
| Native Android debug build and unit/lint checks | Automated checks added; first workflow run pending | Green Android job; review lint warnings |
| Mobile navigation and basic accessibility | More menu, keyboard dismissal, skip link and UI regression tests prepared | Physical phone/browser review at 320px–tablet, screen reader and keyboard |
| Web offline launch | Public-only static asset service worker and tests prepared | Install/update/offline smoke tests in Chrome and Safari, no admin/API caching |
| Local data privacy & removal | Full personal-workspace erase with explicit typed confirmation, storage-failure handling and demo isolation implemented | Browser and physical-device verification; exported backups/OS permissions are independent |
| Manual bundle expiry reminders | Optional user-recorded expiry with in-app warnings (72h upcoming, 7d recent), backup/CSV compatibility, and explicit source limitations | Verify timezone behavior and mobile UI; no auto-expiry deduction or carrier verification |
| Monthly spending budgets | Per-SIM optional cash limits and local-calendar comparison of manual data/airtime purchases, 80/100% warnings, demo isolation | Real-device/timezone verification; no double-counted prepaid calls, no claim of financial reconciliation |
| Browser security headers | CSP, nosniff, referrer and permissions policy prepared | Response-header smoke tests on production HTTPS domain |
| Carrier subscriber balances/charges | **Blocked: no approved live integration** | Carrier contract, production credentials, verified owner/consent, mapping and field-by-field reconciliation |
| MTN Ghana | Application-authentication test only; no subscriber API authorization | MTN production product approval, country/usage enums and consented test subscriber results |
| Telecel and AT | **Blocked: partner interface not established** | Approved integration contracts and test accounts |
| Sign-in and server sync | Server-side verified-identity consent ledger implemented in source; user login and sync **not activated** | OIDC/OAuth PKCE client, configured issuer/JWKS, migrations, token lifecycle, real identity integration and deletion tests |
| Cloud AI advisor | Rules-based local advisor exists; separate server not live | Auth, explicit opt-in, privacy terms, shared rate limits, cost monitoring and provider test |
| iOS | iOS source exists; no verified device build | Xcode archive, signing, functional and safe-area tests, store compliance |
| Android release | Debug APK only | Organization-owned signing, Play Console tests, target SDK/policy/privacy review |
| Operational resilience | Release process not demonstrated | Health probes, logs without PII, backups, incident response, rollback, retention and deletion tests |

## Safe staged release

1. **Internal preview:** keep manual balances and native device measurements clearly attributed. Do not enable cloud subscriber or AI flows. Review public web routes and run CI.
2. **Opt-in pilot:** add an approved login, verified subscriber authorization, revocation, privacy disclosures and precise carrier provenance; test with consented accounts only.
3. **Production candidate:** reconcile multiple carrier samples, complete threat modeling, data retention/deletion, accessibility, Android/iOS real device suites, signing and support runbooks.
4. **Launch:** capture approval from engineering, privacy/compliance and business owner against this table. Keep rollback instructions and immutable release SHA.

## Security / release rules

- Never commit API keys, OAuth secrets, signing keys, real subscriber identifiers or raw customer logs.
- No carrier-reported balances until authoritative account mapping, consent and verified units are in place.
- Never present a usage estimate or an OS aggregate as an official carrier-rated record.
- Protect production deployment behind tests and approvals. A green CI build is necessary, not sufficient.
- Do not change the existing Sites/Cloudflare hosting or create a separate AppDeploy production instance merely by importing the code: the current Worker depends on Sites identity and bucket bindings. Port identity, storage and admin authorization separately before any migration.
- AppDeploy can be used for a separate future staging build after an architecture migration is explicitly designed; team-wide plugin availability is controlled by the ChatGPT workspace administrator.

See also [release requirements](release-requirements.md), [backend integration](backend-integration.md), and [verification](verification.md).
