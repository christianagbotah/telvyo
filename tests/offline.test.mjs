import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(new URL("../dist/service-worker.js", import.meta.url), "utf8");
function setup(network = async () => new Response("online")) {
  const listeners = new Map();
  const records = new Map();
  const cached = { addAll: async urls => { for(const url of urls) records.set(url, new Response("offline")); },
    put: async (request, response) => records.set(request.url, response),
    match: async request => records.get(request.url) };
  const caches = { open: async () => cached, keys: async () => ["telvyo-public-old", "some-other-app"],
    delete: async () => true };
  const self = { registration: { scope: "https://telvyo.test/" },
    addEventListener: (event, callback) => listeners.set(event, callback),
    skipWaiting: () => {}, clients: { claim: async () => {} } };
  const context = { self, caches, fetch: network, URL, Request, Response, Set, Promise };
  vm.runInNewContext(script, context);
  function dispatch(url, method = "GET") {
    let result;
    listeners.get("fetch")({ request: new Request(url, { method }),
      respondWith: response => { result = response; } });
    return result;
  }
  return { dispatch, listeners, records, cached };
}

test("offline worker allows only static public routes", async () => {
  const { dispatch } = setup();
  for(const path of ["/api/admin/status", "/admin", "/admin/admin.js", "/signin-with-chatgpt", "/telvyo-android-preview.apk", "/app.js?token=abc"]) {
    assert.equal(dispatch("https://telvyo.test" + path), undefined, path);
  }
  assert.equal(dispatch("https://evil.test/app.js"), undefined);
  assert.equal(dispatch("https://telvyo.test/app.js", "POST"), undefined);
  assert.equal((await dispatch("https://telvyo.test/app.js")).status, 200);
});

test("offline worker caches public assets only and falls back when offline", async () => {
  let online = true;
  const { dispatch, records, listeners } = setup(async () => {
    if(!online) throw Error("network down");
    return new Response("current");
  });
  let installTask;
  listeners.get("install")({waitUntil: promise => {installTask = promise;}});
  await installTask;
  assert.ok(records.has("https://telvyo.test/index.html"));
  assert.equal(records.has("https://telvyo.test/admin"), false);
  assert.equal(records.has("https://telvyo.test/api/admin/status"), false);
  assert.equal(await (await dispatch("https://telvyo.test/app.js")).text(), "current");
  online = false;
  assert.equal(await (await dispatch("https://telvyo.test/app.js")).text(), "current");
  assert.equal(await (await dispatch("https://telvyo.test/")).text(), "offline");
});
