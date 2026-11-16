import test from "node:test";
import assert from "node:assert/strict";
import { createEmpty } from "../dist/model.js";
import { accountKeyFor } from "../server/privacy-api.js";
import { createSyncAPI } from "../server/sync-api.js";
import { syncEncryptionKey, encryptSnapshot, decryptSnapshot } from "../server/sync-crypto.js";
import { validateSyncLedger } from "../server/sync-records.js";

const env = {
  AUTH_ISSUER: "https://login.telvyo.test",
  AUTH_JWKS_URL: "https://login.telvyo.test/jwks",
  AUTH_AUDIENCE: "telvyo-api",
  WEB_ORIGIN: "https://telvyo.example.test",
  ACCOUNT_HASH_KEY: "unit-test-hmac-key-minimum-32-bytes-unique",
  ACCOUNT_SYNC_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
};
const sample = () => {
  const ledger = createEmpty();
  ledger.sims[0].monthlySpendLimit = 150;
  ledger.purchases.push({
    id:"p1",simId:"mtn",type:"data",amount:2000,cost:12.5,
    timestamp:"2026-11-15T12:00:00.000Z",
    expiresAt:"2026-11-17T12:00:00.000Z",
  });
  ledger.calls.push({
    id:"c1",simId:"mtn",contact:"Private Contact",
    duration:65,cost:0.1,estimated:true,
    timestamp:"2026-11-15T12:01:00.000Z",
  });
  return ledger;
};
const NOW = Date.parse("2026-11-15T23:00:00Z");

function fixture({ options = {}, configuredEnv = env } = {}) {
  const rows = new Map(), consents = new Set();
  const repository = {
    async get(k) { return rows.get(k) || null; },
    async save(k, expected, snapshot) {
      const current = rows.get(k);
      if (expected !== (current?.revision ?? 0))
        return { saved:false, revision:current?.revision ?? 0 };
      const entry = {
        revision:expected+1, snapshot,
        updatedAt:"2026-11-15T23:00:00Z",
      };
      rows.set(k,entry);
      return {saved:true, revision:entry.revision,updatedAt:entry.updatedAt};
    },
    async clear(k) {
      const current = rows.get(k);
      const entry = { revision:(current?.revision ?? 0)+1,
        snapshot:null, updatedAt:"2026-11-15T23:00:00Z" };
      rows.set(k,entry);
      return entry;
    },
    async withAccountLock(k, action) {
      // Fake store models the transaction contract; real concurrency
      // serialization is tested against PostgreSQL in sync-postgres.test.
      return action({ sync:this, consent:{latest:async()=>null} });
    },
  };
  const api = createSyncAPI({
    env:configuredEnv, repository, now:()=>NOW,
    consentCheck:async key=>consents.has(key),
    verifyToken:async token=>{
      if(token === "expired")throw Error("secret IdP failure");
      return {sub:token};
    },...options,
  });
  const key = name=>accountKeyFor({sub:name},configuredEnv);
  const request = (method="GET",{
    token="alice", origin=configuredEnv.WEB_ORIGIN, body,
    headers={}, path="/v1/sync",
  } = {}) => new Request("https://telvyo.example.test"+path,{
    method,
    headers:{
      ...(origin===null?{}:{origin}),
      ...(token===null?{}:{authorization:"Bearer "+token}),
      ...(body===undefined?{}:{"content-type":"application/json"}),
      ...headers,
    },
    ...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)}),
  });
  return {api,request,key,rows,consents,repository};
}

test("AES-GCM snapshots are account/revision bound, tampering and wrong keys fail",()=>{
  const key=syncEncryptionKey(env);
  const alice=accountKeyFor({sub:"alice"},env);
  const bob=accountKeyFor({sub:"bob"},env);
  const item=sample();
  const cipher=encryptSnapshot(item,alice,1,key);
  assert.ok(Buffer.isBuffer(cipher));
  assert.ok(!cipher.includes(Buffer.from("Private Contact")));
  assert.deepEqual(decryptSnapshot(cipher,alice,1,key),item);
  assert.throws(()=>decryptSnapshot(cipher,bob,1,key));
  assert.throws(()=>decryptSnapshot(cipher,alice,2,key));
  assert.throws(()=>decryptSnapshot(cipher,alice,1,Buffer.alloc(32,10)));
  const tampered=Buffer.from(cipher);
  tampered[tampered.length-1]^=1;
  assert.throws(()=>decryptSnapshot(tampered,alice,1,key));
  for(const bad of [undefined, "", "wrong",Buffer.alloc(16).toString("base64")]){
    assert.throws(()=>syncEncryptionKey({...env,ACCOUNT_SYNC_ENCRYPTION_KEY:bad}));
  }
});

test("sync ledger rejects hidden fields, unknown SIM and malformed content",()=>{
  assert.deepEqual(validateSyncLedger(sample(),NOW),sample());
  for(const field of [
    {...sample(), secret:"api-key"},
    {...sample(), version:2},
    {...sample(), sims:[...sample().sims, {...sample().sims[0],id:"third",slot:1}]},
    {...sample(), purchases:[{...sample().purchases[0], bearer:"hidden"}]},
    {...sample(), sims:[{...sample().sims[0],source:{token:"hidden"}},sample().sims[1]]},
    {...sample(), sims:[{...sample().sims[0],rateSource:"x".repeat(50)},sample().sims[1]]},
    {...sample(), calls:[{...sample().calls[0],simId:"unknown"}]},
    {...sample(), purchases:[...sample().purchases,...sample().purchases]},
  ])assert.throws(()=>validateSyncLedger(field,NOW));
});

test("private sync is not available without all security dependencies",async()=>{
  const {request,repository} =fixture();
  for(const settings of [
    {...env,ACCOUNT_SYNC_ENCRYPTION_KEY:undefined},
    {...env,ACCOUNT_HASH_KEY:"short"},
    {...env,AUTH_JWKS_URL:"http://localhost/jwks"},
  ]){
    const api=createSyncAPI({
      env:settings,repository,consentCheck:async()=>true,verifyToken:async()=>({sub:"alice"}),
    });
    const res=await api(request());
    assert.equal(res.status,503);
    assert.doesNotMatch(await res.text(),/Private Contact|accountKey|unit-test-hmac-key/);
  }
});

test("signed identity and explicit server-side consent isolate read/write/delete",async()=>{
  const {api,request,key,rows,consents}=fixture();
  assert.equal((await api(request("GET",{token:null}))).status,401);
  assert.equal((await api(request("GET",{token:"expired"}))).status,401);
  assert.equal((await api(request("GET",{origin:"https://attacker.test"}))).status,403);
  assert.equal((await api(request("GET",{path:"/v1/sync/bob"}))).status,404);
  assert.equal((await api(request("POST"))).status,405);
  assert.equal((await api(request("GET"))).status,403);
  const a=key("alice"),b=key("bob");
  consents.add(a);
  let r=await api(request("GET"));
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).ledger,null);
  r=await api(request("PUT",{
    body:{expectedRevision:0,ledger:sample()},
  }));
  assert.equal(r.status,200);
  assert.equal((await r.json()).revision,1);
  assert.ok(rows.get(a).snapshot && !rows.get(a).snapshot.includes(Buffer.from("Private Contact")));
  assert.equal(rows.has(b),false);
  r=await api(request("GET"));
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).ledger,sample());
  r=await api(request("PUT",{body:{expectedRevision:0,ledger:sample()}}));
  assert.equal(r.status,409);
  assert.equal((await r.json()).currentRevision,1);
  assert.equal((await api(request("GET",{token:"bob"}))).status,403);
  consents.add(b);
  assert.equal((await (await api(request("GET",{token:"bob"}))).json()).ledger,null);
  consents.delete(a);
  assert.equal((await api(request("GET"))).status,403);
  assert.equal((await api(request("PUT",{body:{expectedRevision:1,ledger:sample()}}))).status,403);
  // Deletion remains available even after consent revocation.
  assert.equal((await api(request("DELETE"))).status,400);
  r=await api(request("DELETE",{
    headers:{"x-telvyo-confirm":"DELETE_SYNC_DATA"},
  }));
  assert.equal(r.status,200);
  assert.equal((await r.json()).revision,2);
  assert.equal(rows.get(a).snapshot,null);
  consents.add(a);
  assert.equal((await (await api(request("GET"))).json()).revision,2);
  assert.equal((await (await api(request("GET"))).json()).ledger,null);
  assert.equal((await api(request("PUT",{
    body:{expectedRevision:0,ledger:sample()},
  }))).status,409,"Stale device cannot resurrect cloud record after delete");
  assert.equal((await (await api(request("GET",{token:"bob"}))).json()).revision,0);
});

test("malformed, oversized, future and secret-bearing payloads are rejected",async()=>{
  const {api,request,consents,key}=fixture();
  consents.add(key("alice"));
  for(const body of [
    {},
    {ledger:sample()},
    {expectedRevision:-1,ledger:sample()},
    {expectedRevision:0,ledger:sample(),subject:"bob"},
    {expectedRevision:0,ledger:{...sample(),secret:"private-client-secret"}},
    {expectedRevision:0,ledger:{...sample(),purchases:[{...sample().purchases[0],timestamp:"2099-01-01T00:00:00.000Z"}]}},
    "malformed json{",
    {expectedRevision:0,ledger:sample(),pad:"x".repeat(201000)},
  ]){
    const r=await api(request("PUT",{body}));
    assert.equal(r.status,400,JSON.stringify(body).slice(0,100));
    assert.doesNotMatch(await r.text(),/private-client-secret|Private Contact|unit-test-hmac-key/);
  }
});

test("provider, decryption and repository failures do not disclose private details",async()=>{
  const {api,request,key,consents,rows}=fixture();
  consents.add(key("alice"));
  const broken=createSyncAPI({
    env, repository:{
      get:async()=>{throw Error("secret SQL and password");},
      save:async()=>{throw Error("secret SQL and password");},
      clear:async()=>{throw Error("secret SQL and password");},
      withAccountLock:async(k,action)=>action({
        sync:{
          get:async()=>{throw Error("secret SQL and password");},
          save:async()=>{throw Error("secret SQL and password");},
          clear:async()=>{throw Error("secret SQL and password");},
        },
        consent:{latest:async()=>null},
      }),
    },consentCheck:async()=>true,verifyToken:async()=>({sub:"alice"}),now:()=>NOW,
  });
  for(const [method,options] of [
    ["GET",{}],
    ["PUT",{body:{expectedRevision:0,ledger:sample()}}],
    ["DELETE",{headers:{"x-telvyo-confirm":"DELETE_SYNC_DATA"}}],
  ]){
    const r=await broken(request(method,options));
    assert.equal(r.status,503);
    assert.doesNotMatch(await r.text(),/secret SQL|password/);
  }
  rows.set(key("alice"),{
    revision:1,snapshot:Buffer.alloc(40,0),updatedAt:"2026-11-15T23:00:00Z",
  });
  const get=await api(request());
  assert.equal(get.status,503);
  assert.doesNotMatch(await get.text(),/Private Contact|cipher/);
});
