# Current implementation update

Android SIM discovery and permission-gated mobile usage snapshots are now implemented and compiled. See [Android telemetry](android-telemetry.md). The original feasibility notes below describe platform possibilities; their earlier manual-only implementation status is superseded by [release requirements](release-requirements.md). Carrier and cloud-AI connections remain unconfigured.

# Platform support and data provenance

Telvyo is a locally saved mobile usage planner. The current app uses manual entries and clearly labelled demo data. The native wrappers render the same app; they do not automatically read phone usage, calls, contacts, phone numbers, subscriptions, or SIM identifiers. There is no carrier integration or account sync. CSV export is explicit: the browser downloads a file, while the native app writes a temporary cache file and opens the OS share sheet for the user to choose a destination. Clearing app/site storage or uninstalling the app can remove saved data.

## Android

A future native integration could use [`NetworkStatsManager`](https://developer.android.com/reference/android/app/usage/NetworkStatsManager) for network byte statistics. Access varies by API, OS version, user consent, privileges, and device; cross-app statistics generally require the user to grant Usage Access in Settings. This is not implemented and the wrapper does not request Usage Access.

[`SubscriptionManager`](https://developer.android.com/reference/android/telephony/SubscriptionManager) can describe active subscriptions within platform permission limits. Subscription IDs and SIM slots are not permanent customer identities. Access to subscriber identifiers is restricted, so reliable per-SIM historical attribution is not universally available to ordinary apps. Do not promise dual-SIM attribution without a tested native integration on supported Android versions.

Call-log access is subject to Android permissions and [Google Play's SMS and Call Log policy](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en). A general usage dashboard must not assume it qualifies. The app does not request call-log permissions. Call history duration is not a carrier bill: exact billed minutes, rounding, allowances, roaming, and charges require carrier-provided records or user entry.

## iOS

There is no supported public API for an ordinary App Store app to collect other apps' cellular byte usage or the system's call history. See the [Apple Developer Forums discussion of cellular data usage APIs](https://developer.apple.com/forums/thread/81833). Apple's [cellular usage instructions](https://support.apple.com/en-us/109323) describe the usage information a person can view in Settings; they do not expose that information to this app.

`CTCarrier` was deprecated and, for apps built with the iOS 16.4 SDK or later, returns static values as described in the [iOS and iPadOS 16.4 release notes](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-16_4-release-notes). Carrier labels and SIM details in Telvyo are entered by the user. They are not detected from the device.

## Delivery status

Android and iOS native source projects are included. They have not been compiled with the platform SDKs or tested on a device. A mobile release still needs platform builds, signed artifacts, real-device testing, store metadata and privacy disclosures. App Store or Google Play approval is not guaranteed. The local-only demo/manual workflow must remain clearly disclosed if future data integrations are added.
