package com.telco.usage;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;

/** Pure Java boundaries and aggregation, kept independent of Android for meaningful local tests. */
final class UsageSnapshotMath {
    static final long MAX_WINDOW_MILLIS = 31L * 24 * 60 * 60 * 1000;
    static final int UID_ALL = -1;
    static final int TAG_NONE = 0;
    static final int STATE_ALL = -1;
    static final int STATE_DEFAULT = 1;
    static final int STATE_FOREGROUND = 2;

    static void validateWindow(long start, long end, long now) {
        if (start < 0 || end <= start || end > now || end - start > MAX_WINDOW_MILLIS) {
            throw new IllegalArgumentException("Choose a past time range of up to 31 days with endTime after startTime.");
        }
    }

    static long timestamp(Object value) {
        if (!(value instanceof Number)) {
            throw new IllegalArgumentException("startTime and endTime must be integer Unix timestamps in milliseconds.");
        }
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || number < 0 || number > 9_007_199_254_740_991d || number != Math.floor(number)) {
            throw new IllegalArgumentException("startTime and endTime must be safe, nonnegative integer timestamps.");
        }
        return ((Number) value).longValue();
    }

    static long bytes(long rx, long tx) {
        if (rx < 0 || tx < 0) throw new IllegalArgumentException("Android returned a negative byte count.");
        return Math.addExact(rx, tx);
    }

    static final class DayWindow {
        final String date;
        final long start;
        final long end;
        DayWindow(String date, long start, long end) {
            this.date = date;
            this.start = start;
            this.end = end;
        }
    }

    @androidx.annotation.RequiresApi(26)
    static List<DayWindow> dayWindows(long start, long end, TimeZone zone) {
        List<DayWindow> result = new ArrayList<>();
        java.time.ZoneId zoneId = zone.toZoneId();
        long cursor = start;
        while (cursor < end) {
            java.time.LocalDate date = java.time.Instant.ofEpochMilli(cursor).atZone(zoneId).toLocalDate();
            // atStartOfDay chooses the earliest valid instant for both midnight gaps and overlaps.
            long boundary = date.plusDays(1).atStartOfDay(zoneId).toInstant().toEpochMilli();
            long next = Math.min(boundary, end);
            if (next <= cursor) throw new IllegalArgumentException("Unable to resolve the device's local day boundary.");
            result.add(new DayWindow(date.toString(), cursor, next));
            cursor = next;
        }
        return result;
    }

    static final class UidUsage {
        final int uid;
        long bytes;
        long foregroundBytes;
        long backgroundBytes;
        UidUsage(int uid) { this.uid = uid; }
    }

    /** querySummary is unique per UID/state/metered/roaming/default-network dimension. */
    static final class Aggregator {
        private final Map<String, StateGroup> dimensions = new LinkedHashMap<>();
        boolean missingStateBreakdown;
        boolean skippedAggregateOrTag;

        void add(int uid, int tag, int state, int metered, int roaming, int defaultNetwork, long rx, long tx) {
            // Tagged traffic is already in TAG_NONE totals; UID_ALL is already across UIDs.
            if (uid == UID_ALL || tag != TAG_NONE) {
                skippedAggregateOrTag = true;
                return;
            }
            String key = uid + ":" + metered + ":" + roaming + ":" + defaultNetwork;
            StateGroup group = dimensions.get(key);
            if (group == null) {
                group = new StateGroup(uid);
                dimensions.put(key, group);
            }
            long count = bytes(rx, tx);
            if (state == STATE_ALL) {
                group.hasAll = true;
                group.all = Math.addExact(group.all, count);
            } else if (state == STATE_FOREGROUND) {
                group.foreground = Math.addExact(group.foreground, count);
            } else if (state == STATE_DEFAULT) {
                group.background = Math.addExact(group.background, count);
            } else {
                group.other = Math.addExact(group.other, count);
                missingStateBreakdown = true;
            }
        }

        List<UidUsage> finish() {
            Map<Integer, UidUsage> byUid = new LinkedHashMap<>();
            for (StateGroup group : dimensions.values()) {
                UidUsage usage = byUid.get(group.uid);
                if (usage == null) {
                    usage = new UidUsage(group.uid);
                    byUid.put(group.uid, usage);
                }
                if (group.hasAll) {
                    // Never add a STATE_ALL bucket to its component states.
                    usage.bytes = Math.addExact(usage.bytes, group.all);
                    missingStateBreakdown = true;
                } else {
                    usage.bytes = Math.addExact(usage.bytes, Math.addExact(Math.addExact(group.foreground, group.background), group.other));
                    usage.foregroundBytes = Math.addExact(usage.foregroundBytes, group.foreground);
                    usage.backgroundBytes = Math.addExact(usage.backgroundBytes, group.background);
                }
            }
            List<UidUsage> result = new ArrayList<>(byUid.values());
            Collections.sort(result, Comparator.comparingLong((UidUsage usage) -> usage.bytes).reversed().thenComparingInt(usage -> usage.uid));
            return result;
        }
    }

    private static final class StateGroup {
        final int uid;
        long all;
        long foreground;
        long background;
        long other;
        boolean hasAll;
        StateGroup(int uid) { this.uid = uid; }
    }

    private UsageSnapshotMath() {}
}
