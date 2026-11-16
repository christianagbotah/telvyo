import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createEmpty, createDemo } from "../dist/model.js";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "https://telvyo.test/" });
const { window } = dom;
for (const name of ["document", "localStorage", "FormData", "Blob",
  "HTMLElement", "HTMLDialogElement"]) globalThis[name] = window[name];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const timestamp = new Date(Date.now() - 60000).toISOString();
const purchase = (id, simId, cost) =>
  ({ id, simId, type:"data", amount:1000, cost, timestamp });
const original = createEmpty();
original.sims[0].label = "My real SIM";
original.purchases = [purchase("modified", "mtn", 7), purchase("removed", "mtn", 10)];
const incoming = createEmpty();
incoming.sims[0].label = "Restored SIM";
incoming.purchases = [purchase("modified", "mtn", 9), purchase("added", "telecel", 12)];
const demoBackup = JSON.stringify(createDemo());
localStorage.setItem("telco.mode", "personal");
localStorage.setItem("telco.personal.v1", JSON.stringify(original));
localStorage.setItem("telco.demo.v1", demoBackup);

let selectedFile;
const oldClick = window.HTMLInputElement.prototype.click;
window.HTMLInputElement.prototype.click = function () {
  if (this.type === "file") { selectedFile = this; return; }
  return oldClick.call(this);
};
await import("../dist/app.js");
const $ = selector => document.querySelector(selector);
const click = selector => { assert.ok($(selector), selector); $(selector).click(); };
const stored = () => JSON.parse(localStorage.getItem("telco.personal.v1"));
const submit = () => {
  assert.ok($("#restore-form"), "Restore confirmation form is visible");
  $("#restore-form").dispatchEvent(
    new window.Event("submit", { bubbles:true, cancelable:true }),
  );
};
async function provideBackup(value) {
  click('[data-action="import"]');
  assert.ok(selectedFile && selectedFile.type === "file");
  const text = JSON.stringify(value);
  Object.defineProperty(selectedFile, "files", {
    configurable:true, value:[{size:text.length,text:async()=>text}],
  });
  selectedFile.dispatchEvent(new window.Event("change"));
  await new Promise(resolve => setTimeout(resolve, 0));
}

click('[data-page="settings"]');
await provideBackup({app:"Telvyo",workspace:"personal",data:incoming});
assert.equal($("#modal").open,true);
assert.match($("#modal").textContent,/Review backup replacement/);
assert.match($("#modal").textContent,/Replacing, not merging/);
const items = [...document.querySelectorAll(".restore-review-row")];
assert.equal(items.length,5);
const purchases = items.find(x => x.textContent.includes("Purchases"));
assert.ok(purchases);
assert.match(purchases.textContent,/2/);
assert.match(purchases.textContent,/\+1 \/ −1 \/ ~1/);
assert.match($("#modal").textContent,/Your current SIM settings and personal history/);
assert.deepEqual(stored(),original);

$("#restore-confirmation").value="REPLACE";
submit();
assert.match($("#restore-error").textContent,/Type RESTORE exactly/);
assert.deepEqual(stored(),original);

const set = window.Storage.prototype.setItem;
window.Storage.prototype.setItem=function(){throw Error("storage unavailable");};
$("#restore-confirmation").value="RESTORE";
submit();
assert.match($("#restore-error").textContent,/could not save this backup/);
assert.deepEqual(stored(),original,"Failure must not overwrite current local data");
window.Storage.prototype.setItem=set;

// A write that succeeded but fails verification must be rolled back.
const get = window.Storage.prototype.getItem;
let checked = 0;
window.Storage.prototype.getItem=function(key){
  if(key==="telco.personal.v1" && ++checked===2)return "unverified";
  return get.call(this,key);
};
submit();
window.Storage.prototype.getItem=get;
assert.match($("#restore-error").textContent,/could not save this backup/);
assert.deepEqual(stored(),original,"Unverified writes must roll back to current data");

submit();
assert.equal($("#modal").open,false);
assert.deepEqual(stored(),incoming);
assert.equal(localStorage.getItem("telco.demo.v1"),demoBackup);
assert.match(document.body.textContent,/Personal workspace/);
click('[data-page="sims"]');
assert.match(document.body.textContent,/Restored SIM/);
assert.doesNotMatch(document.body.textContent,/My real SIM/);

// Unknown workspace type is not silently mapped to the personal workspace.
click('[data-page="settings"]');
await provideBackup({app:"Telvyo",workspace:"other-user",data:original});
assert.equal($("#modal").open,false);
assert.deepEqual(stored(),incoming);
// A demo export cannot be imported into the personal workspace.
await provideBackup({app:"Telvyo",workspace:"demo",data:createDemo()});
assert.equal($("#modal").open,false);
assert.deepEqual(stored(),incoming);

window.HTMLInputElement.prototype.click=oldClick;
console.log("PASS: visible backup changes, typed confirmation, storage fail-closed, workspace safety and demo isolation");
window.close();
