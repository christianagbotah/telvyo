import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  createEmpty,
  validateRecord,
  addRecord,
  filterRecords,
  summarize,
  dailyBudgetAlerts,
  callCharge,
  toCSV,
} from "../dist/model.js";

const NOW = new Date(2026, 10, 14, 13, 0, 0).getTime();
const stamp = (day, hour = 10, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();
const purchase = (overrides = {}) => ({
  id: "p1",
  simId: "mtn",
  type: "data",
  amount: 1000,
  cost: 10,
  timestamp: stamp(14),
  ...overrides,
});
const usage = (overrides = {}) => ({
  id: "u1",
  simId: "mtn",
  app: "YouTube",
  mb: 200,
  background: false,
  timestamp: stamp(14),
  ...overrides,
});
const call = (overrides = {}) => ({
  id: "c1",
  simId: "mtn",
  contact: "Ama",
  duration: 90,
  cost: 0.5,
  estimated: true,
  timestamp: stamp(14),
  ...overrides,
});

test("empty accounts have independent default SIMs and zero totals", () => {
  const state = createEmpty();
  assert.equal(state.version, 1);
  assert.deepEqual(
    state.sims.map(({ id, slot }) => [id, slot]),
    [
      ["mtn", 1],
      ["telecel", 2],
    ],
  );
  assert.deepEqual([state.purchases, state.usage, state.calls], [[], [], []]);
  state.sims[0].label = "Changed";
  assert.notEqual(createEmpty().sims[0].label, "Changed");
  const total = summarize(createEmpty(), { now: NOW });
  assert.equal(total.dataUsedMB, 0);
  assert.equal(total.dataRemainingMB, 0);
  assert.equal(total.airtimeBalance, 0);
  assert.equal(total.daily.length, 7);
});

test("demo records are valid, purchased before consumption, and not in the future", () => {
  for (const now of [NOW, new Date(2026, 10, 14, 0, 1).getTime()]) {
    const state = createDemo(now);
    for (const [kind, records] of [
      ["purchase", state.purchases],
      ["usage", state.usage],
      ["call", state.calls],
    ]) {
      assert.ok(records.length > 0);
      for (const record of records) {
        assert.equal(validateRecord(kind, record, state, now), null);
        assert.ok(Date.parse(record.timestamp) <= now);
      }
    }
    for (const sim of state.sims) {
      const firstData = Math.min(
        ...state.purchases
          .filter((r) => r.simId === sim.id && r.type === "data")
          .map((r) => Date.parse(r.timestamp)),
      );
      const firstAirtime = Math.min(
        ...state.purchases
          .filter((r) => r.simId === sim.id && r.type === "airtime")
          .map((r) => Date.parse(r.timestamp)),
      );
      assert.ok(
        state.usage
          .filter((r) => r.simId === sim.id)
          .every((r) => Date.parse(r.timestamp) > firstData),
      );
      assert.ok(
        state.calls
          .filter((r) => r.simId === sim.id)
          .every((r) => Date.parse(r.timestamp) > firstAirtime),
      );
      const summary = summarize(state, { simId: sim.id, now });
      assert.ok(summary.dataRemainingMB > 0);
      assert.ok(summary.airtimeBalance > 0);
    }
    assert.deepEqual([...new Set(state.usage.map((r) => r.app))].sort(), [
      "Chrome",
      "Instagram",
      "Other",
      "Spotify",
      "TikTok",
      "WhatsApp",
      "YouTube",
    ]);
  }
});

test("validation rejects missing fields, bad numbers, unknown SIMs, and invalid dates", () => {
  const state = createEmpty();
  const invalid = [
    ["purchase", purchase({ amount: 0 })],
    ["purchase", purchase({ amount: Infinity })],
    ["purchase", purchase({ amount: "100" })],
    ["purchase", purchase({ cost: -1 })],
    ["purchase", purchase({ type: "mystery" })],
    ["purchase", purchase({ simId: "missing" })],
    ["purchase", purchase({ id: "" })],
    ["purchase", purchase({ timestamp: "not-a-date" })],
    ["purchase", purchase({ timestamp: "2026-02-30T10:00:00Z" })],
    ["purchase", purchase({ timestamp: stamp(15) })],
    ["usage", usage({ app: "   " })],
    ["usage", usage({ app: "x".repeat(81) })],
    ["usage", usage({ mb: NaN })],
    ["usage", usage({ background: undefined })],
    ["call", call({ duration: 0 })],
    ["call", call({ cost: Infinity })],
    ["call", call({ contact: "" })],
    ["call", call({ estimated: undefined })],
    ["unknown", {}],
    ["purchase", null],
  ];
  for (const [kind, record] of invalid)
    assert.equal(typeof validateRecord(kind, record, state, NOW), "string");
  assert.equal(
    validateRecord("purchase", purchase({ cost: 0 }), state, NOW),
    null,
  );
  assert.equal(validateRecord("call", call({ cost: 0 }), state, NOW), null);
  assert.equal(
    validateRecord("usage", usage({ app: "  YouTube  " }), state, NOW),
    null,
  );
});

test("SIM validation prevents duplicate slots while allowing edits to the same SIM", () => {
  const state = createEmpty();
  const sim = { ...state.sims[0], label: "My SIM" };
  assert.equal(validateRecord("sim", sim, state, NOW), null);
  for (const overrides of [
    { slot: 2 },
    { slot: 3 },
    { rate: -1 },
    { rate: NaN },
    { dailyLimitMB: 0 },
    { carrier: " " },
    { color: "" },
  ]) {
    assert.equal(
      typeof validateRecord("sim", { ...sim, ...overrides }, state, NOW),
      "string",
    );
  }
});

test("adding records clones state, trims names, and rejects duplicate ids without mutations", () => {
  const state = createEmpty();
  const input = usage({ app: "  YouTube  " });
  const next = addRecord(state, "usage", input, NOW);
  assert.equal(state.usage.length, 0);
  assert.equal(input.app, "  YouTube  ");
  assert.equal(next.usage[0].app, "YouTube");
  next.sims[0].label = "A changed label";
  assert.notEqual(state.sims[0].label, next.sims[0].label);
  assert.throws(
    () => addRecord(next, "usage", usage(), NOW),
    /already|duplicate/i,
  );
  assert.throws(() => addRecord(state, "call", call({ duration: -2 }), NOW));
  assert.equal(state.calls.length, 0);
});

test("SIM changes update the matching SIM without adding a duplicate", () => {
  const state = createEmpty();
  const next = addRecord(
    state,
    "sim",
    { ...state.sims[0], label: "  Work SIM  ", rate: 0.3 },
    NOW,
  );
  assert.equal(next.sims.length, 2);
  assert.equal(next.sims[0].label, "Work SIM");
  assert.equal(next.sims[0].rate, 0.3);
  assert.notEqual(state.sims[0].label, "Work SIM");
});

test("date filtering includes whole local days and excludes future and invalid timestamps", () => {
  const records = [
    usage({ id: "before", timestamp: stamp(7, 23, 59) }),
    usage({ id: "start", timestamp: stamp(8, 0) }),
    usage({ id: "today", timestamp: stamp(14, 0) }),
    usage({ id: "now", timestamp: new Date(NOW).toISOString() }),
    usage({ id: "later", timestamp: stamp(14, 14) }),
    usage({ id: "invalid", timestamp: "no" }),
    usage({ id: "other-sim", simId: "telecel", timestamp: stamp(14) }),
  ];
  assert.deepEqual(
    filterRecords(records, { simId: "mtn", days: 7, now: NOW }).map(
      (r) => r.id,
    ),
    ["start", "today", "now"],
  );
  assert.deepEqual(
    filterRecords(records, { days: 1, now: NOW }).map((r) => r.id),
    ["today", "now", "other-sim"],
  );
  assert.equal(records.length, 7);
});

test("summaries filter period activity but retain all-time balances", () => {
  const state = createEmpty();
  state.purchases = [
    purchase({ id: "old-data", timestamp: stamp(1), amount: 1000, cost: 10 }),
    purchase({
      id: "old-airtime",
      timestamp: stamp(1),
      type: "airtime",
      amount: 10,
      cost: 10,
    }),
    purchase({ id: "new-data", timestamp: stamp(13), amount: 500, cost: 5 }),
    purchase({ id: "other-data", simId: "telecel", amount: 1000, cost: 12 }),
  ];
  state.usage = [
    usage({ id: "old-use", timestamp: stamp(2), mb: 300 }),
    usage({ id: "youtube", timestamp: stamp(13), mb: 200 }),
    usage({
      id: "whatsapp",
      timestamp: stamp(14),
      app: "WhatsApp",
      mb: 50,
      background: true,
    }),
    usage({ id: "other-use", simId: "telecel", mb: 100 }),
  ];
  state.calls = [
    call({ id: "old-call", timestamp: stamp(2), cost: 2 }),
    call({ cost: 0.5 }),
  ];
  const summary = summarize(state, { simId: "mtn", days: 7, now: NOW });
  assert.equal(summary.dataUsedMB, 250);
  assert.equal(summary.dataRemainingMB, 950);
  assert.equal(summary.airtimeBalance, 7.5);
  assert.equal(summary.purchaseSpend, 5);
  assert.equal(summary.callSpend, 0.5);
  assert.equal(summary.callCount, 1);
  assert.equal(summary.callSeconds, 90);
  assert.deepEqual(summary.appUsage, [
    { app: "YouTube", mb: 200, backgroundMB: 0, percent: 80 },
    { app: "WhatsApp", mb: 50, backgroundMB: 50, percent: 20 },
  ]);
  assert.deepEqual(
    summary.daily.map((r) => [r.date, r.mb]),
    [
      ["2026-11-08", 0],
      ["2026-11-09", 0],
      ["2026-11-10", 0],
      ["2026-11-11", 0],
      ["2026-11-12", 0],
      ["2026-11-13", 200],
      ["2026-11-14", 50],
    ],
  );
  assert.equal(summary.usage.length, 2);
  assert.equal(summary.purchases.length, 1);
  assert.equal(summary.calls.length, 1);
});

test("data is clamped per SIM while negative airtime remains visible", () => {
  const state = createEmpty();
  state.purchases = [
    purchase({ amount: 100 }),
    purchase({ id: "p2", simId: "telecel", amount: 500 }),
  ];
  state.usage = [
    usage({ mb: 200 }),
    usage({ id: "u2", simId: "telecel", mb: 100 }),
  ];
  state.calls = [call({ cost: 2 })];
  const summary = summarize(state, { now: NOW });
  assert.equal(summary.dataRemainingMB, 400);
  assert.equal(summary.airtimeBalance, -2);
});

test("corrupt or future records do not poison summary math", () => {
  const state = createEmpty();
  state.purchases = [
    purchase(),
    purchase({ id: "future", timestamp: stamp(15), amount: 9999 }),
    purchase({ id: "corrupt", amount: NaN }),
  ];
  state.usage = [
    usage(),
    usage({ id: "unknown", simId: "unknown", mb: 500 }),
    usage({ id: "invalid", mb: Infinity }),
  ];
  state.calls = [
    call(),
    call({ id: "future", timestamp: stamp(15), cost: 10 }),
  ];
  const total = summarize(state, { now: NOW });
  assert.equal(total.dataUsedMB, 200);
  assert.equal(total.dataRemainingMB, 800);
  assert.equal(total.callSpend, 0.5);
});

test("call estimates charge each started minute and round to two decimals", () => {
  for (const [seconds, rate, amount] of [
    [0, 0.25, 0],
    [1, 0.25, 0.25],
    [60, 0.25, 0.25],
    [61, 0.25, 0.5],
    [120, 0.295, 0.59],
    [1, 0.295, 0.3],
  ]) {
    assert.equal(callCharge(seconds, rate), amount);
  }
  for (const [seconds, rate] of [
    [-1, 0.25],
    [NaN, 0.25],
    [30, Infinity],
    [30, -1],
  ])
    assert.throws(() => callCharge(seconds, rate));
});

test("CSV combines filtered record types, quotes cells, and neutralizes formula text", () => {
  const state = createEmpty();
  state.purchases = [purchase(), purchase({ id: "old", timestamp: stamp(1) })];
  state.usage = [
    usage({ app: '  =HYPERLINK("bad")' }),
    usage({ id: "other", simId: "telecel" }),
  ];
  state.calls = [
    call({ contact: 'Ama, "friend"\nMobile', estimated: false }),
    call({ id: "estimated", contact: "+233555", estimated: true }),
  ];
  const csv = toCSV(state, { simId: "mtn", days: 7, now: NOW });
  assert.ok(csv.includes("source"));
  assert.ok(csv.includes("purchase"));
  assert.ok(csv.includes("usage"));
  assert.ok(csv.includes("call"));
  assert.ok(csv.includes("manual"));
  assert.ok(csv.includes("estimated"));
  assert.ok(csv.includes("'=HYPERLINK("));
  assert.ok(csv.includes("'+233555"));
  assert.ok(csv.includes('"Ama, ""friend""\nMobile"'));
  assert.ok(!csv.includes('"old"'));
  assert.ok(!csv.includes('"other"'));
});

test("CSV marks every demo record as demo while preserving ordinary record sources", () => {
  const state = createEmpty();
  state.purchases = [purchase()];
  state.usage = [usage()];
  state.calls = [
    call({ estimated: false }),
    call({ id: "estimate", estimated: true }),
  ];
  const sources = (options) =>
    toCSV(state, { now: NOW, ...options })
      .split("\r\n")
      .slice(1)
      .map((row) => row.split(",").at(-1));
  assert.deepEqual(sources({}), [
    '"manual"',
    '"manual"',
    '"manual"',
    '"estimated"',
  ]);
  assert.deepEqual(sources({ demo: true }), [
    '"demo"',
    '"demo"',
    '"demo"',
    '"demo-estimated"',
  ]);
});

test("JSON persistence round trips preserve summaries and can be edited independently", () => {
  const state = createDemo(NOW);
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(
    summarize(restored, { now: NOW }),
    summarize(state, { now: NOW }),
  );
  const updated = addRecord(
    restored,
    "call",
    call({ id: "new-after-import" }),
    NOW,
  );
  assert.equal(updated.calls.length, state.calls.length + 1);
  assert.equal(restored.calls.length, state.calls.length);
});

test("daily manual budget warnings switch at 80% and 100% without mixing SIMs", () => {
  const state = createEmpty();
  state.sims[0].dailyLimitMB = 1000;
  state.sims[1].dailyLimitMB = 500;
  const update = (mb) => {
    state.usage = [usage({ mb }), usage({
      id: "u2", simId: "telecel", mb: 25, app: "Other",
    })];
  };
  update(799);
  let alerts = dailyBudgetAlerts(state, NOW);
  assert.equal(alerts.find(a => a.simId === "mtn").status, "within");
  assert.equal(alerts.find(a => a.simId === "mtn").remainingMB, 201);
  assert.equal(alerts.find(a => a.simId === "telecel").status, "within");
  update(800);
  alerts = dailyBudgetAlerts(state, NOW);
  assert.equal(alerts[0].status, "approaching");
  assert.equal(alerts[0].percentUsed, 80);
  update(1000);
  alerts = dailyBudgetAlerts(state, NOW);
  assert.equal(alerts[0].status, "reached");
  assert.equal(alerts[0].percentUsed, 100);
  assert.equal(alerts[0].exceededMB, 0);
  update(1200);
  alerts = dailyBudgetAlerts(state, NOW);
  assert.equal(alerts[0].status, "reached");
  assert.equal(alerts[0].exceededMB, 200);
  assert.equal(alerts[0].remainingMB, 0);
  assert.deepEqual(dailyBudgetAlerts({ ...createEmpty(), sims: [] }, NOW), []);
});

test("daily budget calculations ignore old entries and future or invalid records", () => {
  const state = createEmpty();
  state.sims[0].dailyLimitMB = 100;
  state.usage = [
    usage({ id: "old", mb: 1000, timestamp: stamp(13) }),
    usage({ id: "future", mb: 1000, timestamp: stamp(15) }),
    usage({ id: "bad", mb: -500 }),
    usage({ id: "today", mb: 82 }),
  ];
  const alert = dailyBudgetAlerts(state, NOW).find(a => a.simId === "mtn");
  assert.equal(alert.usedMB, 82);
  assert.equal(alert.status, "approaching");
  assert.equal(alert.remainingMB, 18);
});
