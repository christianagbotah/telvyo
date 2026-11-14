import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const dom = new JSDOM(
  await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
  { url: "https://localhost/" },
);
const { window } = dom;
for (const k of [
  "document",
  "localStorage",
  "FormData",
  "Blob",
  "HTMLElement",
  "HTMLDialogElement",
])
  globalThis[k] = window[k];
globalThis.window = window;
window.scrollTo = () => {};
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let reads = 0,
  scans = 0;
globalThis.Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => "android",
  Plugins: {
    TelcoDevice: {
      getCapabilities: async () => ({
        platform: "android",
        simDetection: true,
        usageAccess: true,
        phonePermission: "granted",
      }),
      detectSims: async () => {
        scans++;
        return {
          sims: [
            {
              subscriptionId: 4,
              slot: 1,
              carrier: "MTN",
              label: "MTN",
              isDefaultData: true,
              isDefaultVoice: true,
            },
          ],
          detectedAt: new Date().toISOString(),
        };
      },
      queryMobileUsage: async ({ startTime, endTime }) => {
        reads++;
        return {
          scope: "all-mobile",
          startTime,
          endTime,
          totalBytes: 1250000000,
          queriedAt: new Date().toISOString(),
          apps: [
            {
              uid: 1001,
              app: "WhatsApp",
              bytes: 500000000,
              foregroundBytes: 0,
              backgroundBytes: 0,
            },
          ],
          daily: [
            { date: new Date().toISOString().slice(0, 10), bytes: 1250000000 },
          ],
          warnings: [],
        };
      },
    },
  },
};
await import("../dist/app.js");
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(scans, 1);
assert.equal(reads, 1);
assert.match(document.body.textContent, /1.25 GB mobile data/);
const saved = JSON.parse(localStorage.getItem("telco.personal.v1"));
assert.equal(saved.sims[0].source, "device");
assert.equal(saved.sims[0].rateSource, "unset");
assert.equal(saved.usage.length, 0);
assert.equal(saved.purchases.length, 0);
document.querySelector('[data-page="device"]').click();
assert.match(document.body.textContent, /all mobile networks combined/);
assert.match(document.body.textContent, /WhatsApp/);
assert.match(document.body.textContent, /Activity split unavailable/);
assert.match(document.body.textContent, /Daily mobile usage/);
console.log(
  "PASS: granted Android permissions trigger real bridge paths; snapshots stay out of carrier/manual ledgers.",
);
window.close();
