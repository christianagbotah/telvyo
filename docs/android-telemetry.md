# Android device insights

`TelcoDevice` is a registered local Capacitor plugin in `mobile/android`. Its results are read-only snapshots, separate from the manual ledger. It performs no network upload, background polling, SIM switching, package enumeration, or carrier billing queries.

## Permission and platform boundaries

- SIM detection supports Android 7+ (the app's minimum SDK). `detectSims()` requests `READ_PHONE_STATE` through Capacitor's runtime permission flow, then reads the active `SubscriptionManager` list. It returns subscription ID, one-based logical slot, carrier/display label, icon tint, and default voice/data flags. An empty list means no active SIM visible to the app. Hidden/opportunistic profiles may be omitted by Android. SIM metadata can change, so refresh after a SIM change.
- Mobile usage requires Android 10+. Android only documents `subscriberId = null` as an all-mobile query beginning with API 29. Older devices receive `UNSUPPORTED_ANDROID_VERSION`; SIM detection remains available.
- The manifest declares `PACKAGE_USAGE_STATS`; the user must separately grant Usage access in Android settings. `openUsageSettings()` opens that screen. Returning from settings is not treated as consent: the UI must recheck capabilities or query again.
- `getCapabilities()` checks permission state without prompting. Usage queries reject with `USAGE_ACCESS_DENIED` before reading statistics when access is absent, recheck before subsequent reads and before returning the snapshot, and catch revocation/security failures. SIM permission denial returns `PHONE_PERMISSION_DENIED`.
- The plugin does not request phone-number, SMS, call-log, or broad package-visibility permissions. It does not read IMSI, ICCID, phone numbers, or call records. Android may use general Phone permission wording for `READ_PHONE_STATE`.

## JavaScript contract

```ts
getCapabilities(): Promise<{
  platform: 'android'; simDetection: true; usageAccess: boolean;
  phonePermission: 'granted' | 'prompt' | 'denied';
}>

detectSims(): Promise<{
  sims: Array<{ subscriptionId: number; slot: number; carrier: string;
    label: string; color: string; isDefaultData: boolean; isDefaultVoice: boolean }>;
  detectedAt: string;
}>

openUsageSettings(): Promise<{ opened: true }>

queryMobileUsage({ startTime, endTime }: {
  startTime: number; endTime: number; // Unix milliseconds, at most 31 days, no future time
}): Promise<{
  scope: 'all-mobile'; startTime: number; endTime: number; queriedAt: string;
  totalBytes: number;
  apps: Array<{ uid: number; packageName: string | null; app: string;
    bytes: number; foregroundBytes: number; backgroundBytes: number }>;
  daily: Array<{ date: string; bytes: number }>;
  warnings: string[];
}>
```

Every usage query runs on a dedicated worker, with one query permitted at a time. `querySummaryForDevice(TYPE_MOBILE, null, ...)` supplies the total and each daily total. `querySummary(TYPE_MOBILE, null, ...)` supplies UID rows. The device total is never added to the UID rows. Tagged subsets and `UID_ALL` rows are excluded from the UID breakdown; foreground/background states and disjoint roaming/metered/default-network dimensions are combined once. A defensive `STATE_ALL` bucket takes precedence over its state components without inventing their breakdown. Foreground/background describe Android's network accounting state, not screen-time measurements.

Labels are looked up only for UIDs returned by the statistics query. Hidden or removed packages fall back to `UID n`; multiple packages sharing a UID remain one `Shared UID n` row. No UID total is copied onto several app rows. The OS total and visible rows can differ because of Android's restrictions on system, tethering, removed-app, and other-user information.

Daily boundaries use the device's current time zone, including daylight-saving changes. The first/last day can be partial. These are Android estimates with delayed/aggregated accounting; they are not minute-level measurements or carrier-authoritative billing. Separate OS reads can also capture updates between queries. No combined-mobile measurement can truthfully be attributed to an individual SIM.

## Verification

The ten-test JUnit suite exercises strict timestamp/window validation, UID/tag/state aggregation, byte overflow, partial days, a 25-hour daylight-saving day, and a midnight daylight-saving gap and a repeated midnight. Final Gradle assembleDebug, testDebugUnitTest and lintDebug all succeeded: 10 tests, zero failures/errors; lint zero errors and 27 release-cleanup warnings. A debug APK is provided. Physical-device permission/traffic behavior remains unverified.

Build prerequisites are JDK 21 and Android SDK platform 36. From `mobile/android`, run `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`. Sync the latest web assets with Capacitor before building an APK intended for installation. A debug APK is for development and does not constitute a signed release.

Before release, install on physical Android 10+ devices from multiple manufacturers and verify:

1. Fresh install: capabilities do not prompt; no usage result is available before Usage access is granted.
2. Deny/revoke Phone permission, retry with grant, and verify single/dual-SIM, eSIM, no-SIM, and changed default-data subscription results.
3. Open Usage access settings, deny/grant/revoke access, return to the app, and verify capability refresh and clear rejection after revocation.
4. Use mobile data in several apps; compare snapshots with Android settings over the same window. Test foreground/background, shared/hidden packages, tethering, work profiles, Wi-Fi-only use, and zero-data ranges. Expect OS/accounting delays and documented scope differences.
5. Verify first/last partial days and time-zone/DST boundaries. Confirm combined totals never attach to one SIM and refreshing snapshots never inserts rows into the manual ledger.

## Android references

- [NetworkStatsManager permission, worker-thread, summary, and null-subscriber rules](https://developer.android.com/reference/android/app/usage/NetworkStatsManager)
- [NetworkStats.Bucket dimensions and states](https://developer.android.com/reference/android/app/usage/NetworkStats.Bucket)
- [SubscriptionManager active subscriptions and permission requirement](https://developer.android.com/reference/android/telephony/SubscriptionManager#getActiveSubscriptionInfoList())
- [Usage access settings action](https://developer.android.com/reference/android/provider/Settings#ACTION_USAGE_ACCESS_SETTINGS)
- [Package visibility filtering](https://developer.android.com/training/package-visibility)
