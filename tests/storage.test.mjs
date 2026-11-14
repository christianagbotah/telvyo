import { createEmpty } from "../dist/model.js";
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
localStorage.setItem("telco.mode", "demo");
localStorage.setItem("telco.personal.v1", JSON.stringify(createEmpty()));
window.Storage.prototype.setItem = function () {
  throw new Error("Storage blocked");
};
await import("../dist/app.js");
const $ = (s) => document.querySelector(s),
  click = (s) => $(s).click();
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
click('[data-page="purchases"]');
click('[data-action="add"][data-tab="airtime"]');
$('[name="amount"]').value = "12";
$('[name="cost"]').value = "12";
$("form").dispatchEvent(
  new window.Event("submit", { bubbles: true, cancelable: true }),
);
assert.match(document.body.textContent, /12.00/);
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
click('[data-page="purchases"]');
assert.match(
  document.body.textContent,
  /12.00/,
  "An unsaved purchase must survive switching between workspaces",
);
console.log(
  "PASS: storage failure keeps records in memory across workspace switches",
);
window.close();
