import {JSDOM} from "jsdom";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const dom=new JSDOM(
  await readFile(new URL("../dist/index.html",import.meta.url),"utf8"),
  {url:"https://localhost/"},
);
const {window}=dom;
for(const name of ["document","localStorage","FormData","Blob",
  "HTMLElement","HTMLDialogElement"])globalThis[name]=window[name];
globalThis.window=window;
window.scrollTo=()=>{};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
let reads=0,checks=0;
globalThis.Capacitor={
  isNativePlatform:()=>true,getPlatform:()=>"android",
  Plugins:{TelcoDevice:{
    getCapabilities:async()=>{checks++;return {
      platform:"android",androidApiLevel:28,simDetection:true,
      mobileUsageSupported:false,usageAccess:true,phonePermission:"prompt",
    };},
    queryMobileUsage:async()=>{reads++;throw Error("Never query on Android 9");},
    detectSims:async()=>({sims:[],detectedAt:new Date().toISOString()}),
  }},
};
await import("../dist/app.js");
await new Promise(resolve=>setTimeout(resolve,30));
document.querySelector('[data-page="device"]').click();
assert.match(document.body.textContent,/Android 10\+ required/);
assert.match(document.body.textContent,/API 28/);
assert.equal(document.querySelector('[data-action="refresh-device"]').disabled,true);
assert.equal(document.querySelector('[data-action="usage-settings"]').disabled,true);
assert.equal(document.querySelector('[data-action="check-device"]').disabled,false);
assert.equal(reads,0);
document.querySelector('[data-action="check-device"]').click();
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(reads,0);
assert.ok(checks>=2);
assert.match(document.body.textContent,/cannot use Telvyo's all-mobile NetworkStats query/);
assert.match(document.body.textContent,/not a carrier connection test/);
console.log("PASS: Android 9 is correctly marked unsupported for usage measurements");
window.close();
