import test from "node:test";
import assert from "node:assert/strict";
import { createEmpty, compareBundlePurchases } from "../dist/model.js";

const now = Date.parse("2026-11-15T12:00:00Z");
const stamp = (date) => date + "T10:00:00Z";
const row = (id, simId, amount, cost, date = "2026-11-14", type = "data") =>
  ({ id, simId, amount, cost, type, timestamp: stamp(date) });

test("compares historical paid cost per GB, excluding complimentary allowance from denominator", () => {
  const ledger = createEmpty();
  ledger.purchases = [
    row("p1", "mtn", 1000, 8),
    row("p2", "mtn", 500, 0),
    row("p3", "telecel", 2000, 12),
    row("p4", "telecel", 500, 0),
    row("p5", "mtn", 99, 100, "2026-08-01"),
    row("p6", "mtn", 500, 5, "2026-11-16"),
    row("a1", "mtn", 20, 20, "2026-11-14", "airtime"),
  ];
  const value = compareBundlePurchases(ledger, { days: 30, now });
  assert.equal(value.totalSpent, 20);
  assert.equal(value.totalPurchasedMB, 4000);
  assert.equal(value.comparableSimCount, 2);
  const mtn = value.rows.find((r) => r.simId === "mtn");
  assert.equal(mtn.purchases, 2);
  assert.equal(mtn.paidMB, 1000);
  assert.equal(mtn.complimentaryMB, 500);
  assert.equal(mtn.complimentaryPurchases, 1);
  assert.equal(mtn.spent, 8);
  assert.equal(mtn.costPerGB, 8);
  assert.equal(mtn.lowestRecorded, false);
  const telecel = value.rows.find((r) => r.simId === "telecel");
  assert.equal(telecel.spent, 12);
  assert.equal(telecel.costPerGB, 6);
  assert.equal(telecel.lowestRecorded, true);
});

test("no purchase data and zero-cost purchases do not invent paid prices or rank a network", () => {
  const ledger = createEmpty();
  let result = compareBundlePurchases(ledger, { now });
  assert.equal(result.totalSpent, 0);
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((r) => r.costPerGB === null && !r.lowestRecorded));
  ledger.purchases = [row("free", "mtn", 1500, 0)];
  result = compareBundlePurchases(ledger, { now });
  assert.equal(result.rows[0].purchases, 1);
  assert.equal(result.rows[0].purchasedMB, 1500);
  assert.equal(result.rows[0].costPerGB, null);
  assert.equal(result.comparableSimCount, 0);
});

test("does not compare one selected SIM to unselected networks", () => {
  const ledger = createEmpty();
  ledger.purchases = [
    row("p1", "mtn", 1000, 12),
    row("p2", "telecel", 3000, 9),
  ];
  const result = compareBundlePurchases(ledger, {
    simId: "mtn", days: 7, now,
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].costPerGB, 12);
  assert.equal(result.rows[0].lowestRecorded, false);
  assert.equal(result.totalSpent, 12);
  assert.equal(compareBundlePurchases({ ...ledger, sims: [] }, { now }).rows.length, 0);
});

test("skips invalid purchases, unknown SIMs, stale and future records", () => {
  const ledger = createEmpty();
  ledger.purchases = [
    row("valid", "mtn", 500, 5),
    row("unknown", "unregistered", 50000, 1),
    row("negative", "mtn", -500, 10),
    row("badCost", "mtn", 500, Number.POSITIVE_INFINITY),
    row("old", "mtn", 900, 1, "2026-10-01"),
    row("future", "mtn", 900, 1, "2026-11-17"),
  ];
  const result = compareBundlePurchases(ledger, { days: 7, now });
  assert.equal(result.rows[0].purchases, 1);
  assert.equal(result.rows[0].costPerGB, 10);
  assert.equal(result.totalSpent, 5);
  assert.equal(result.totalPurchasedMB, 500);
  assert.throws(() => compareBundlePurchases(ledger, { now: NaN }), /valid current time/);
});

test("multiple valid equal prices are shown as tied, not an invented exclusive winner", () => {
  const ledger = createEmpty();
  ledger.purchases = [
    row("p1", "mtn", 1000, 5),
    row("p2", "telecel", 2000, 10),
  ];
  const result = compareBundlePurchases(ledger, { now });
  assert.equal(result.comparableSimCount, 2);
  assert.ok(result.rows.every((r) => r.lowestRecorded));
});
