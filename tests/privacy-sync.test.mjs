import test from "node:test";
import assert from "node:assert/strict";
import {
  createPrivacyAPI, accountKeyFor, CURRENT_SYNC_CONSENT_VERSION,
} from "../server/privacy-api.js";

const env = {
  AUTH_JWKS_URL:"https://login.telvyo.test/jwks",
  AUTH_ISSUER:"https://login.telvyo.test",
  AUTH_AUDIENCE:"telvyo-api",
  WEB_ORIGIN:"https://telvyo.test",
  ACCOUNT_HASH_KEY:"test-hmac-key-more-than-thirty-two-bytes-long",
  ACCOUNT_SYNC_ENCRYPTION_KEY:Buffer.alloc(32, 8).toString("base64"),
};

function setup({invalidSync=false,brokenClear=false}={}) {
  const consent=new Map(),deleted=[];
  const accounts=new Map();
  const repository={
    latest:async (k,p)=>[...(consent.get(k)||[])].reverse().find(x=>x.purpose===p)||null,
    append:async (k,p,granted,policyVersion)=>{
      const item={purpose:p,granted,policyVersion,at:"2026-11-15T23:00:00Z"};
      consent.set(k,[...(consent.get(k)||[]),item]);
      return item;
    },
    clear:async k=>consent.delete(k),
  };
  const syncRepository={
    get:async k=>accounts.get(k)||null,
    save:async(k,rev,cipher)=>accounts.set(k,{revision:rev+1,snapshot:cipher}),
    clear:async k=>{
      if(brokenClear)throw Error("PRIVATE DB PASSWORD");
      deleted.push(k);
      const rev=(accounts.get(k)?.revision||0)+1;
      accounts.set(k,{revision:rev,snapshot:null});
      return {revision:rev};
    },
  };
  const api=createPrivacyAPI({
    env:invalidSync?{...env,ACCOUNT_SYNC_ENCRYPTION_KEY:"bad"}:env,
    repository,syncRepository,verifyToken:async token=>{
      if(token==="expired")throw Error("invalid token");
      return {sub:token};
    },
  });
  const req=(path,method="GET",{body,token="alice",origin=env.WEB_ORIGIN,headers={}}={})=>
    new Request("https://telvyo.test"+path,{method,headers:{
      ...(origin===null?{}:{origin}),
      ...(token===null?{}:{authorization:"Bearer "+token}),
      ...(body===undefined?{}:{"content-type":"application/json"}),
      ...headers,
    },...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})});
  const key=subject=>accountKeyFor({sub:subject},env);
  return {api,req,key,deleted,consent,accounts};
}

test("cloud sync consent is separate from AI consent and requires explicit current policy",async()=>{
  const {api,req}=setup();
  let result=await api(req("/v1/privacy"));
  assert.equal(result.status,200);
  let data=await result.json();
  assert.equal(data.cloudSync.available,true);
  assert.equal(data.cloudSync.granted,false);
  assert.equal(data.aiAdvisor.granted,false);
  assert.equal(data.carrierSubscriberAccess,"not-authorized");
  assert.doesNotMatch(JSON.stringify(data),/accountKey|alice/);
  const route="/v1/privacy/cloud-sync";
  for(const body of [
    {},{granted:true,policyVersion:"old"},
    {granted:false,policyVersion:CURRENT_SYNC_CONSENT_VERSION},
    {granted:true,policyVersion:CURRENT_SYNC_CONSENT_VERSION,accessToken:"secret"},
    "invalidjson{",
  ]){
    result=await api(req(route,"POST",{body}));
    assert.equal(result.status,400,JSON.stringify(body));
    assert.doesNotMatch(await result.text(),/accessToken|secret/);
  }
  result=await api(req(route,"POST",{
    body:{granted:true,policyVersion:CURRENT_SYNC_CONSENT_VERSION},
  }));
  assert.equal(result.status,200);
  assert.equal((await result.json()).granted,true);
  data=await (await api(req("/v1/privacy"))).json();
  assert.equal(data.cloudSync.granted,true);
  assert.equal(data.aiAdvisor.granted,false);
  assert.equal((await (await api(req("/v1/privacy","GET"))).json()).cloudSync.granted,true);
  assert.equal((await (await api(req("/v1/privacy","GET",{token:"bob"}))).json()).cloudSync.granted,false);
});

test("cloud consent never activates without a separate encryption key",async()=>{
  const {api,req}=setup({invalidSync:true});
  const data=await (await api(req("/v1/privacy"))).json();
  assert.equal(data.cloudSync.available,false);
  assert.equal(data.cloudSync.granted,false);
  const result=await api(req("/v1/privacy/cloud-sync","POST",{
    body:{granted:true,policyVersion:CURRENT_SYNC_CONSENT_VERSION},
  }));
  assert.equal(result.status,503);
  assert.doesNotMatch(await result.text(),/ACCOUNT_SYNC_ENCRYPTION_KEY|private/i);
});

test("revocation erases ciphertext, preserves other accounts and is fail closed",async()=>{
  const {api,req,key,deleted,accounts}=setup();
  const alice=key("alice"),bob=key("bob");
  accounts.set(alice,{revision:1,snapshot:Buffer.from("PRIVATE AES CIPHERTEXT")});
  accounts.set(bob,{revision:2,snapshot:Buffer.from("BOB CIPHERTEXT")});
  const payload={granted:true,policyVersion:CURRENT_SYNC_CONSENT_VERSION};
  await api(req("/v1/privacy/cloud-sync","POST",{body:payload}));
  assert.equal((await api(req("/v1/privacy/cloud-sync","DELETE",{token:null}))).status,401);
  assert.equal((await api(req("/v1/privacy/cloud-sync","DELETE",{token:"expired"}))).status,401);
  assert.equal((await api(req("/v1/privacy/cloud-sync","DELETE",{
    origin:"https://attacker.test",
  }))).status,403);
  const response=await api(req("/v1/privacy/cloud-sync","DELETE"));
  assert.equal(response.status,200);
  assert.equal((await response.json()).cloudSyncDataDeleted,true);
  assert.deepEqual(deleted,[alice]);
  assert.equal(accounts.get(alice).snapshot,null);
  assert.equal(accounts.get(alice).revision,2);
  assert.equal(accounts.get(bob).snapshot.toString(),"BOB CIPHERTEXT");
  assert.equal((await (await api(req("/v1/privacy"))).json()).cloudSync.granted,false);

  const broken=setup({brokenClear:true});
  await broken.api(broken.req("/v1/privacy/cloud-sync","POST",{body:payload}));
  const r=await broken.api(broken.req("/v1/privacy/cloud-sync","DELETE"));
  assert.equal(r.status,503);
  assert.doesNotMatch(await r.text(),/PASSWORD|PRIVATE DB/);
  assert.equal((await (await broken.api(broken.req("/v1/privacy"))).json()).cloudSync.granted,true);
});

test("delete all cloud records also erases encrypted snapshot before consent history",async()=>{
  const {api,req,key,deleted,accounts}=setup();
  const alice=key("alice"),bob=key("bob");
  accounts.set(alice,{revision:4,snapshot:Buffer.from("PRIVATE A")});
  accounts.set(bob,{revision:4,snapshot:Buffer.from("PRIVATE B")});
  await api(req("/v1/privacy/cloud-sync","POST",{
    body:{granted:true,policyVersion:CURRENT_SYNC_CONSENT_VERSION},
  }));
  assert.equal((await api(req("/v1/privacy/records","DELETE"))).status,400);
  let r=await api(req("/v1/privacy/records","DELETE",{
    headers:{"x-telvyo-confirm":"DELETE_CLOUD_RECORDS"},
  }));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.cloudSyncDataDeleted,true);
  assert.equal(data.cloudConsentRecordsDeleted,true);
  assert.equal(data.localDeviceRecordsDeleted,false);
  assert.deepEqual(deleted,[alice]);
  assert.equal(accounts.get(alice).revision,5);
  assert.equal(accounts.get(alice).snapshot,null);
  assert.equal(accounts.get(bob).snapshot.toString(),"PRIVATE B");
  assert.equal((await (await api(req("/v1/privacy"))).json()).cloudSync.granted,false);
});
