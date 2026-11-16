import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const dom = new JSDOM(
  await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  {url:"https://localhost/"},
);
const {window}=dom;
for(const key of ["document","localStorage","FormData","Blob",
  "HTMLElement","HTMLDialogElement"])globalThis[key]=window[key];
globalThis.window=window;
window.scrollTo=()=>{};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};

let capabilities={
  platform:"android",androidApiLevel:35,simDetection:true,
  mobileUsageSupported:true,usageAccess:true,phonePermission:"granted",
};
let reads=0,scans=0,checks=0;
globalThis.Capacitor={
  isNativePlatform:()=>true,getPlatform:()=>"android",
  Plugins:{TelcoDevice:{
    getCapabilities:async()=>{checks++;return {...capabilities};},
    detectSims:async()=>{scans++;return {sims:[{
      subscriptionId:42,slot:1,carrier:"MTN",label:"My test SIM",
      isDefaultData:true,isDefaultVoice:false,
    }],detectedAt:new Date().toISOString()};},
    queryMobileUsage:async({startTime,endTime})=>{
      reads++;return {scope:"all-mobile",startTime,endTime,
        queriedAt:new Date().toISOString(),totalBytes:900000000,
        apps:[],daily:[],warnings:[]};
    },
  }},
};
await import("../dist/app.js");
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const $=selector=>document.querySelector(selector);
const click=selector=>{assert.ok($(selector),selector);$(selector).click();};
await tick();
const original=localStorage.getItem("telco.personal.v1");
assert.equal(scans,1);
assert.equal(reads,1);
click('[data-page="device"]');
assert.match($(".device-readiness").textContent,/Device readiness/);
assert.match($(".device-readiness").textContent,/Permission granted/);
assert.match($(".device-readiness").textContent,/Usage access granted/);
assert.match($(".device-readiness").textContent,/API 35/);
assert.match($(".device-readiness").textContent,/without requesting access, scanning SIMs or measuring data/);
const before={scans,reads};
click('[data-action="check-device"]');
await tick();
assert.equal(scans,before.scans,"Read-only permissions check must never scan SIMs");
assert.equal(reads,before.reads,"Read-only permissions check must never measure traffic");

capabilities={...capabilities,phonePermission:"denied",usageAccess:false};
Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});
document.dispatchEvent(new window.Event("visibilitychange"));
await tick();
assert.ok(checks>=3,"Returning from Android Settings must recheck access");
assert.match($(".device-readiness").textContent,/Permission denied/);
assert.match($(".device-readiness").textContent,/Usage access not granted/);
assert.doesNotMatch(document.body.textContent,/Measured mobile data/);
assert.equal(scans,1);
assert.equal(reads,1);
assert.equal(localStorage.getItem("telco.personal.v1"),original,
  "Permission revocation must never delete manual records or SIM profiles");

capabilities={...capabilities,phonePermission:"granted",usageAccess:true};
document.dispatchEvent(new window.Event("visibilitychange"));
await tick();
assert.match($(".device-readiness").textContent,/Usage access granted/);
assert.equal(reads,1,"Granting permission alone must not silently read usage");
click('[data-action="refresh-device"]');
await tick();
assert.equal(reads,2,"Explicit measurement works after a new grant");
assert.match(document.body.textContent,/Measured mobile data/);
assert.equal(localStorage.getItem("telco.personal.v1"),original);
console.log("PASS: Android diagnostic check has no prompts or readings, rechecks revocation and preserves local data");
window.close();
