# Telvyo Android real-device QA: internal APK

**Release status: internal debug build, NOT a production or Play Store release.** The APK is made by GitHub Actions from the exact commit being tested. It uses a debug signing key; it is not the organization's future release identity. Never enter production carrier credentials or privileged subscriber data in a debug build.

## Download the internal build

1. Open the [Telvyo GitHub Actions quality-gates runs](https://github.com/christianagbotah/telvyo/actions/workflows/ci.yml) while signed into the repository account.
2. Open a successful workflow run for the commit you intend to test.
3. Under **Artifacts**, download the `telvyo-android-internal-qa-<commit>` artifact (available for up to seven days).
4. Extract `app-debug.apk` and install it on a **test device** using Android's built-in installation flow, reviewing the source and app permissions. Disable installation from unknown sources again afterward.
5. Record the tested commit SHA, Android version, device model, date, SIM type and test result. Only test with SIMs/accounts whose owner explicitly consents.

The artifact is not a public permanent download, an auto-update channel, or proof of production signing. Do not replace release signing with a debug key. Manual backups are important before reinstalling because local records may be cleared.

## Acceptance checklist

- [ ] **Clean install**: Telvyo opens to personal onboarding; sample records are separate and labelled; no cloud login or carrier balances are claimed
- [ ] **SIM detection**: grant Phone permission; confirm available carrier names/slot; test single SIM, dual-SIM and eSIM as supported on the device; never expose a phone number or IMSI
- [ ] **Denied/revoked permission**: deny Phone permission, then revoke after first grant; detect offers a safe explanation and does not erase manually entered SIM profiles
- [ ] **Usage Access**: enable through Android Settings; query 1, 7 and 30 days; check Android 10+ compatibility and meaningful timestamp/freshness labels
- [ ] **Combined mobile scope**: verify usage is clearly all-mobile, not falsely attributed to SIM 1 or 2; compare totals qualitatively with the OS and document expected bucket delays
- [ ] **App grouping**: evaluate system/unknown UID groups, foreground/background when reported, and unusual permissions on devices from different manufacturers
- [ ] **Manual ledger**: add SIM profile, bundle purchase, call and app usage; edit, delete and export; ensure OS snapshots do not silently count again as manual purchases/usage
- [ ] **Offline behavior**: launch in airplane mode after first opening; add/edit records; reopen the app; export and restore a backup
- [ ] **Privacy**: verify there are no SMS, contact, call-log or location permission prompts; carrier and cloud AI connection status remains explicitly unavailable
- [ ] **UI and accessibility**: 320–430 px phone layouts, navigation/More menu, text scaling, screen reader labels, buttons, safe-area insets, modal keyboard controls and rotation
- [ ] **Failure handling**: simulate missing network, disabled permissions, OS restrictions and storage errors; show nontechnical, actionable messages without exposing keys or traces
- [ ] **Upgrade test**: install a newer internal APK over an older debug build, verify local records remain where Android permits and backup/restore is still possible

## Sign-off record

| Field | Value |
| --- | --- |
| Build commit | |
| CI run URL | |
| Device/model + Android version | |
| SIM configurations exercised | |
| Core functional result | |
| Permission/usage result | |
| Open defects/links | |
| Tested by + date | |

Only after this device matrix, release-key custody, app privacy declarations, store compliance and regression checks are complete should the team create a signed Play Store release candidate. iOS has a separate build/signing and device-QA gate.
