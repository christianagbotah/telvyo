import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmpty, validateRecord, addRecord, monthlySpending, summarize,
} from "../dist/model.js";

const NOW = new Date(2026, 10, 15, 18, 30, 0).getTime();
const purchase = (id, simId, type, cost, at) => ({
  id, simId, type, amount: type === "data" ? 1000 : 10,
  cost, timestamp: new Date(at).toISOString(),
});
const NOV = new Date(2026, 10, 5, 14).getTime();
const OCT = new Date(2026, 9, 20, 11).getTime();
const SEP = new Date(2026, 8, 30, 11).getTime();

test("optional monthly cash target preserves legacy SIMs and validates configured budgets", () => {
  const state = createEmpty();
  const legacy = { ...state.sims[0] };
  assert.equal(validateRecord("sim", legacy, state, NOW), null);
  for (const budget of [undefined, null, 0.01, 100, 10000000]) {
    assert.equal(validateRecord("sim", { ...legacy, monthlySpendLimit: budget }, state, NOW), null);
  }
  for (const budget of [0, -1, NaN, Infinity, "50", 0.001, 10000001]) {
    assert.match(
      validateRecord("sim", { ...legacy, monthlySpendLimit: budget }, state, NOW),
      /monthly spending budget/i,
    );
  }
  const changed = addRecord(state, "sim", { ...legacy, monthlySpendLimit: 250 }, NOW);
  assert.equal(changed.sims[0].monthlySpendLimit, 250);
  assert.equal(state.sims[0].monthlySpendLimit, undefined);
});

test("monthly calendar spending counts logged purchases, not prepaid call costs twice", () => {
  const state = createEmpty();
  state.sims[0].monthlySpendLimit = 60;
  state.sims[1].monthlySpendLimit = 20;
  state.purchases = [
    purchase("mtn-data", "mtn", "data", 40, NOV),
    purchase("mtn-airtime", "mtn", "airtime", 10, NOV),
    purchase("telecel-data", "telecel", "data", 25, NOV),
    purchase("last-month", "mtn", "data", 15, OCT),
    purchase("last-month-telecel", "telecel", "airtime", 5, OCT),
    purchase("sept", "mtn", "data", 300, SEP),
    purchase("future", "mtn", "airtime", 900, new Date(2026, 10, 16, 10).getTime()),
  ];
  state.calls = [{
    id:"call",simId:"mtn",contact:"Ama",duration:120,cost:9,
    estimated:false,timestamp:new Date(NOV).toISOString(),
  }];
  const result = monthlySpending(state, { now: NOW });
  assert.match(result.month, /November 2026/);
  assert.equal(result.totalSpent, 75);
  assert.equal(result.previousTotal, 20);
  assert.equal(result.configuredCount, 2);
  const mtn = result.rows[0];
  assert.equal(mtn.spent, 50);
  assert.equal(mtn.dataSpent, 40);
  assert.equal(mtn.airtimeSpent, 10);
  assert.equal(mtn.purchaseCount, 2);
  assert.equal(mtn.previousSpent, 15);
  assert.equal(mtn.status, "approaching");
  assert.equal(mtn.percentUsed, 83.3);
  assert.equal(mtn.remaining, 10);
  assert.equal(result.rows[1].status, "reached");
  assert.equal(result.rows[1].overBudget, 5);
  assert.equal(result.rows[1].previousSpent, 5);
});

test("monthly threshold boundaries and unset targets work without fabricated warnings", () => {
  const state = createEmpty();
  state.sims[0].monthlySpendLimit = 100;
  state.purchases = [purchase("mtn1", "mtn", "data", 79.99, NOV)];
  let row = monthlySpending(state, { now: NOW }).rows[0];
  assert.equal(row.status, "within");
  assert.equal(row.remaining, 20.01);
  state.purchases[0].cost = 80;
  row = monthlySpending(state, { now: NOW }).rows[0];
  assert.equal(row.status, "approaching");
  assert.equal(row.percentUsed, 80);
  state.purchases[0].cost = 100;
  row = monthlySpending(state, { now: NOW }).rows[0];
  assert.equal(row.status, "reached");
  assert.equal(row.overBudget, 0);
  state.purchases[0].cost = 125;
  row = monthlySpending(state, { now: NOW }).rows[0];
  assert.equal(row.overBudget, 25);
  const unset = monthlySpending(state, { now: NOW }).rows[1];
  assert.equal(unset.status, "unconfigured");
  assert.equal(unset.limit, null);
  assert.equal(unset.percentUsed, null);
  assert.equal(unset.remaining, null);
});

test("month resets on the first local day, keeps prior calendar month", () => {
  const state = createEmpty();
  state.sims[0].monthlySpendLimit = 100;
  const oct31 = new Date(2026, 9, 31, 23, 59, 59).getTime();
  const nov1 = new Date(2026, 10, 1, 0, 0, 1).getTime();
  state.purchases = [
    purchase("oct", "mtn", "data", 12, oct31),
    purchase("nov", "mtn", "data", 5, nov1),
  ];
  const result = monthlySpending(state, { now: new Date(2026, 10, 1, 0, 0, 2).getTime() });
  assert.equal(result.rows[0].spent, 5);
  assert.equal(result.rows[0].previousSpent, 12);
});

test("filters SIMs, stale/invalid/out-of-period records and empty data", () => {
  const state = createEmpty();
  state.sims[0].monthlySpendLimit = 30;
  state.purchases = [
    purchase("ok", "mtn", "airtime", 5, NOV),
    purchase("telecel", "telecel", "data", 100, NOV),
    purchase("old", "mtn", "data", 300, SEP),
    purchase("invalid", "mtn", "data", -10, NOV),
    purchase("unknown", "phantom", "data", 10, NOV),
  ];
  const result = monthlySpending(state, { simId: "mtn", now: NOW });
  assert.equal(result.rows.length, 1);
  assert.equal(result.totalSpent, 5);
  assert.equal(result.previousTotal, 0);
  assert.equal(result.rows[0].purchaseCount, 1);
  assert.deepEqual(monthlySpending({ ...state, sims: [] }, { now: NOW }).rows, []);
  assert.throws(() => monthlySpending(state, { now: NaN }), /valid current time/);
  assert.equal(summarize(state, { simId: "mtn", now: NOW }).callSpend, 0);
});
