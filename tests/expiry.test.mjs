import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmpty, validateRecord, addRecord, summarize,
  bundleExpiryWatch, toCSV,
} from "../dist/model.js";

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const iso = (hours) => new Date(NOW + hours * 3600000).toISOString();
const purchase = (id, simId, expiresAt) => ({
  id, simId, type: "data", amount: 1000, cost: 8,
  timestamp: iso(-48),
  ...(expiresAt === undefined ? {} : { expiresAt }),
});

test("legacy data purchases without an expiry remain valid and unchanged", () => {
  const state = createEmpty();
  const old = purchase("legacy", "mtn");
  assert.equal(validateRecord("purchase", old, state, NOW), null);
  const saved = addRecord(state, "purchase", old, NOW);
  assert.equal(saved.purchases[0].expiresAt, undefined);
  const value = summarize(saved, { now: NOW, simId: "mtn" });
  assert.equal(value.dataRemainingMB, 1000);
  assert.deepEqual(bundleExpiryWatch(saved, { now: NOW }), {
    soon: [], recentlyExpired: [],
  });
});

test("user-confirmed expiry must be valid and after recorded purchase", () => {
  const state = createEmpty();
  for (const bad of [
    "", "sometime", "2026-02-30T10:00:00Z", iso(-50),
    iso(-48), 1234, null, {},
  ]) {
    assert.match(
      validateRecord("purchase", purchase("p", "mtn", bad), state, NOW),
      /expiry/i,
      String(bad),
    );
  }
  assert.equal(validateRecord("purchase", purchase("p", "mtn", iso(24)), state, NOW), null);
  assert.match(
    validateRecord("purchase", {
      ...purchase("p", "mtn", iso(24)), type: "airtime",
    }, state, NOW),
    /Only data bundles/i,
  );
});

test("expiry watch detects next 72h and last 7 days, separates SIMs and sorts", () => {
  const state = createEmpty();
  state.purchases = [
    purchase("upcoming-mtn", "mtn", iso(24)),
    purchase("near-mtn", "mtn", iso(3)),
    purchase("boundary-mtn", "mtn", iso(72)),
    purchase("late-mtn", "mtn", iso(73)),
    purchase("expired-mtn", "mtn", iso(-2)),
    purchase("expired-telecel", "telecel", iso(-12)),
    purchase("very-old-telecel", "telecel", iso(-30 * 24)),
    purchase("untracked", "mtn"),
    purchase("invalid", "mtn", "invalid"),
  ];
  const all = bundleExpiryWatch(state, { now: NOW });
  assert.deepEqual(all.soon.map((r) => r.purchaseId), [
    "near-mtn", "upcoming-mtn", "boundary-mtn",
  ]);
  assert.deepEqual(all.recentlyExpired.map((r) => r.purchaseId), [
    "expired-mtn", "expired-telecel",
  ]);
  assert.equal(all.soon[0].hoursUntilExpiry, 3);
  assert.equal(all.recentlyExpired[0].hoursUntilExpiry, 0);
  assert.ok(all.soon.every((r) => r.status === "soon"));
  const telecel = bundleExpiryWatch(state, { now: NOW, simId: "telecel" });
  assert.equal(telecel.soon.length, 0);
  assert.deepEqual(telecel.recentlyExpired.map((r) => r.purchaseId), ["expired-telecel"]);
});

test("recorded expiry does not pretend to adjust carrier balance", () => {
  const state = createEmpty();
  state.purchases = [purchase("expired", "mtn", iso(-1))];
  assert.equal(summarize(state, { now: NOW, simId: "mtn" }).dataRemainingMB, 1000);
  assert.equal(bundleExpiryWatch(state, { now: NOW }).recentlyExpired.length, 1);
});

test("CSV includes expiry without changing the final source column", () => {
  const state = createEmpty();
  state.purchases = [
    purchase("with-expiry", "mtn", iso(24)),
    purchase("legacy", "mtn"),
  ];
  const csv = toCSV(state, { now: NOW, days: 7 });
  const [headers, ...lines] = csv.split("\r\n");
  assert.match(headers, /"recorded_expiry","source"$/);
  assert.match(lines[0], new RegExp(iso(24).replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  assert.ok(lines.every((line) => /"manual"$/.test(line)));
  assert.match(csv, /"legacy"/);
});
