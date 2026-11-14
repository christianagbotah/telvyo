import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const dom = new JSDOM(
  await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  { url: "https://telco.test/" },
);
const { window } = dom;
for (const key of [
  "document",
  "localStorage",
  "FormData",
  "Blob",
  "HTMLElement",
  "HTMLDialogElement",
])
  globalThis[key] = window[key];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
await import("../dist/app.js");
const $ = (s) => document.querySelector(s),
  click = (s) => {
    assert.ok($(s), s);
    $(s).click();
  };
const set = (name, value) => {
  $(`[name="${name}"]`).value = value;
};
assert.match(document.body.textContent, /Start with your SIMs/);
assert.ok($(".heading-actions [data-action=add-sim]"));
assert.ok($(".setup-empty [data-action=add-sim]"));
assert.match(document.body.textContent, /Automatic phone measurements require the Android app/);
assert.match(document.body.textContent, /Personal workspace/);
assert.equal(document.querySelectorAll(".sim-item").length, 0);
click('[data-page="device"]');
assert.match(document.body.textContent, /Carrier billing connections/);
assert.match(document.body.textContent, /Not connected/);
assert.equal($('[data-action="detect-sims"]').disabled, true);
assert.equal($('[data-action="usage-settings"]').disabled, true);
assert.equal($('[data-action="refresh-device"]').disabled, true);
assert.match(document.body.textContent, /Android required/);
click('[data-page="insights"]');
assert.match(document.body.textContent, /Not enough data/);
click(
  '[data-action="advisor-prompt"][data-question="How long will my data last?"]',
);
assert.match($(".advisor-answer").textContent, /cannot estimate/);
click('[data-page="device"]');
click('[data-page="sims"]');
click('[data-action="add-sim"]');
set("carrier", "MTN");
set("label", "My main SIM");
set("rate", "");
$("form").dispatchEvent(
  new window.Event("submit", { bubbles: true, cancelable: true }),
);
const state = JSON.parse(localStorage.getItem("telco.personal.v1"));
assert.equal(state.sims.length, 1);
assert.equal(state.sims[0].rateSource, "unset");
click('[data-page="airtime"]');
click('[data-action="add"][data-tab="call"]');
assert.equal($("#f-costmode").value, "actual");
assert.equal($('#f-costmode option[value="estimate"]').disabled, true);
assert.equal($("#actual-cost-field").hidden, false);
set("contact", "Recorded call");
set("minutes", "1");
set("seconds", "20");
set("cost", "1.25");
$("form").dispatchEvent(
  new window.Event("submit", { bubbles: true, cancelable: true }),
);
assert.equal(
  JSON.parse(localStorage.getItem("telco.personal.v1")).calls[0].cost,
  1.25,
);
console.log(
  "PASS: fresh onboarding, honest browser capabilities, disconnected carriers, local insights and unset tariff handling.",
);
window.close();
