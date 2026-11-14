# Verification — 14 November 2026, connected tracking upgrade

## Passed

- `npm test`: **45 tests/checks, 0 failures**. Covers data accounting, local insight math, unknown/missing history, anomalies, timezone boundaries, native bridge scope, onboarding, unset rates, authentication/consent, provider error handling, CSV/backup behavior, workspace separation and blocked-storage recovery.
- `npm run check`: all browser and server ES modules parse successfully.
- `npm audit --prefix server --omit=dev`: **0 reported vulnerabilities** in the installed server production dependency tree at check time. This is not a security audit or guarantee.
- Capacitor Android/iOS sync: web assets copied; Filesystem and Share registered. Android custom TelcoDevice plugin is registered by MainActivity.
- Android `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug`: **BUILD SUCCESSFUL** with JDK 21, SDK 36.
- Android JUnit report: **10 tests, 0 failures, 0 errors**. Covers timestamp windows, byte aggregation, tag/UID duplication, partial days, daylight-saving gaps and repeated midnight.
- Android lint: **0 errors, 27 warnings**. Non-blocking warnings include template/dependency/resource/icon-density/unused-resource findings. Review these during release cleanup; a successful debug build is not a release approval.
- A midnight-overlap bug was reproduced by a failing Havana timezone test, fixed using the earliest valid local day boundary, and verified by the passing native suite.
- The fresh-personal-workspace call form initially failed when no tariff existed. The regression now verifies actual-charge entry with the estimate option disabled; the fixed UI passes.

## Verification limits

No physical Android devices or emulators were used for real SIM permissions, cellular traffic or package-label checks. No real MTN/Telecel/AT subscriber was queried. The backend provider tests use controlled responses, and no live AI provider request was made. No API secrets were supplied. Identity/consent UI wiring is not complete.

iOS source and asset sync are included, but no macOS/Xcode build or iOS device test ran. Browser visual/accessibility QA was unavailable because the managed environment did not expose its required browser tool; DOM tests verify behavior, not rendering. The Android APK is debug-signed for testing and requires organization-owned release signing and physical-device validation before distribution.

## Telvyo rename — 14 November 2026

- Updated visible web branding, exported report/backup names, Android/iOS display names, native permission help, and documentation.
- Retained browser storage keys, native package/bundle identifiers, bridge names, and authentication audience. Existing backup files remain readable.
- Re-ran the web/backend suite: **45 checks, 0 failures**; all JavaScript syntax checks passed.
- Synced Android and iOS assets. Rebuilt Android **0.2.1-preview, version code 3** and re-ran native unit tests: **10 tests, 0 failures, 0 errors**.
- Verified embedded Android web assets match the renamed app and exclude deployment-only downloads. iOS display name is updated in source; macOS compilation and physical-device checks remain outstanding.
- New downloads use the Telvyo name; legacy download paths are retained as aliases.

## Owner administration — 14 November 2026

- `npm test`: **76 checks, 0 failures** (45 existing tracker/backend checks, 17 admin API checks, 10 admin UI checks, and 4 hosted routing checks).
- `npm run check`: browser, Node and Worker JavaScript parse successfully.
- `npm run build:hosted`: Worker and client asset builds succeed with Vite 8.3.8, Cloudflare Vite plugin 1.69.1 and Sites plugin 0.2.0.
- Owner identity and email allowlist, public-site routing guards, origin checks, bounded requests/responses, credential redaction, fixed provider URL, shared cooldown, configuration rotation, and UI timeout/error states are covered.
- Independent security review identified R2 same-key write spacing; the regression reproduced failure and the corrected implementation passes. The scoped re-review found no remaining issue.
- Numeric-string OAuth expiry responses are supported with strict validation.
- Runtime secrets remain in Sites Settings. No actual MTN token request or subscriber lookup was made; live credentials and approved product details are still required.
- Browser visual QA and an actual owner sign-in session were unavailable here. Android/iOS native code and APK are unchanged by this web administration update.
