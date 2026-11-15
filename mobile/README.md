# Telvyo native shells

Capacitor wraps the static app in `../dist` for Android and iOS. The app ID is `com.telco.usage` and the display name is **Telvyo**. Both native source projects are included; these are not signed or device-tested binaries.

The app stores manual entries and labeled demo data locally. Android now discovers active SIMs after Phone permission and queries combined mobile app usage on Android 10+ after Usage Access. Granted access refreshes on app opening. Device snapshots stay separate from ledger records. It does not read call logs, SMS, phone numbers or carrier balances. iOS retains manual/provider-based paths because equivalent public device APIs are unavailable. See [platform support](../docs/platform-support.md) for the OS and store restrictions.

## Setup and sync

Use Node.js 22 or later, then run from this directory:

```sh
npm ci
npm run sync
```

`../dist/index.html` and the other static app files must exist before syncing. Run `npm run sync` after every web change; it copies the current web assets into both native projects. The generated Android and iOS web copies are build artifacts, so `../dist` remains the source of truth. Capacitor uses its local web origin; no hosted URL or server is required.

## Android

Install Android Studio with Android SDK 36 and a Java 21 JDK. The checked-in Gradle wrapper uses Gradle 8.14.3 and Android Gradle Plugin 8.13.0. Minimum Android API is 24 (Android 7.0); compile and target APIs are 36.

```sh
npm run open:android
# Or, with an emulator/device and SDK configured:
npm run run:android
# From mobile/android, build a debug APK:
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Successful GitHub Actions runs now retain that APK for seven days as an **internal QA artifact**. Testers can download it from the matching GitHub Actions run and follow the [physical-device acceptance checklist](../docs/android-internal-qa.md). This is a debug-signed test build, not a Play Store release or a permanent public installer. Use Android Studio's signed bundle/APK workflow for a release. Create and securely retain your own signing key; do not put keystores or passwords in source control. The project does not include release signing credentials.

The manifest declares Internet, READ_PHONE_STATE and PACKAGE_USAGE_STATS. Phone permission is requested at runtime for SIM discovery; Usage Access is granted separately in Android settings. No phone-number, call-log, contacts, SMS, location or broad installed-package permission is requested. Android cloud backup/device transfer are excluded in the manifest/data-extraction rules. See [native implementation](../docs/android-telemetry.md) for measurement scope, lifecycle behavior and tests.

## iOS

Build on macOS with a Capacitor 8 compatible Xcode installation (Xcode 26 or later). The deployment target is iOS 15. The generated project uses Swift Package Manager to resolve Capacitor; no CocoaPods setup is needed.

```sh
npm run open:ios
# Or, with an iOS simulator/device configured:
npm run run:ios
```

In Xcode, select the `App` scheme and a simulator to run. For a physical device, choose your Apple signing team and a unique bundle identifier if `com.telco.usage` is unavailable to your team, then update `capacitor.config.json` and both native projects consistently. For distribution, configure Apple Developer signing and provisioning, archive, validate, and distribute through Xcode. Apple credentials and profiles are not included.

An ordinary iOS app has no public API for other apps' cellular bytes or the system call history. `CTCarrier` is deprecated/restricted and cannot supply reliable current carrier metadata. Telvyo's SIM/carrier labels are manual. App Store approval is not guaranteed.

## CSV export

The native app writes the CSV to its cache directory using `@capacitor/filesystem` and presents the operating system share sheet using `@capacitor/share`. The app does not send the file automatically: the user selects the destination or cancels. Android file sharing is limited to the app cache via FileProvider; no broad storage permission is requested. A subsequent export with the same workspace and date-range filename replaces that report in the cache, and the OS may clear cached files. Copies explicitly saved/shared elsewhere are controlled by the selected destination.

Capacitor injects native plugin methods into `window.Capacitor.Plugins` before app scripts run, so the static app can call `Filesystem.writeFile({ path, data, directory: 'CACHE', encoding: 'utf8' })` and `Share.share({ url: file.uri })` without a web bundler. Both native packages must remain installed and synced. The browser uses its separate download path. The iOS project includes `PrivacyInfo.xcprivacy` as an app resource with file timestamp access reason `C617.1`, as required by the Filesystem plugin.

## Versions and verification

- Capacitor core, CLI, Android and iOS packages are pinned to **8.6.2**. Filesystem is **8.1.5** and Share is **8.0.3**; `package-lock.json` is included.
- Source generation ran with Node **24.22.1** and npm **11.9.0**.
- Android and iOS projects were generated and successfully synced using the Capacitor CLI. Static checks confirmed the app identity, relative web asset directory, native source files, and only the declared, task-specific Android permission requests.
- The Android debug build and native unit tests are run with SDK 36/JDK 21; see the current verification report for results. Neither platform has been tested on a physical device here, and iOS has not been compiled on macOS. Launcher and launch-screen artwork use the updated Telvyo identity.
- Before release, verify offline launch, form entry, local persistence, data reset, screen rotation, safe areas, accessibility, and the selected device's back/navigation behavior. Complete store privacy disclosures and use real-device validation before making usage collection claims.
