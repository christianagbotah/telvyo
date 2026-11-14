import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createEmpty } from "../dist/model.js";

// A missing implementation becomes a behavioral assertion failure on the first run.
const insights = await import("../dist/insights.js").catch((error) => {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  return {};
});
const analyze = (...args) => {
  assert.equal(
    typeof insights.analyzeUsage,
    "function",
    "analyzeUsage must analyze the actual ledger",
  );
  return insights.analyzeUsage(...args);
};
const answer = (...args) => {
  assert.equal(
    typeof insights.generateAnswer,
    "function",
    "generateAnswer must return grounded local advice",
  );
  return insights.generateAnswer(...args);
};
const NOW = new Date(2026, 10, 14, 13).getTime();
const stamp = (day, hour = 12) => new Date(2026, 10, day, hour).toISOString();
const record = (day, mb, overrides = {}) => ({
  id: `u-${day}-${mb}`,
  simId: "mtn",
  app: "YouTube",
  mb,
  background: false,
  timestamp: stamp(day),
  ...overrides,
});
const ledger = (records = [], amount = 2000) => ({
  ...createEmpty(),
  usage: records,
  purchases: [
    {
      id: "p1",
      simId: "mtn",
      type: "data",
      amount,
      cost: 20,
      timestamp: stamp(1),
    },
  ],
});

test("empty history cannot produce usage claims or forecasts", () => {
  const result = analyze(createEmpty(), { now: NOW });
  assert.equal(result.daysObserved, 0);
  assert.equal(result.hasEnoughHistory, false);
  assert.equal(result.averageDailyMB, 0);
  assert.equal(result.projectedDaysRemaining, null);
  assert.equal(result.projectedDate, null);
  assert.equal(result.topApp, null);
  assert.equal(result.backgroundShare, 0);
  assert.deepEqual(result.anomalies, []);
  assert.equal(result.confidence, "limited");
  assert.match(result.coverageNote, /no completed|0 completed/i);
  assert.match(result.coverageNote, /missing|unrecorded/i);
});

test("blank manual days are unknown, not zero, and today is incomplete", () => {
  const result = analyze(
    ledger([record(10, 100), record(13, 300), record(14, 999)]),
    { now: NOW },
  );
  assert.equal(result.daysObserved, 2);
  assert.equal(result.averageDailyMB, 200);
  assert.equal(result.hasEnoughHistory, false);
  assert.equal(result.projectedDaysRemaining, null);
  assert.deepEqual(result.topApp, { name: "YouTube", mb: 400, percent: 100 });
  assert.match(result.coverageNote, /2 of 4/);
  assert.match(result.coverageNote, /not.*zero|unknown/i);
});

test("forecast uses recorded completed days and subtracts current-day usage from the ledger balance", () => {
  const result = analyze(
    ledger([
      record(11, 100),
      record(12, 200),
      record(13, 300),
      record(14, 400),
    ]),
    { now: NOW },
  );
  assert.equal(result.daysObserved, 3);
  assert.equal(result.hasEnoughHistory, true);
  assert.equal(result.averageDailyMB, 200);
  assert.equal(result.projectedDaysRemaining, 5);
  assert.equal(result.projectedDate, "2026-11-19");
  assert.equal(result.confidence, "moderate");
  assert.match(result.coverageNote, /expir|billing/i);
});

test("only the last seven completed local days influence activity metrics", () => {
  const result = analyze(
    ledger(
      [
        record(6, 3000),
        record(7, 100),
        record(8, 100),
        record(13, 100),
        record(14, 700),
        record(15, 9000),
        record(12, Infinity),
        record(12, 500, { timestamp: "2026-02-30T12:00:00Z" }),
        record(12, 500, { simId: "missing" }),
      ],
      10000,
    ),
    { now: NOW },
  );
  assert.equal(result.daysObserved, 3);
  assert.equal(result.averageDailyMB, 100);
  assert.equal(result.topApp.mb, 300);
  assert.equal(result.projectedDaysRemaining, 60);
  assert.match(result.coverageNote, /3 of 7/);
});

test("app share and background share describe recorded completed-day data", () => {
  const result = analyze(
    ledger([
      record(11, 200),
      record(12, 100, { app: "Chrome", background: true }),
      record(13, 100, { app: "Chrome" }),
      record(14, 1000, { app: "TikTok", background: true }),
    ]),
    { now: NOW },
  );
  assert.deepEqual(result.topApp, { name: "Chrome", mb: 200, percent: 50 });
  assert.equal(result.backgroundShare, 25);
});

test("anomalies require three recorded days, twice the median and over 100 MB extra", () => {
  const result = analyze(
    ledger([
      record(11, 100),
      record(12, 100),
      record(13, 900, { app: "Video app" }),
    ]),
    { now: NOW },
  );
  assert.deepEqual(result.anomalies, [
    {
      date: "2026-11-13",
      mb: 900,
      baselineMB: 100,
      ratio: 9,
      app: "Video app",
    },
  ]);
  assert.deepEqual(
    analyze(ledger([record(12, 100), record(13, 900)]), { now: NOW }).anomalies,
    [],
  );
  assert.deepEqual(
    analyze(ledger([record(11, 10), record(12, 10), record(13, 110)]), {
      now: NOW,
    }).anomalies,
    [],
  );
  assert.deepEqual(
    analyze(ledger([record(11, 200), record(12, 200), record(13, 400)]), {
      now: NOW,
    }).anomalies,
    [],
  );
  assert.match(
    result.recommendations.find((item) => item.id === "review-spike").detail,
    /cannot|does not|may|could/i,
  );
});

test("zero or overdrawn balance does not produce a positive, negative or zero-day forecast", () => {
  for (const amount of [500, 600]) {
    const result = analyze(
      ledger([record(11, 100), record(12, 200), record(13, 300)], amount),
      { now: NOW },
    );
    assert.equal(result.projectedDaysRemaining, null);
    assert.equal(result.projectedDate, null);
  }
});

test("SIM filtering keeps independent balances and metrics isolated", () => {
  const state = ledger([
    record(11, 100),
    record(12, 200),
    record(13, 300),
    record(13, 900, { simId: "telecel", app: "TikTok" }),
  ]);
  const result = analyze(state, { simId: "mtn", now: NOW });
  assert.equal(result.averageDailyMB, 200);
  assert.equal(result.topApp.name, "YouTube");
  assert.equal(result.projectedDaysRemaining, 7);
  const unknown = analyze(state, { simId: "missing", now: NOW });
  assert.equal(unknown.daysObserved, 0);
  assert.equal(unknown.projectedDaysRemaining, null);
});

test("source remains honest and recommendations expose factual evidence", () => {
  const state = ledger([
    record(11, 100),
    record(12, 200),
    record(13, 300, { background: true }),
  ]);
  const manual = analyze(state, { now: NOW });
  const demo = analyze(state, { now: NOW, source: "demo" });
  assert.equal(manual.source, "manual");
  assert.equal(demo.source, "demo");
  assert.match(manual.coverageNote, /manual/i);
  assert.match(demo.coverageNote, /sample|demo/i);
  assert.match(answer("Where did my data go?", demo), /demo|sample/i);
  for (const advice of manual.recommendations) {
    assert.equal(typeof advice.id, "string");
    assert.ok(advice.title.length > 0);
    assert.ok(advice.detail.length > 0);
    assert.ok(advice.evidence.length > 0);
  }
});

test("advisor answers supported questions with measured metrics and explicit limits", () => {
  const result = analyze(
    ledger([record(11, 100), record(12, 200), record(13, 300)]),
    { now: NOW },
  );
  assert.match(
    answer("Where did my data go?", result),
    /YouTube.*600 MB.*100%/i,
  );
  assert.match(
    answer("Why is my data finishing so fast?", result),
    /cannot.*(cause|reason)|does not.*(cause|reason)/i,
  );
  assert.match(answer("How many days do I have left?", result), /7 days/i);
  assert.match(answer("How can I save data?", result), /YouTube/i);
  assert.match(
    answer("What is my call rate?", result),
    /carrier.*not connected|not connected.*carrier/i,
  );
  assert.match(
    answer("Can you connect to MTN carrier API?", result),
    /not connected/i,
  );
  assert.match(
    answer("Write a poem about stars", result),
    /no generative AI.*API.*configured/i,
  );
  assert.match(
    answer("How long until my data expires?", result),
    /expir.*cannot|cannot.*expir/i,
  );
});

test("advisor refuses to infer usage when there is no completed history", () => {
  const result = analyze(createEmpty(), { now: NOW });
  assert.match(
    answer("Where did my data go?", result),
    /no completed|no recorded/i,
  );
  assert.match(
    answer("How many days are remaining?", result),
    /cannot|not enough/i,
  );
  assert.doesNotMatch(
    answer("How many days are remaining?", result),
    /0 days/i,
  );
});

test("analysis and answers are deterministic, do not mutate state and never use the network", () => {
  const state = ledger([record(11, 100), record(12, 200), record(13, 300)]);
  const before = JSON.stringify(state);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Local insights must not call the network");
  };
  try {
    const first = analyze(state, { now: NOW });
    const second = analyze(state, { now: NOW });
    assert.deepEqual(first, second);
    assert.equal(
      answer("How can I save data?", first),
      answer("How can I save data?", second),
    );
    assert.equal(JSON.stringify(state), before);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("local calendar boundaries remain correct across UTC offsets and daylight saving", () => {
  const script = `
    import { analyzeUsage } from './dist/insights.js';
    import { createEmpty } from './dist/model.js';
    const state = createEmpty();
    const now = new Date(2026, 10, 3, 0, 30).getTime();
    state.usage = [
      [new Date(2026, 9, 26, 23, 59), 9000],
      [new Date(2026, 9, 27, 0, 0), 100],
      [new Date(2026, 10, 1, 12), 200],
      [new Date(2026, 10, 2, 23, 59), 300],
      [new Date(2026, 10, 3, 0, 1), 7000]
    ].map(([date, mb], id) => ({ id: String(id), simId: 'mtn', app: 'App', mb, background: false, timestamp: date.toISOString() }));
    const result = analyzeUsage(state, { now });
    process.stdout.write(JSON.stringify({ days: result.daysObserved, average: result.averageDailyMB, mb: result.topApp.mb }));
  `;
  for (const TZ of [
    "America/New_York",
    "Pacific/Kiritimati",
    "Asia/Kolkata",
    "UTC",
  ]) {
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, TZ },
        encoding: "utf8",
      },
    );
    assert.equal(child.status, 0, `${TZ}: ${child.stderr}`);
    assert.deepEqual(
      JSON.parse(child.stdout),
      { days: 3, average: 200, mb: 600 },
      TZ,
    );
  }
});
