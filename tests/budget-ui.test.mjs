import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEmpty } from "../dist/model.js";

const html=await readFile(new URL("../dist/index.html",import.meta.url),"utf8");
const dom=new JSDOM(html,{url:"https://telvyo.test/"});
const {window}=dom;
for(const key of ["document","localStorage","FormData","Blob","HTMLElement","HTMLDialogElement"]) globalThis[key]=window[key];
globalThis.window=window;
window.scrollTo=()=>{};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};

const data=createEmpty();
data.sims[0].dailyLimitMB=1000;
data.sims[1].dailyLimitMB=500;
const time=new Date(Date.now()-60000).toISOString();
data.usage=[
 {id:"mtn-u1",simId:"mtn",app:"Video",mb:850,background:false,timestamp:time},
 {id:"other-u1",simId:"telecel",app:"Downloads",mb:600,background:true,timestamp:time}
];
localStorage.setItem("telco.mode","personal");
localStorage.setItem("telco.personal.v1",JSON.stringify(data));
await import("../dist/app.js");

const $=selector=>document.querySelector(selector);
const click=selector=>{assert.ok($(selector),selector);$(selector).click();};
assert.match($(".budget-panel").textContent,/Today's data budgets/);
assert.match($(".budget-panel").textContent,/Approaching the daily budget/);
assert.match($(".budget-panel").textContent,/above budget/);
assert.match($(".budget-panel").textContent,/not a carrier balance or background phone measurement/);
assert.equal(document.querySelectorAll(".budget-item").length,2);
assert.equal(document.querySelectorAll(".budget-item.reached").length,1);
assert.equal(document.querySelectorAll(".budget-item.approaching").length,1);
assert.equal($('[aria-label="Usage alerts — budget warning"] .notice-dot')!==null,true);
assert.equal($(".budget-item.reached [role=progressbar]").getAttribute("aria-valuenow"),"100");
assert.equal($(".budget-item.approaching [role=progressbar]").getAttribute("aria-valuenow"),"85");
click('[data-action="alerts"]');
assert.match($("#modal").textContent,/No carrier feed or background notifications are active/);
assert.match($("#modal").textContent,/Consider Wi-Fi/);
click('[data-action="close"]');
click('[data-action="switch-mode"]');
click('[data-action="confirm-switch"]');
assert.equal($('[aria-label="Usage alerts"] .notice-dot'),null,"Demo must not display an urgent personal budget badge");
console.log("PASS: per-SIM live budget warnings, clear source, accessible progress and demo isolation");
window.close();
