package com.telco.usage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.time.Instant;
import java.util.List;
import java.util.TimeZone;
import org.junit.Test;

public class UsageSnapshotMathTest {
    @Test
    public void validatesWindowBeforeAnyDeviceQuery() {
        long now = 1_800_000_000_000L;
        UsageSnapshotMath.validateWindow(now - UsageSnapshotMath.MAX_WINDOW_MILLIS, now, now);
        expectInvalid(() -> UsageSnapshotMath.validateWindow(now, now, now));
        expectInvalid(() -> UsageSnapshotMath.validateWindow(now - 1, now + 1, now));
        expectInvalid(() -> UsageSnapshotMath.validateWindow(-1, 1, now));
        expectInvalid(() -> UsageSnapshotMath.validateWindow(now - UsageSnapshotMath.MAX_WINDOW_MILLIS - 1, now, now));
    }

    @Test
    public void timestampsAcceptJsonNumericTypesWithoutTruncating() {
        assertEquals(1_800_000_000_000L, UsageSnapshotMath.timestamp(1_800_000_000_000L));
        assertEquals(42, UsageSnapshotMath.timestamp(42));
        assertEquals(1_800_000_000_000L, UsageSnapshotMath.timestamp(1_800_000_000_000d));
        expectInvalid(() -> UsageSnapshotMath.timestamp("42"));
        expectInvalid(() -> UsageSnapshotMath.timestamp(42.5));
        expectInvalid(() -> UsageSnapshotMath.timestamp(Double.NaN));
        expectInvalid(() -> UsageSnapshotMath.timestamp(Double.POSITIVE_INFINITY));
        expectInvalid(() -> UsageSnapshotMath.timestamp(9_007_199_254_740_992d));
        expectInvalid(() -> UsageSnapshotMath.timestamp(null));
    }

    @Test
    public void combinesUidStatesAndNetworkDimensionsWithoutCountingTagsOrDeviceTotals() {
        UsageSnapshotMath.Aggregator totals = new UsageSnapshotMath.Aggregator();
        totals.add(10001, 0, 2, 1, 1, 1, 100, 20);
        totals.add(10001, 0, 1, 1, 1, 1, 30, 10);
        totals.add(10001, 0, 1, 1, 2, 1, 3, 7);
        totals.add(10001, 123, 2, 1, 1, 1, 100, 20); // Tagged subset is not additive.
        totals.add(-1, 0, -1, -1, -1, -1, 900, 100); // Device total is not an app.
        totals.add(10002, 0, 1, 1, 1, 1, 20, 5);
        List<UsageSnapshotMath.UidUsage> apps = totals.finish();
        assertEquals(2, apps.size());
        assertEquals(10001, apps.get(0).uid);
        assertEquals(170, apps.get(0).bytes);
        assertEquals(120, apps.get(0).foregroundBytes);
        assertEquals(50, apps.get(0).backgroundBytes);
        assertEquals(25, apps.get(1).bytes);
        assertTrue(totals.skippedAggregateOrTag);
        assertFalse(totals.missingStateBreakdown);
    }

    @Test
    public void stateAllNeverDuplicatesItsComponentStates() {
        UsageSnapshotMath.Aggregator totals = new UsageSnapshotMath.Aggregator();
        totals.add(10001, 0, -1, 1, 1, 1, 160, 10);
        totals.add(10001, 0, 2, 1, 1, 1, 100, 20);
        totals.add(10001, 0, 1, 1, 1, 1, 30, 20);
        UsageSnapshotMath.UidUsage app = totals.finish().get(0);
        assertEquals(170, app.bytes);
        assertEquals(0, app.foregroundBytes);
        assertEquals(0, app.backgroundBytes);
        assertTrue(totals.missingStateBreakdown);
    }

    @Test
    public void retainsUnknownStatesWithoutInventingABackgroundClassification() {
        UsageSnapshotMath.Aggregator totals = new UsageSnapshotMath.Aggregator();
        totals.add(10001, 0, 17, 1, 1, 1, 7, 8);
        UsageSnapshotMath.UidUsage app = totals.finish().get(0);
        assertEquals(15, app.bytes);
        assertEquals(0, app.backgroundBytes);
        assertTrue(totals.missingStateBreakdown);
    }

    @Test
    public void dailyRangesClipPartialDaysAndDoNotOverlap() {
        long start = Instant.parse("2026-11-01T12:00:00Z").toEpochMilli();
        long end = Instant.parse("2026-11-03T06:00:00Z").toEpochMilli();
        List<UsageSnapshotMath.DayWindow> days = UsageSnapshotMath.dayWindows(start, end, TimeZone.getTimeZone("UTC"));
        assertEquals(3, days.size());
        assertEquals("2026-11-01", days.get(0).date);
        assertEquals(start, days.get(0).start);
        assertEquals(end, days.get(2).end);
        assertEquals(days.get(0).end, days.get(1).start);
        assertEquals(days.get(1).end, days.get(2).start);
        assertEquals(12 * 60 * 60 * 1000L, days.get(0).end - days.get(0).start);
        assertEquals(6 * 60 * 60 * 1000L, days.get(2).end - days.get(2).start);
    }

    @Test
    public void dailyRangesRespectDaylightSavingInsteadOfAssuming24Hours() {
        TimeZone zone = TimeZone.getTimeZone("America/New_York");
        long start = Instant.parse("2026-11-01T04:00:00Z").toEpochMilli();
        long end = Instant.parse("2026-11-02T05:00:00Z").toEpochMilli();
        List<UsageSnapshotMath.DayWindow> days = UsageSnapshotMath.dayWindows(start, end, zone);
        assertEquals(1, days.size());
        assertEquals("2026-11-01", days.get(0).date);
        assertEquals(25 * 60 * 60 * 1000L, days.get(0).end - days.get(0).start);
    }

    @Test
    public void midnightDstGapDoesNotShiftTheFollowingDaysBoundary() {
        long start = Instant.parse("2026-09-06T04:00:00Z").toEpochMilli();
        long end = Instant.parse("2026-09-08T03:00:00Z").toEpochMilli();
        List<UsageSnapshotMath.DayWindow> days = UsageSnapshotMath.dayWindows(start, end, TimeZone.getTimeZone("America/Santiago"));
        assertEquals(2, days.size());
        assertEquals("2026-09-06", days.get(0).date);
        assertEquals("2026-09-07", days.get(1).date);
        assertEquals(Instant.parse("2026-09-07T03:00:00Z").toEpochMilli(), days.get(0).end);
        assertEquals(23 * 60 * 60 * 1000L, days.get(0).end - days.get(0).start);
        assertEquals(24 * 60 * 60 * 1000L, days.get(1).end - days.get(1).start);
    }

    @Test
    public void byteCountsRejectNegativeAndOverflowingStatistics() {
        assertEquals(3, UsageSnapshotMath.bytes(1, 2));
        expectInvalid(() -> UsageSnapshotMath.bytes(-1, 2));
        try {
            UsageSnapshotMath.bytes(Long.MAX_VALUE, 1);
            fail("overflow must not produce a negative total");
        } catch (ArithmeticException expected) { }
    }

    @Test
    public void repeatedMidnightUsesEarliestStartOfLocalDay() {
        long start = Instant.parse("2026-10-31T04:00:00Z").toEpochMilli();
        long end = Instant.parse("2026-11-02T05:00:00Z").toEpochMilli();
        List<UsageSnapshotMath.DayWindow> days = UsageSnapshotMath.dayWindows(start, end, TimeZone.getTimeZone("America/Havana"));
        assertEquals(2, days.size());
        assertEquals(Instant.parse("2026-11-01T04:00:00Z").toEpochMilli(), days.get(0).end);
        assertEquals(25 * 60 * 60 * 1000L, days.get(1).end - days.get(1).start);
    }

    private static void expectInvalid(Runnable action) {
        try {
            action.run();
            fail("Expected invalid input to be rejected");
        } catch (IllegalArgumentException expected) { }
    }
}
