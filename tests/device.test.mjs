import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeviceClient,
  mergeDetectedSims,
  normalizeSnapshot,
} from "../dist/device.js";
import { createEmpty } from "../dist/model.js";

test("browser never claims phone permissions or physical SIM detection", async () => {
  const client = createDeviceClient(null);
  assert.equal(client.supported, false);
  assert.equal((await client.capabilities()).simDetection, false);
  await assert.rejects(client.detect(), /Android app/);
});
test("Android client uses native permission workflow, keeping SIMs distinct from billing", async () => {
  const cap = {
    getPlatform: () => "android",
    isNativePlatform: () => true,
    Plugins: {
      TelcoDevice: {
        getCapabilities: async () => ({
          platform: "android",
          simDetection: true,
          usageAccess: false,
          phonePermission: "prompt",
        }),
        detectSims: async () => ({
          sims: [
            {
              subscriptionId: 42,
              slot: 1,
              carrier: "MTN",
              label: "Personal",
              color: "#FFCC00",
              isDefaultData: true,
              isDefaultVoice: false,
            },
          ],
          detectedAt: new Date().toISOString(),
        }),
      },
    },
  };
  const client = createDeviceClient(cap);
  assert.equal(client.supported, true);
  const result = await client.detect();
  assert.equal(result.sims[0].subscriptionId, 42);
  const merged = mergeDetectedSims({ ...createEmpty(), sims: [] }, result.sims);
  assert.equal(merged.state.sims[0].rateSource, "unset");
  assert.equal(merged.state.sims[0].source, "device");
  assert.equal(merged.state.purchases.length, 0);
});
test("SIM import never rewrites history from a different network in an occupied slot", () => {
  const old = createEmpty();
  const result = mergeDetectedSims(old, [
    { subscriptionId: 43, slot: 1, carrier: "AT", label: "AT" },
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.state.sims[0].carrier, "MTN");
  assert.equal(old.sims[0].deviceSubscriptionId, undefined);
});
test("repeated subscription detection is idempotent and cannot create duplicates", () => {
  const found = [
    { subscriptionId: 42, slot: 1, carrier: "MTN", label: "Personal" },
  ];
  const one = mergeDetectedSims({ ...createEmpty(), sims: [] }, found).state;
  const two = mergeDetectedSims(one, found).state;
  assert.equal(two.sims.length, 1);
  assert.equal(two.sims[0].id, one.sims[0].id);
});
test("usage snapshots preserve combined scope and are never added to a SIM ledger", () => {
  const snap = normalizeSnapshot({
    scope: "all-mobile",
    startTime: 1,
    endTime: 2,
    queriedAt: new Date().toISOString(),
    totalBytes: 1000,
    apps: [
      {
        uid: 100,
        app: "WhatsApp",
        bytes: 800,
        foregroundBytes: 700,
        backgroundBytes: 100,
      },
    ],
    daily: [],
    warnings: [],
  });
  assert.equal(snap.scope, "all-mobile");
  assert.equal(snap.totalBytes, 1000);
  assert.equal(snap.apps[0].simId, undefined);
  assert.throws(() => normalizeSnapshot({ ...snap, scope: "sim-1" }), /scope/);
  assert.throws(() => normalizeSnapshot({ ...snap, totalBytes: NaN }), /byte/);
});
