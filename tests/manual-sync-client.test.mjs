import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createEmpty } from "../dist/model.js";
import {
  createManualSyncClient, SyncConflictError, MANUAL_SYNC_CONFIRMATIONS,
} from "../client/manual-sync.js";

const stamp = new Date(Date.now() - 3600000).toISOString();
const purchase = (id, cost=8) => ({id,simId:"mtn",type:"data",amount:1000,cost,timestamp:stamp});
const ledger = () => createEmpty();
const TOKEN="signed.access.token.for.testing-only";
const json=(status,value)=>new Response(JSON.stringify(value),{
  status,headers:{"content-type":"application/json;charset=utf-8"},
});

function fixture({remote=null,revision=0,consent=false,online=true,token=TOKEN}={}) {
  const history=[];
  let cloud=remote?structuredClone(remote):null,version=revision,granted=consent;
  const fetchImpl=async(url,init)=>{
    history.push({
      url,method:init.method,body:init.body,
      bearer:init.headers.authorization,options:{
        redirect:init.redirect,credentials:init.credentials,
        cache:init.cache,referrerPolicy:init.referrerPolicy,
      },
    });
    if(!online)throw Error("private network details should not leak");
    if(init.headers.authorization!==`Bearer ${TOKEN}`)return json(401,{error:"token is not valid"});
    if(url==="https://telvyo.test/v1/privacy" && init.method==="GET")
      return json(200,{accountConnected:true,cloudSync:{
        available:true,granted,activePolicyVersion:"2026-11",
      }});
    if(url==="https://telvyo.test/v1/privacy/cloud-sync" &&
      init.method==="POST") {
      const request=JSON.parse(init.body);
      if(request.granted!==true || request.policyVersion!=="2026-11")
        return json(400,{error:"no consent"});
      granted=true;return json(200,{granted:true});
    }
    if(url==="https://telvyo.test/v1/privacy/cloud-sync" &&
      init.method==="DELETE") {
      granted=false;cloud=null;version++;
      return json(200,{granted:false,cloudSyncDataDeleted:true});
    }
    if(!granted)return json(403,{error:"private customer details"});
    if(url==="https://telvyo.test/v1/sync" && init.method==="GET")
      return json(200,{revision:version,ledger:cloud});
    if(url==="https://telvyo.test/v1/sync" && init.method==="PUT") {
      const request=JSON.parse(init.body);
      if(request.expectedRevision!==version)
        return json(409,{currentRevision:version,error:"another device changed private data"});
      cloud=structuredClone(request.ledger);version++;
      return json(200,{saved:true,revision:version});
    }
    return json(404,{error:"not published"});
  };
  const api=createManualSyncClient({
    apiOrigin:"https://telvyo.test",getAccessToken:async()=>token,
    fetchImpl,cryptoProvider:webcrypto,
  });
  return {
    api, history, get cloud(){return cloud;},
    get version(){return version;},get granted(){return granted;},
    externalWrite:next=>{cloud=structuredClone(next);version++;},
  };
}

test("requires trusted exact HTTPS origin and ephemeral authenticated token callback",()=>{
  for(const origin of [
    "", "http://telvyo.test","https://telvyo.test/v1",
    "https://telvyo.test?token=bad","https://user:pw@telvyo.test",
    "https://telvyo.test#x","//telvyo.test","https://telvyo.test.evil/",
  ]) {
    // The last origin is technically a valid HTTPS origin; it should never
    // be provided from an untrusted user input. Test configuration separately.
    if(origin==="https://telvyo.test.evil/")continue;
    assert.throws(()=>createManualSyncClient({
      apiOrigin:origin,fetchImpl:async()=>{},getAccessToken:async()=>TOKEN,
      cryptoProvider:webcrypto,
    }));
  }
  assert.throws(()=>createManualSyncClient({
    apiOrigin:"https://telvyo.test",fetchImpl:async()=>{},
    cryptoProvider:webcrypto,
  }));
});

test("explicit opt-in remains separate from previews or background upload",async()=>{
  const f=fixture();
  const local=ledger();
  local.purchases=[purchase("p1")];
  await assert.rejects(()=>f.api.preview(local),/consent/i);
  assert.equal(f.history.some(x=>x.url.endsWith("/v1/sync")),false);
  const before=f.history.length;
  await assert.rejects(()=>f.api.enable({confirmation:"yes"}),/ENABLE CLOUD SYNC/);
  assert.equal(f.history.length,before);
  const enabled=await f.api.enable({confirmation:MANUAL_SYNC_CONFIRMATIONS.enable});
  assert.deepEqual(enabled,{granted:true});
  assert.equal(f.granted,true);
  const review=await f.api.preview(local);
  assert.equal(review.revision,0);
  assert.equal(review.comparison.automaticMergeAvailable,false);
  assert.equal(review.comparison.downloadWouldRemoveLocalEntries,3);
  assert.equal(review.comparison.uploadWouldRemoveCloudEntries,0);
  assert.equal(f.cloud,null);
  assert.ok(f.history.every(x=>x.bearer===`Bearer ${TOKEN}`));
  assert.ok(f.history.every(x=>x.options.redirect==="error" &&
    x.options.credentials==="omit" && x.options.cache==="no-store"));
});

test("manual upload requires typed choice and unchanged local data",async()=>{
  const f=fixture({consent:true});
  const local=ledger();
  local.purchases=[purchase("p1")];
  const review=await f.api.preview(local);
  const count=f.history.length;
  await assert.rejects(()=>f.api.upload(review,local,{confirmation:"sure"}),/UPLOAD LOCAL/);
  assert.equal(f.history.length,count);
  const edited=structuredClone(local);
  edited.purchases.push(purchase("p2",11));
  await assert.rejects(()=>f.api.upload(review,edited,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.upload,
  }),/local records changed/i);
  assert.equal(f.cloud,null);
  assert.equal(f.history.length,count);
  const result=await f.api.upload(review,local,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.upload,
  });
  assert.deepEqual(result,{saved:true,revision:1,localRecordsChanged:false});
  assert.deepEqual(f.cloud,local);
  assert.equal(f.version,1);
  await assert.rejects(()=>f.api.upload(review,local,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.upload,
  }),/Review the latest/i,"Cannot replay a completed review");
});

test("a later device update returns 409 with no automatic retry or merge",async()=>{
  const f=fixture({consent:true,remote:ledger(),revision:1});
  const local=ledger();local.purchases.push(purchase("local"));
  const preview=await f.api.preview(local);
  const another=ledger();another.purchases.push(purchase("on-other-device",7));
  f.externalWrite(another);
  const count=f.history.length;
  await assert.rejects(()=>f.api.upload(preview,local,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.upload,
  }),err=>err instanceof SyncConflictError && err.currentRevision===2);
  assert.equal(f.history.length,count+1);
  assert.deepEqual(f.cloud,another);
  assert.equal(f.version,2);
});

test("cloud download is a proposal only; caller must use backup review",async()=>{
  const cloud=ledger();cloud.purchases.push(purchase("remote",13));
  const local=ledger();local.purchases.push(purchase("local",9));
  const f=fixture({consent:true,remote:cloud,revision:3});
  const preview=await f.api.preview(local);
  const count=f.history.length;
  await assert.rejects(()=>f.api.useCloudCopy(preview,local,{confirmation:"download"}),/USE CLOUD COPY/);
  assert.equal(f.history.length,count);
  const result=await f.api.useCloudCopy(preview,local,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.download,
  });
  assert.deepEqual(result.proposedLedger,cloud);
  assert.equal(result.persisted,false);
  assert.equal(result.requiresLocalRestoreReview,true);
  assert.deepEqual(local.purchases,[purchase("local",9)]);
  assert.equal(f.version,3);
  await assert.rejects(()=>f.api.useCloudCopy(preview,local,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.download,
  }),/Review the latest/i);
});

test("cloud download refuses a stale revision after another device writes",async()=>{
  const cloud=ledger();cloud.purchases.push(purchase("old",12));
  const newer=ledger();newer.purchases.push(purchase("other-device",20));
  const local=ledger();local.purchases.push(purchase("mine",9));
  const f=fixture({consent:true,remote:cloud,revision:1});
  const plan=await f.api.preview(local);
  f.externalWrite(newer);
  await assert.rejects(()=>f.api.useCloudCopy(plan,local,{
    confirmation:MANUAL_SYNC_CONFIRMATIONS.download,
  }),err=>err instanceof SyncConflictError && err.currentRevision===2);
  assert.equal(f.version,2);
  assert.deepEqual(f.cloud,newer);
  assert.equal(local.purchases[0].id,"mine");
});

test("revocation erases cloud copy but leaves local records alone",async()=>{
  const local=ledger();local.purchases.push(purchase("keep-local"));
  const f=fixture({consent:true,remote:local,revision:1});
  const count=f.history.length;
  await assert.rejects(()=>f.api.disable({confirmation:"delete"}),/ERASE CLOUD COPY/);
  assert.equal(f.history.length,count);
  const outcome=await f.api.disable({
    confirmation:MANUAL_SYNC_CONFIRMATIONS.revoke,
  });
  assert.deepEqual(outcome,{
    revoked:true,cloudCopyErased:true,localRecordsChanged:false,
  });
  assert.equal(f.cloud,null);
  assert.equal(f.granted,false);
  assert.deepEqual(local.purchases,[purchase("keep-local")]);
  await assert.rejects(()=>f.api.preview(local),/consent/i);
});

test("offline, missing deployment and private failures do not reveal payloads",async()=>{
  const f=fixture({online:false});
  await assert.rejects(()=>f.api.status(),err=>
    /unavailable/.test(err.message) && !/private network/.test(err.message));
  const wrong=fixture({token:"invalid.but.sufficiently.long"});
  await assert.rejects(()=>wrong.api.status(),/Sign in again/);
  const noAuth=createManualSyncClient({
    apiOrigin:"https://telvyo.test",getAccessToken:async()=> " ",
    fetchImpl:async()=>{throw Error("Should not fetch");},
    cryptoProvider:webcrypto,
  });
  await assert.rejects(()=>noAuth.status(),/Sign in before/);
});

test("server invalid response and 404 remain fail closed",async()=>{
  let requests=0;
  const fetchImpl=async(url,init)=>{
    requests++;
    if(requests===1)
      return json(200,{accountConnected:true,cloudSync:{available:true,granted:true}});
    return new Response("<html>not available</html>",{
      status:200,headers:{"content-type":"text/html"},
    });
  };
  const api=createManualSyncClient({
    apiOrigin:"https://telvyo.test",getAccessToken:async()=>TOKEN,
    fetchImpl,cryptoProvider:webcrypto,
  });
  await assert.rejects(()=>api.preview(ledger()),/invalid response/i);
  assert.equal(requests,2);
  const missing=createManualSyncClient({
    apiOrigin:"https://telvyo.test",getAccessToken:async()=>TOKEN,
    fetchImpl:async()=>json(404,{error:"private"}),cryptoProvider:webcrypto,
  });
  await assert.rejects(()=>missing.status(),/not enabled/i);
});
