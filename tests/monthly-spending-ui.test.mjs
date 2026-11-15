import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEmpty } from "../dist/model.js";

const dom = new JSDOM(
  await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  { url: "https://telvyo.test/" },
);
const { window } = dom;
for (const key of [
  "document", "localStorage", "FormData", "Blob",
  "HTMLElement", "HTMLDialogElement",
]) globalThis[key] = window[key];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const state = createEmpty();
state.sims[0].monthlySpendLimit = 60;
state.sims[1].monthlySpendLimit = 20;
const recent = new Date(Date.now() - 60000).toISOString();
state.purchases = [
  { id:"paid-mtn",simId:"mtn",type:"data",amount:1000,cost:40,timestamp:recent },
  { id:"topup-mtn",simId:"mtn",type:"airtime",amount:10,cost:10,timestamp:recent },
  { id:"paid-telecel",simId:"telecel",type:"data",amount:2000,cost:25,timestamp:recent },
];
state.calls = [{
  id:"call",simId:"mtn",duration:60,estimated:false,cost:5,
  contact:"Contact",timestamp:recent,
}];
localStorage.setItem("telco.mode", "personal");
localStorage.setItem("telco.personal.v1", JSON.stringify(state));

await import("../dist/app.js");
const $ = (selector) => document.querySelector(selector);
const click = (selector) => { assert.ok($(selector), selector); $(selector).click(); };
const submit = () => {
  assert.ok($("#sim-form"), "SIM form must open");
  $("#sim-form").dispatchEvent(new window.Event("submit", { bubbles:true, cancelable:true }));
  assert.equal($("#form-error")?.textContent || "", "");
};
const saved = () => JSON.parse(localStorage.getItem("telco.personal.v1"));

assert.ok($(".monthly-spending-panel"), "Configured budgets appear on Overview");
assert.match($(".monthly-spending-panel").textContent, /Monthly spending/);
assert.match($(".monthly-spending-panel").textContent, /call charges are excluded/);
assert.match($(".monthly-spending-panel").textContent, /Missing purchases and refunds are not included/);
assert.equal(document.querySelectorAll(".monthly-spending-row").length, 2);
assert.equal(document.querySelectorAll(".monthly-spending-row.approaching").length, 1);
assert.equal(document.querySelectorAll(".monthly-spending-row.reached").length, 1);
assert.equal($(".monthly-spending-row.approaching .monthly-spending-amount strong").textContent, "₵ 50.00");
assert.equal($(".monthly-spending-row.reached .monthly-spending-amount strong").textContent, "₵ 25.00");
assert.ok($('[aria-label="Usage alerts — spending warning"] .notice-dot'));
assert.equal($(".monthly-spending-row.approaching [role=progressbar]").getAttribute("aria-valuenow"), "83");
assert.equal($(".monthly-spending-row.reached [role=progressbar]").getAttribute("aria-valuenow"), "100");

click('[data-action="alerts"]');
assert.match($("#modal").textContent, /Monthly spending budgets/);
assert.match($("#modal").textContent, /Approaching monthly spending budget/);
assert.match($("#modal").textContent, /Monthly spending budget reached/);
click('[data-action="close"]');

click('[data-page="purchases"]');
assert.ok($(".monthly-spending-panel"));
assert.match($(".monthly-spending-panel").textContent, /Calendar month, not the selected day range/);
click('[data-sim="mtn"]');
assert.equal(document.querySelectorAll(".monthly-spending-row").length, 1);
click('[data-sim="all"]');
assert.equal(document.querySelectorAll(".monthly-spending-row").length, 2);

click('[data-page="sims"]');
assert.match(document.body.textContent, /Monthly spending budget/);
click('[data-action="edit-sim"][data-id="mtn"]');
assert.equal($("#f-monthlySpendLimit").value, "60");
$("#f-monthlySpendLimit").value = "";
submit();
assert.equal(saved().sims[0].monthlySpendLimit, null, "Empty field disables budget");
assert.equal(saved().sims[1].monthlySpendLimit, 20);
click('[data-action="edit-sim"][data-id="telecel"]');
$("#f-monthlySpendLimit").value = "";
submit();
assert.equal(saved().sims[1].monthlySpendLimit, null);
click('[data-page="overview"]');
assert.equal($(".monthly-spending-panel"), null, "Overview hides unused spend panel");
assert.equal($('[aria-label="Usage alerts"] .notice-dot'), null, "No false warning after budgets disabled");
click('[data-page="purchases"]');
assert.match($(".monthly-spending-panel").textContent, /Configure a monthly spending target/);

click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
assert.equal($('[aria-label="Usage alerts"] .notice-dot'), null, "Demo cannot trigger personal spend warning");
console.log("PASS: per-SIM month budgets, alerts, purchase filters, form editing, optional limits and demo isolation");
window.close();
