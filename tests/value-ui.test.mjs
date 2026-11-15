import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEmpty } from "../dist/model.js";
const dom = new JSDOM(
  await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  { url: "https://telvyo.test/" },
);
const { window } = dom;
for (const name of ["document", "localStorage", "FormData", "Blob",
  "HTMLElement", "HTMLDialogElement"]) globalThis[name] = window[name];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const state = createEmpty();
const time = new Date(Date.now() - 3600000).toISOString();
state.purchases = [
  { id:"p1", simId:"mtn", type:"data", amount:1000, cost:8, timestamp:time },
  { id:"p2", simId:"mtn", type:"data", amount:500, cost:0, timestamp:time },
  { id:"p3", simId:"telecel", type:"data", amount:2000, cost:12, timestamp:time },
];
localStorage.setItem("telco.mode", "personal");
localStorage.setItem("telco.personal.v1", JSON.stringify(state));
await import("../dist/app.js");
const $ = (selector) => document.querySelector(selector);
const click = (selector) => { assert.ok($(selector), selector); $(selector).click(); };
click('[data-page="purchases"]');
assert.ok($(".bundle-value-card"));
assert.match($(".bundle-value-card").textContent, /What your bundles cost/);
assert.match($(".bundle-value-card").textContent, /not today's network prices/);
assert.equal(document.querySelectorAll(".bundle-value-item").length, 2);
const rows = [...document.querySelectorAll(".bundle-value-item")];
assert.match(rows[0].textContent, /8\.00/);
assert.match(rows[0].textContent, /complimentary allowance excluded/);
assert.match(rows[1].textContent, /6\.00/);
assert.match(rows[1].textContent, /Lowest recorded/);
assert.match($(".bundle-value-card").textContent, /not proof of the best current offer/);
click('[data-sim="mtn"]');
assert.equal(document.querySelectorAll(".bundle-value-item").length, 1);
assert.doesNotMatch($(".bundle-value-card").textContent, /Lowest recorded ₵\/GB/);
assert.match($(".bundle-value-card").textContent, /8\.00/);
click('[data-sim="all"]');
assert.equal(document.querySelectorAll(".bundle-value-item").length, 2);
assert.equal(localStorage.getItem("telco.personal.v1"), JSON.stringify(state), "Pure comparison cannot mutate data");
console.log("PASS: local bundle value comparison, complimentary data, filters and honest price claims");
window.close();
