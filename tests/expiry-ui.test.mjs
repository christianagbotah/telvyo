import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEmpty } from "../dist/model.js";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "https://telvyo.test/" });
const { window } = dom;
for (const key of [
  "document", "localStorage", "FormData", "Blob",
  "HTMLElement", "HTMLDialogElement",
]) globalThis[key] = window[key];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const now = Date.now();
const iso = (hours) => new Date(now + hours * 3600000).toISOString();
const state = createEmpty();
state.purchases = [
  { id: "soon", simId: "mtn", type: "data", amount: 2000,
    cost: 12, timestamp: iso(-24), expiresAt: iso(24) },
  { id: "expired", simId: "telecel", type: "data", amount: 1000,
    cost: 7, timestamp: iso(-48), expiresAt: iso(-1) },
];
localStorage.setItem("telco.mode", "personal");
localStorage.setItem("telco.personal.v1", JSON.stringify(state));

await import("../dist/app.js");
const $ = (selector) => document.querySelector(selector);
const click = (selector) => { assert.ok($(selector), selector); $(selector).click(); };
const saved = () => JSON.parse(localStorage.getItem("telco.personal.v1"));
const submit = () => {
  const form = $("#record-form");
  assert.ok(form);
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal($("#form-error")?.textContent || "", "");
};

assert.ok($(".expiry-panel"));
assert.match($(".expiry-panel").textContent, /Bundle expiry watch/);
assert.match($(".expiry-panel").textContent, /Expires soon/);
assert.match($(".expiry-panel").textContent, /Expiry passed/);
assert.match($(".expiry-panel").textContent, /not adjusted for bundle expiry/);
assert.ok($('[aria-label="Usage alerts — bundle expiry reminder"] .notice-dot'));
click('[data-action="alerts"]');
assert.match($("#modal").textContent, /Bundle expiry reminders/);
assert.match($("#modal").textContent, /Confirm the actual balance with your network/);
click('[data-action="close"]');

click('[data-page="purchases"]');
assert.match(document.body.textContent, /Recorded expiry:/);
click('[data-action="edit-record"][data-kind="purchase"][data-id="soon"]');
assert.equal($("#f-expiresAt").type, "datetime-local");
assert.ok($("#f-expiresAt").value, "Existing expiry should load into edit form");
$("#f-expiresAt").value = "";
submit();
assert.equal(saved().purchases.find(r => r.id === "soon").expiresAt, undefined);
assert.equal(saved().purchases.find(r => r.id === "soon").amount, 2000);
assert.equal(saved().purchases.find(r => r.id === "soon").cost, 12);
assert.equal(saved().purchases.find(r => r.id === "expired").expiresAt, iso(-1));
assert.match(document.body.textContent, /Recorded expiry:/);
click('[data-page="overview"]');
assert.equal(document.querySelectorAll(".expiry-status.soon").length, 0);
assert.equal(document.querySelectorAll(".expiry-status.expired").length, 1);
console.log("PASS: bundle expiry watch, accessibility, source disclaimers and edit/remove persistence");
window.close();
