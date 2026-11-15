import test from "node:test";
import assert from "node:assert/strict";
import {
  accountKeyFor, createPrivacyAPI, CURRENT_AI_CONSENT_VERSION,
} from "../server/privacy-api.js";
import { createPgPrivacyStore } from "../server/privacy-store.js";

const env = {
  AUTH_JWKS_URL: "https://auth.telvyo.example.test/jwks",
  AUTH_ISSUER: "https://auth.telvyo.example.test",
  AUTH_AUDIENCE: "telvyo",
  WEB_ORIGIN: "https://telvyo.example.test",
  ACCOUNT_HASH_KEY: "fake-test-hmac-key-over-thirty-two-bytes-long",
};

function fixture({ settings = env, repository, verify } = {}) {
  const history = new Map();
  const store = repository || {
    latest: async (key, purpose) =>
      [...(history.get(key) || [])].reverse().find(x => x.purpose === purpose) || null,
    append: async (key, purpose, granted, policyVersion) => {
      const item = {
        purpose, granted, policyVersion,
        at: new Date("2026-11-15T12:00:00Z").toISOString(),
      };
      history.set(key, [...(history.get(key) || []), item]);
      return item;
    },
    clear: async key => history.delete(key),
  };
  const api = createPrivacyAPI({
    env: settings,
    repository: store,
    verifyToken: verify || (async token => {
      if (token === "expired") throw Error("expired-private-jwt");
      return { sub: token };
    }),
  });
  function request(path = "/v1/privacy", {
    method = "GET", token = "alice", origin = env.WEB_ORIGIN,
    body, headers = {},
  } = {}) {
    return new Request("https://telvyo.example.test" + path, {
      method,
      headers: {
        ...(origin === null ? {} : { origin }),
        ...(token === null ? {} : { authorization: "Bearer " + token }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  }
  return { api, request, store, history };
}

test("identity keys are deterministic per issuer, subject and secret without revealing subject", () => {
  const a = accountKeyFor({ sub: "customer@example.test" }, env);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, accountKeyFor({ sub: "customer@example.test" }, env));
  assert.notEqual(a, accountKeyFor({ sub: "other" }, env));
  assert.notEqual(a, accountKeyFor({ sub: "customer@example.test" }, {
    ...env, ACCOUNT_HASH_KEY: "another-fake-test-key-over-thirty-two-bytes",
  }));
  assert.notEqual(a, accountKeyFor({ sub: "customer@example.test" }, {
    ...env, AUTH_ISSUER: "https://different-issuer.test",
  }));
  assert.doesNotMatch(a, /customer|example|@/);
  assert.throws(() => accountKeyFor({ sub: "alice" }, { ...env, ACCOUNT_HASH_KEY: "short" }));
});

test("private account endpoints fail closed without signed auth, repository or strong key", async () => {
  const { api, request } = fixture();
  assert.equal((await api(request("/v1/privacy", { token: null }))).status, 401);
  assert.equal((await api(request("/v1/privacy", { token: "expired" }))).status, 401);
  assert.equal((await api(request("/v1/privacy", { token: "alice", origin: "https://evil.test" }))).status, 403);
  assert.equal((await api(request("/v1/privacy", { token: "alice", origin: null }))).status, 200);
  assert.equal((await api(request("/v1/privacy/other"))).status, 404);
  assert.equal((await api(request("/v1/privacy", { method: "POST" }))).status, 405);
  assert.equal((await api(createPrivacyAPI({env, repository:null})(request()))).status, 503);
  const noKey = createPrivacyAPI({ env: { ...env, ACCOUNT_HASH_KEY: undefined },
    repository: fixture().store });
  assert.equal((await noKey(request())).status, 503);
});

test("the cloud consent ledger requires current explicit AI policy, supports revocation and account isolation", async () => {
  const { api, request } = fixture();
  let result = await api(request());
  assert.equal(result.status, 200);
  let json = await result.json();
  assert.equal(json.aiAdvisor.granted, false);
  assert.equal(json.carrierSubscriberAccess, "not-authorized");
  assert.doesNotMatch(JSON.stringify(json), /alice|accountKey/);
  const endpoint = "/v1/privacy/ai-advisor";
  for (const invalid of [
    {}, { granted: false, policyVersion: CURRENT_AI_CONSENT_VERSION },
    { granted: true, policyVersion: "2025-01" },
    { granted: true, policyVersion: CURRENT_AI_CONSENT_VERSION, customerId: "23355" },
    ["consent"], "invalid-json",
  ]) {
    const response = await api(request(endpoint, { method: "POST", body: invalid }));
    assert.equal(response.status, 400, JSON.stringify(invalid));
  }
  result = await api(request(endpoint, {
    method: "POST", body: { granted: true, policyVersion: CURRENT_AI_CONSENT_VERSION },
  }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).granted, true);
  assert.equal((await (await api(request())).json()).aiAdvisor.granted, true);
  assert.equal((await (await api(request("/v1/privacy", { token: "bob" }))).json()).aiAdvisor.granted, false);
  assert.equal((await api(request(endpoint, { method: "DELETE" }))).status, 200);
  assert.equal((await (await api(request())).json()).aiAdvisor.granted, false);
  assert.equal((await (await api(request(endpoint, { method: "POST",
    body: { granted: true, policyVersion: CURRENT_AI_CONSENT_VERSION } }))).status, 200);
  assert.equal((await (await api(request())).json()).aiAdvisor.granted, true);
});

test("deletion requires an explicit confirmation and removes only the authenticated user's cloud ledger", async () => {
  const { api, request } = fixture();
  const payload = { granted: true, policyVersion: CURRENT_AI_CONSENT_VERSION };
  for (const token of ["alice", "bob"]) {
    assert.equal((await api(request("/v1/privacy/ai-advisor", { token, method:"POST", body: payload }))).status,200);
  }
  assert.equal((await api(request("/v1/privacy/records", { method: "DELETE" }))).status,400);
  const response = await api(request("/v1/privacy/records", {
    method: "DELETE", headers: {"x-telvyo-confirm":"DELETE_CLOUD_RECORDS"},
  }));
  assert.equal(response.status,200);
  const json = await response.json();
  assert.equal(json.cloudConsentRecordsDeleted,true);
  assert.equal(json.identityProviderAccountDeleted,false);
  assert.equal(json.localDeviceRecordsDeleted,false);
  assert.equal((await (await api(request())).json()).aiAdvisor.granted,false);
  assert.equal((await (await api(request("/v1/privacy", {token:"bob"}))).json()).aiAdvisor.granted,true);
});

test("storage errors and oversized/malformed submissions never reflect private diagnostics", async () => {
  const broken = {
    latest: async () => { throw Error("private SQL stack and password"); },
    append: async () => { throw Error("private SQL stack and password"); },
    clear: async () => { throw Error("private SQL stack and password"); },
  };
  const { api, request } = fixture({ repository: broken });
  const r = await api(request());
  assert.equal(r.status,503);
  assert.doesNotMatch(await r.text(), /password|SQL stack/);
  for (const body of ["{", JSON.stringify({granted:true,policyVersion:"2026-11",extra:"x".repeat(2000)})]) {
    const invalid = await api(request("/v1/privacy/ai-advisor", {method:"POST",body}));
    assert.equal(invalid.status,400);
  }
});

test("postgres consent operations use parameterized keys and scoped deletion", async () => {
  const queries = [];
  const pool = {query: async (sql, params) => {
    queries.push({sql, params});
    if (sql.startsWith("SELECT")) return {rows:[]};
    if (sql.startsWith("INSERT")) return {rows:[{at:new Date("2026-11-15T12:00:00Z")}]};
    return {rowCount:1};
  }};
  const store = createPgPrivacyStore(pool);
  assert.equal(await store.latest("key-a","ai-advisor"),null);
  assert.ok((await store.append("key-a","ai-advisor",true,"2026-11")).at);
  assert.equal(await store.clear("key-a"),1);
  assert.equal(queries.length,3);
  assert.deepEqual(queries[0].params,["key-a","ai-advisor"]);
  assert.deepEqual(queries[1].params,["key-a","ai-advisor",true,"2026-11"]);
  assert.deepEqual(queries[2].params,["key-a"]);
  for(const q of queries) assert.doesNotMatch(q.sql,/key-a|23355/);
});
