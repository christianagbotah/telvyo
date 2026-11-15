import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEmpty, createDemo } from "../dist/model.js";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "https://telvyo.test/" });
const { window } = dom;
for (const key of ["document", "localStorage", "FormData", "Blob",
    "HTMLElement", "HTMLDialogElement"]) globalThis[key] = window[key];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const personal = createEmpty();
personal.purchases.push({
  id: "p-private", simId: "mtn", type: "data", amount: 2000,
  cost: 17.5, timestamp: new Date(Date.now() - 60000).toISOString(),
});
const demoData = createDemo();
localStorage.setItem("telco.mode", "personal");
localStorage.setItem("telco.personal.v1", JSON.stringify(personal));
localStorage.setItem("telco.demo.v1", JSON.stringify(demoData));

await import("../dist/app.js");
const $ = (selector) => document.querySelector(selector);
const click = (selector) => { assert.ok($(selector), selector); $(selector).click(); };
const submit = () => {
  assert.ok($("#erase-local-form"));
  $("#erase-local-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
};

click('[data-page="settings"]');
assert.match(document.body.textContent, /Privacy & local data/);
assert.match(document.body.textContent, /Erase all personal data/);
assert.match(document.body.textContent, /does not delete any external carrier records/);
click('[data-action="erase-local"]');
assert.equal($("#modal").open, true);
assert.match($("#modal").textContent, /Type DELETE to confirm/);
assert.equal($("#erase-local-confirm").getAttribute("maxlength"), "6");

$("#erase-local-confirm").value = "CLEAR";
submit();
assert.match($("#erase-local-error").textContent, /Type DELETE exactly/);
assert.ok(localStorage.getItem("telco.personal.v1"), "Wrong confirmation must preserve records");

const originalRemove = window.Storage.prototype.removeItem;
window.Storage.prototype.removeItem = function () { throw Error("storage disabled"); };
$("#erase-local-confirm").value = "DELETE";
submit();
assert.match($("#erase-local-error").textContent, /could not erase saved records/i);
assert.ok(localStorage.getItem("telco.personal.v1"), "Storage failure must preserve records");
assert.match(document.body.textContent, /Erase all personal data/);
window.Storage.prototype.removeItem = originalRemove;

submit();
assert.equal(localStorage.getItem("telco.personal.v1"), null);
assert.equal(localStorage.getItem("telco.demo.v1"), JSON.stringify(demoData));
assert.equal(localStorage.getItem("telco.mode"), "personal");
assert.equal(document.querySelectorAll(".sim-item").length, 0);
assert.match(document.body.textContent, /Choose the right SIM for each record/);
assert.equal($("#modal").open, false);

click('[data-page="settings"]');
assert.equal($('[data-action="erase-local"]').disabled, false);
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
assert.equal(localStorage.getItem("telco.mode"), "demo");
click('[data-page="settings"]');
assert.equal($('[data-action="erase-local"]').disabled, true);
assert.match(document.body.textContent, /Demo workspace/);
assert.equal(localStorage.getItem("telco.demo.v1"), JSON.stringify(demoData));
console.log("PASS: typed confirmation, persistent wipe, storage-failure safety, demo isolation and truthful privacy UI");
window.close();
