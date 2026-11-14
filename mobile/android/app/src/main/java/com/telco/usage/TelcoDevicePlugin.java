package com.telco.usage;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.usage.NetworkStats;
import android.app.usage.NetworkStatsManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Permission-gated, read-only snapshots. This plugin never changes the manual usage ledger. */
@CapacitorPlugin(
    name = "TelcoDevice",
    permissions = @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE })
)
public class TelcoDevicePlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean queryInProgress = new AtomicBoolean(false);

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("simDetection", true);
        result.put("usageAccess", hasUsageAccess());
        PermissionState permission = getPermissionState("phone");
        result.put("phonePermission", permission == PermissionState.GRANTED ? "granted" :
            permission == PermissionState.DENIED ? "denied" : "prompt");
        call.resolve(result);
    }

    @PluginMethod
    public void detectSims(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED) {
            requestPermissionForAlias("phone", call, "phonePermissionResult");
            return;
        }
        readSims(call);
    }

    @PermissionCallback
    private void phonePermissionResult(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED) {
            call.reject("Phone permission was not granted. Allow Phone permission to detect active SIMs.", "PHONE_PERMISSION_DENIED");
            return;
        }
        readSims(call);
    }

    private void readSims(PluginCall call) {
        execute(call, () -> {
            try {
                if (getPermissionState("phone") != PermissionState.GRANTED) {
                    call.reject("Phone permission was revoked. Allow Phone permission and try again.", "PHONE_PERMISSION_DENIED");
                    return;
                }
                SubscriptionManager manager = getContext().getSystemService(SubscriptionManager.class);
                JSArray sims = new JSArray();
                if (manager != null && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) {
                    List<SubscriptionInfo> active = manager.getActiveSubscriptionInfoList();
                    int defaultData = SubscriptionManager.getDefaultDataSubscriptionId();
                    int defaultVoice = SubscriptionManager.getDefaultVoiceSubscriptionId();
                    if (active != null) {
                        for (SubscriptionInfo info : active) {
                            int slotIndex = info.getSimSlotIndex();
                            if (slotIndex < 0) continue;
                            JSObject sim = new JSObject();
                            sim.put("subscriptionId", info.getSubscriptionId());
                            sim.put("slot", slotIndex + 1);
                            sim.put("carrier", nonempty(info.getCarrierName(), "Unknown carrier"));
                            sim.put("label", nonempty(info.getDisplayName(), "SIM " + (slotIndex + 1)));
                            sim.put("color", String.format(Locale.US, "#%06X", info.getIconTint() & 0xFFFFFF));
                            sim.put("isDefaultData", info.getSubscriptionId() == defaultData);
                            sim.put("isDefaultVoice", info.getSubscriptionId() == defaultVoice);
                            sims.put(sim);
                        }
                    }
                }
                JSObject result = new JSObject();
                result.put("sims", sims);
                result.put("detectedAt", isoNow());
                call.resolve(result);
            } catch (SecurityException error) {
                call.reject("Android denied SIM access. Allow Phone permission and try again.", "PHONE_PERMISSION_DENIED");
            } catch (UnsupportedOperationException error) {
                call.reject("This device does not expose active SIM information.", "SIM_DETECTION_UNAVAILABLE");
            } catch (RuntimeException error) {
                call.reject("Android could not read active SIMs. Please try again.", "SIM_DETECTION_FAILED");
            }
        });
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Intent settings = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
                settings.setData(Uri.parse("package:" + getContext().getPackageName()));
                try {
                    getActivity().startActivity(settings);
                } catch (ActivityNotFoundException error) {
                    getActivity().startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
                }
                JSObject result = new JSObject();
                result.put("opened", true);
                call.resolve(result); // Opening settings does not imply the user granted access.
            } catch (RuntimeException error) {
                call.reject("Usage access settings are unavailable on this device.", "USAGE_SETTINGS_UNAVAILABLE");
            }
        });
    }

    @PluginMethod
    public void queryMobileUsage(PluginCall call) {
        final long start;
        final long end;
        try {
            start = UsageSnapshotMath.timestamp(call.getData().opt("startTime"));
            end = UsageSnapshotMath.timestamp(call.getData().opt("endTime"));
            UsageSnapshotMath.validateWindow(start, end, System.currentTimeMillis());
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), "INVALID_TIME_WINDOW");
            return;
        }
        // Android documents subscriberId=null for all-mobile totals starting in API 29.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Mobile usage snapshots require Android 10 or later. SIM detection remains available.", "UNSUPPORTED_ANDROID_VERSION");
            return;
        }
        if (!hasUsageAccess()) {
            rejectUsagePermission(call);
            return;
        }
        if (!queryInProgress.compareAndSet(false, true)) {
            call.reject("A mobile usage snapshot is already being read. Please wait for it to finish.", "USAGE_QUERY_IN_PROGRESS");
            return;
        }
        try {
            worker.execute(() -> {
                try {
                    readUsage(call, start, end);
                } catch (SecurityException error) {
                    rejectUsagePermission(call);
                } catch (Exception error) {
                    if (!hasUsageAccess()) rejectUsagePermission(call);
                    else call.reject("Android could not return a mobile usage snapshot. Please try again.", "USAGE_QUERY_FAILED");
                } finally {
                    queryInProgress.set(false);
                }
            });
        } catch (RejectedExecutionException error) {
            queryInProgress.set(false);
            call.reject("The device connection closed. Reopen the app and try again.", "DEVICE_CONNECTION_CLOSED");
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    @SuppressWarnings("deprecation") // NetworkStatsManager's public API still accepts ConnectivityManager.TYPE_MOBILE.
    private void readUsage(PluginCall call, long start, long end) throws Exception {
        requireUsageAccess();
        NetworkStatsManager manager = getContext().getSystemService(NetworkStatsManager.class);
        if (manager == null) {
            call.reject("Mobile usage statistics are unavailable on this device.", "USAGE_UNAVAILABLE");
            return;
        }
        NetworkStats.Bucket device = manager.querySummaryForDevice(ConnectivityManager.TYPE_MOBILE, null, start, end);
        if (device == null) {
            call.reject("Android returned no device usage summary. Check Usage access and try again.", "USAGE_UNAVAILABLE");
            return;
        }
        long totalBytes = UsageSnapshotMath.bytes(device.getRxBytes(), device.getTxBytes());
        requireUsageAccess();
        UsageSnapshotMath.Aggregator aggregator = new UsageSnapshotMath.Aggregator();
        NetworkStats stats = manager.querySummary(ConnectivityManager.TYPE_MOBILE, null, start, end);
        if (stats == null) {
            call.reject("Android returned no app usage summary. Check Usage access and try again.", "USAGE_UNAVAILABLE");
            return;
        }
        try {
            NetworkStats.Bucket bucket = new NetworkStats.Bucket();
            while (stats.hasNextBucket()) {
                if (!stats.getNextBucket(bucket)) break;
                aggregator.add(bucket.getUid(), bucket.getTag(), bucket.getState(), bucket.getMetered(),
                    bucket.getRoaming(), bucket.getDefaultNetworkStatus(), bucket.getRxBytes(), bucket.getTxBytes());
            }
        } finally {
            stats.close();
        }

        JSArray warnings = new JSArray();
        warnings.put("Combined mobile data across all SIMs; these totals cannot be attributed to an individual SIM.");
        warnings.put("Android estimates may be delayed and differ from carrier billing. Daily summaries do not provide minute-level precision.");
        warnings.put("The device total and visible app rows may differ because Android restricts some system, tethering, removed-app, and other-profile usage.");
        JSArray apps = new JSArray();
        boolean restrictedLabels = false;
        for (UsageSnapshotMath.UidUsage usage : aggregator.finish()) {
            if (usage.bytes == 0) continue;
            JSObject app = appIdentity(usage.uid);
            if (app.isNull("packageName")) restrictedLabels = true;
            app.put("uid", usage.uid);
            app.put("bytes", usage.bytes);
            app.put("foregroundBytes", usage.foregroundBytes);
            app.put("backgroundBytes", usage.backgroundBytes);
            apps.put(app);
        }
        if (restrictedLabels) warnings.put("Some app names are hidden by Android or shared by several apps; those rows are identified by UID.");
        if (aggregator.missingStateBreakdown) warnings.put("Android did not provide a foreground/background split for all usage.");
        if (aggregator.skippedAggregateOrTag) warnings.put("Overlapping aggregate or tagged rows were excluded from the app breakdown.");

        TimeZone zone = TimeZone.getDefault();
        JSArray daily = new JSArray();
        for (UsageSnapshotMath.DayWindow day : UsageSnapshotMath.dayWindows(start, end, zone)) {
            requireUsageAccess();
            NetworkStats.Bucket dayTotal = manager.querySummaryForDevice(ConnectivityManager.TYPE_MOBILE, null, day.start, day.end);
            if (dayTotal == null) {
                call.reject("Android could not return every daily summary. Please try again.", "USAGE_UNAVAILABLE");
                return;
            }
            JSObject row = new JSObject();
            row.put("date", day.date);
            row.put("bytes", UsageSnapshotMath.bytes(dayTotal.getRxBytes(), dayTotal.getTxBytes()));
            daily.put(row);
        }
        warnings.put("Daily totals use the device time zone (" + zone.getID() + "); the first and last day may be partial.");
        requireUsageAccess();
        JSObject result = new JSObject();
        result.put("scope", "all-mobile");
        result.put("startTime", start);
        result.put("endTime", end);
        result.put("queriedAt", isoNow());
        result.put("totalBytes", totalBytes);
        result.put("apps", apps);
        result.put("daily", daily);
        result.put("warnings", warnings);
        call.resolve(result);
    }

    private JSObject appIdentity(int uid) {
        JSObject result = new JSObject();
        result.put("packageName", JSONObject.NULL);
        result.put("app", "UID " + uid);
        try {
            PackageManager packages = getContext().getPackageManager();
            // Resolve only UIDs already returned by NetworkStatsManager. Never enumerate installed apps.
            String[] names = packages.getPackagesForUid(uid);
            if (names != null && names.length == 1) {
                ApplicationInfo info = packages.getApplicationInfo(names[0], 0);
                result.put("packageName", names[0]);
                result.put("app", nonempty(packages.getApplicationLabel(info), "UID " + uid));
            } else if (names != null && names.length > 1) {
                result.put("app", "Shared UID " + uid);
            }
        } catch (PackageManager.NameNotFoundException | SecurityException ignored) {
            // Package visibility rules may prevent labels; the measured UID remains usable.
        }
        return result;
    }

    private boolean hasUsageAccess() {
        AppOpsManager manager = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        if (manager == null) return false;
        try {
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? manager.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName())
                : manager.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void requireUsageAccess() {
        if (!hasUsageAccess()) throw new SecurityException("Usage access is not granted.");
    }

    private void rejectUsagePermission(PluginCall call) {
        call.reject("Usage access is not granted. Open Android Usage access settings, allow Telvyo, then return and refresh.", "USAGE_ACCESS_DENIED");
    }

    private void execute(PluginCall call, Runnable work) {
        try {
            worker.execute(work);
        } catch (RejectedExecutionException error) {
            call.reject("The device connection closed. Reopen the app and try again.", "DEVICE_CONNECTION_CLOSED");
        }
    }

    private static String nonempty(CharSequence value, String fallback) {
        return value == null || value.toString().trim().isEmpty() ? fallback : value.toString();
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
    }
}
