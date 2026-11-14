import { createEmpty } from "../dist/model.js";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const dom = new JSDOM(html, { url: "https://telco.test/" });
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
localStorage.setItem("telco.mode", "demo");
localStorage.setItem("telco.personal.v1", JSON.stringify(createEmpty()));
await import("../dist/app.js");
const $ = (s) => document.querySelector(s);
const click = (s) => {
  assert.ok($(s), "Missing " + s);
  $(s).click();
};
const set = (name, value) => {
  const el = $(`[name="${name}"]`);
  assert.ok(el, "Missing input " + name);
  el.value = value;
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
};
const submit = () => {
  $("dialog form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal($("#form-error")?.textContent || "", "");
};
const saved = () => JSON.parse(localStorage.getItem("telco.personal.v1"));
assert.match(document.body.textContent, /Your usage, understood/);
assert.equal($(".skip-link").getAttribute("href"), "#main-content");
assert.equal($("#main-content").getAttribute("tabindex"), "-1");
assert.equal($('.more-nav-button').getAttribute('aria-expanded'), 'false');
click('.more-nav-button');
assert.equal($('.more-nav-button').getAttribute('aria-expanded'), 'true');
assert.equal($('#mobile-more-sheet').hidden, false);
click('#mobile-more-sheet [data-page="purchases"]');
assert.match($('h1').textContent, /Know what you bought/);
assert.equal($('#mobile-more-sheet').hidden, true);
click('.more-nav-button');
document.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
assert.equal($('#mobile-more-sheet').hidden, true);
click('[data-page="overview"]');
assert.match(document.body.textContent, /9.00/);
click('[data-sim="mtn"]');
assert.match(document.body.textContent, /Across MTN/);
click('[data-page="data"]');
assert.equal($(".data-table tbody").rows.length, 32);
click('[data-action="app-detail"][data-app="YouTube"]');
assert.match($("#modal").textContent, /Background data/);
click('[data-action="close"]');
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
assert.match(document.body.textContent, /Personal workspace/);
assert.equal(localStorage.getItem("telco.mode"), "personal");
click('[data-action="edit-sim"][data-id="mtn"]');
set("rate", "1.25");
submit();
assert.equal(saved().sims[0].rate, 1.25);
click('[data-page="purchases"]');
click('[data-action="add"][data-tab="airtime"]');
set("amount", "5");
set("cost", "5");
submit();
assert.equal(saved().purchases.length, 1);
click('[data-page="airtime"]');
click('[data-action="add"][data-tab="call"]');
assert.equal($("#actual-cost-field").hidden, true);
set("contact", "Test caller");
set("minutes", "1");
set("seconds", "1");
submit();
assert.equal(saved().calls[0].cost, 2.5);
assert.equal(saved().calls[0].estimated, true);
assert.match(document.body.textContent, /2.50/);
click('[data-action="edit-record"][data-kind="call"]');
set("costMode", "actual");
assert.equal($("#actual-cost-field").hidden, false);
set("cost", "0.75");
submit();
assert.equal(saved().calls.length, 1);
assert.equal(saved().calls[0].cost, 0.75);
assert.equal(saved().calls[0].estimated, false);
click('[data-page="data"]');
click('[data-action="add"][data-tab="usage"]');
set("app", "<script>alert(1)</script>");
set("mb", "250");
submit();
assert.equal(saved().usage[0].mb, 250);
assert.equal(document.querySelectorAll("script").length, 1);
assert.match(document.body.textContent, /<script>alert\(1\)<\/script>/);
click('[data-sim="telecel"]');
assert.match(document.body.textContent, /No data in this period/);
click('[data-sim="all"]');
click('[data-action="delete-record"][data-kind="usage"]');
click('[data-action="confirm-delete"]');
assert.equal(saved().usage.length, 0);
click('[data-page="overview"]');
assert.match(document.body.textContent, /4.25/);
click('[data-page="settings"]');
assert.match(document.body.textContent, /Back up all records/);
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
assert.match(document.body.textContent, /Demo workspace/);
assert.equal(saved().calls[0].cost, 0.75);
console.log(
  "PASS: UI flow assertions across navigation, SIM/date view, mode separation, forms, edit/delete, estimates, persistence and XSS escaping.",
);
window.close();
