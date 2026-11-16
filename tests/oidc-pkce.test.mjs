import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto, createHash} from "node:crypto";
import {createOidcPkceSession, SignInError} from "../client/oidc-pkce.js";

const BASE={
  issuer:"https://login.telvyo.test/realms/telvyo",
  authorizationEndpoint:"https://login.telvyo.test/realms/telvyo/protocol/openid-connect/auth",
  tokenEndpoint:"https://login.telvyo.test/realms/telvyo/protocol/openid-connect/token",
  clientId:"telvyo-web-public",
  redirectUri:"https://telvyo.test/account/callback",
  apiOrigin:"https://api.telvyo.test",
};
const TOKEN="eyJ.server.verified.opaque.to.the.client.123456789";
const json=(status,data)=>new Response(JSON.stringify(data),{
  status,headers:{"content-type":"application/json; charset=utf-8"},
});
function fixture({
  clock=Date.now(),storageDisabled=false,tokenResponse=null,
  apiResponse=null, exchangeError=false,authError=false,
}={}){
  let time=clock, network=[],historyCalls=[],storageWrites=[],storageReads=[];
  const saved=new Map();
  const storage={
    getItem(key){storageReads.push(key);return saved.get(key)??null;},
    setItem(key,value){if(storageDisabled)throw Error("private storage permission error");
      storageWrites.push({key,value});saved.set(key,value);},
    removeItem(key){saved.delete(key);},
  };
  const historyProvider={replaceState:(state,title,url)=>
    historyCalls.push({state,title,url})};
  const fetchImpl=async(url,options)=>{
    network.push({url,options});
    if (url===BASE.tokenEndpoint){
      if(exchangeError)throw Error("Secret provider credentials in internal stack");
      return tokenResponse||json(200,{
        token_type:"Bearer",access_token:TOKEN,expires_in:600,
        id_token:"id.token.not.used",refresh_token:"SHOULD_BE_DROPPED",
      });
    }
    if(url===BASE.apiOrigin+"/v1/privacy"){
      if(authError)throw Error("Network internal detail");
      return apiResponse||json(200,{accountConnected:true,cloudSync:{
        available:false,granted:false,
      }});
    }
    throw Error("Unexpected URL "+url);
  };
  const session=createOidcPkceSession({
    ...BASE,cryptoProvider:webcrypto,storage,
    now:()=>time,fetchImpl,historyProvider,
  });
  const started=async()=>{
    const href=await session.beginAuthorization();
    const auth=new URL(href);
    return {href,auth,state:auth.searchParams.get("state"),
      callback:BASE.redirectUri+"?state="+auth.searchParams.get("state")+"&code=code123"};
  };
  return {session,started,saved,network,historyCalls,storageReads,storageWrites,
    setTime:value=>{time=value;},get time(){return time;}};
}

test("PKCE uses secure randomness, S256 challenge, nonce and exact trusted callback",async()=>{
  const f=fixture();
  const a=await f.started();
  const params=a.auth.searchParams;
  assert.equal(a.auth.origin,"https://login.telvyo.test");
  assert.equal(params.get("response_type"),"code");
  assert.equal(params.get("scope"),"openid");
  assert.equal(params.get("client_id"),BASE.clientId);
  assert.equal(params.get("redirect_uri"),BASE.redirectUri);
  assert.equal(params.get("code_challenge_method"),"S256");
  assert.match(params.get("nonce"),/^[A-Za-z0-9_-]{43}$/);
  assert.match(a.state,/^[A-Za-z0-9_-]{43}$/);
  const pending=JSON.parse(f.saved.values().next().value);
  assert.equal(pending.state,a.state);
  assert.match(pending.verifier,/^[A-Za-z0-9_-]{86}$/);
  const digest=createHash("sha256").update(pending.verifier).digest("base64url");
  assert.equal(params.get("code_challenge"),digest);
  assert.ok(!a.href.includes(pending.verifier));
  assert.ok(!a.href.includes(TOKEN));
  assert.equal(f.network.length,0,"Starting sign-in never calls private API or uploads usage");
  assert.deepEqual(f.session.status(),{
    signedIn:false,expiresAt:null,tokenStoredOnDevice:false,
  });
  const second=await f.session.beginAuthorization();
  assert.notEqual(new URL(second).searchParams.get("state"),a.state);
});

test("callback exchanges code once, verifies private API and holds access token only in memory",async()=>{
  const f=fixture();
  const {callback}=await f.started();
  const result=await f.session.finishAuthorization(callback);
  assert.equal(result.authenticated,true);
  assert.equal(result.provider,"https://login.telvyo.test");
  assert.equal(result.expiresAt,f.time+600000);
  assert.equal(f.session.getAccessToken(),TOKEN);
  assert.equal(f.session.status().signedIn,true);
  assert.deepEqual(f.historyCalls.map(x=>x.url),["/account/callback"]);
  assert.equal(f.saved.size,0,"Pending PKCE verifier must be consumed");
  assert.equal(f.network.length,2);
  const [exchange,verify]=f.network;
  assert.equal(exchange.url,BASE.tokenEndpoint);
  assert.equal(exchange.options.method,"POST");
  assert.equal(exchange.options.redirect,"error");
  assert.equal(exchange.options.credentials,"omit");
  assert.equal(exchange.options.cache,"no-store");
  assert.equal(exchange.options.referrerPolicy,"no-referrer");
  assert.equal(exchange.options.headers["content-type"],"application/x-www-form-urlencoded");
  const submitted=new URLSearchParams(exchange.options.body);
  assert.equal(submitted.get("grant_type"),"authorization_code");
  assert.equal(submitted.get("client_id"),BASE.clientId);
  assert.equal(submitted.get("redirect_uri"),BASE.redirectUri);
  assert.equal(submitted.get("code"),"code123");
  assert.match(submitted.get("code_verifier"),/^[A-Za-z0-9_-]{86}$/);
  assert.equal(submitted.has("client_secret"),false);
  assert.equal(verify.url,BASE.apiOrigin+"/v1/privacy");
  assert.equal(verify.options.headers.authorization,"Bearer "+TOKEN);
  assert.equal(verify.options.credentials,"omit");
  assert.equal(verify.options.redirect,"error");
  const writes=JSON.stringify(f.storageWrites);
  assert.ok(!writes.includes(TOKEN));
  assert.ok(!writes.includes("SHOULD_BE_DROPPED"));
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  await assert.rejects(f.session.finishAuthorization(callback),/expired or could not be verified/i);
  assert.equal(f.network.length,2,"Callback replay must not call the token endpoint");
  assert.throws(()=>f.session.getAccessToken(),SignInError,
    "Replaying a callback intentionally invalidates the in-memory session");
});

test("mismatched state, wrong issuer, duplicates and provider errors are rejected",async()=>{
  for(const mutate of [
    c=>c.searchParams.set("state","wrong-state"),
    c=>c.searchParams.append("state","duplicate"),
    c=>c.searchParams.append("code","duplicate"),
    c=>c.searchParams.set("iss","https://attacker.test"),
    c=>c.searchParams.set("error","access_denied"),
    c=>c.searchParams.set("code","contains space"),
    c=>{c.hash="#access_token=unsafe";},
    c=>c.searchParams.delete("code"),
    c=>c.searchParams.set("scope","admin"),
  ]){
    const f=fixture();
    const {callback}=await f.started();
    const wrong=new URL(callback);
    mutate(wrong);
    await assert.rejects(f.session.finishAuthorization(wrong.href),SignInError);
    assert.equal(f.saved.size,0);
    assert.equal(f.network.length,0);
    assert.deepEqual(f.historyCalls.map(x=>x.url),["/account/callback"]);
  }
});

test("callbacks outside the registered exact redirect cannot access pending verifier",async()=>{
  const f=fixture();const {callback}=await f.started();
  for(const wrong of [
    "http://telvyo.test/account/callback?code=foo",
    "https://attacker.test/account/callback?code=foo",
    "https://telvyo.test/account/other?code=foo",
  ]){
    await assert.rejects(f.session.finishAuthorization(wrong),SignInError);
  }
  assert.equal(f.saved.size,1,"A malicious URL must not consume a genuine pending callback");
  assert.equal(f.historyCalls.length,0);
  assert.equal((await f.session.finishAuthorization(callback)).authenticated,true);
});

test("expired login, blocked sessionStorage and missing crypto fail closed",async()=>{
  const f=fixture({clock:1700000000000});
  const {callback}=await f.started();
  f.setTime(f.time+5*60*1000+1);
  await assert.rejects(f.session.finishAuthorization(callback),/expired/i);
  assert.equal(f.network.length,0);
  const blocked=fixture({storageDisabled:true});
  await assert.rejects(blocked.started(),/cannot securely preserve/i);
  assert.equal(blocked.network.length,0);
  assert.throws(()=>createOidcPkceSession({
    ...BASE,cryptoProvider:{},storage:{getItem(){},setItem(){},removeItem(){}},
    historyProvider:{replaceState(){}},fetchImpl:async()=>{},
  }),SignInError);
});

test("invalid provider token, expired token and failed server verification never establish a session",async()=>{
  for(const options of [
    {tokenResponse:json(400,{error:"invalid_grant",client_secret:"EXPOSED?"})},
    {tokenResponse:json(200,{access_token:"short",token_type:"Bearer",expires_in:3600})},
    {tokenResponse:json(200,{access_token:TOKEN,token_type:"mac",expires_in:3600})},
    {tokenResponse:json(200,{access_token:TOKEN,token_type:"Bearer",expires_in:15})},
    {tokenResponse:json(200,{access_token:TOKEN,token_type:"Bearer",expires_in:"3600"})},
    {tokenResponse:new Response("HTML",{status:200,headers:{"content-type":"text/html"}})},
    {apiResponse:json(401,{error:"invalid token"})},
    {apiResponse:json(200,{accountConnected:false})},
    {exchangeError:true},
    {authError:true},
  ]){
    const f=fixture(options);const {callback}=await f.started();
    await assert.rejects(f.session.finishAuthorization(callback),SignInError);
    assert.equal(f.session.status().signedIn,false);
    assert.throws(()=>f.session.getAccessToken(),/expired/);
    assert.equal(f.saved.size,0);
  }
});

test("session expiry, memory-only logout and repeated consent remain independent",async()=>{
  const f=fixture({clock:1700000000000});
  const {callback}=await f.started();
  await f.session.finishAuthorization(callback);
  f.setTime(f.time+600000-31000);
  assert.equal(f.session.getAccessToken(),TOKEN);
  f.setTime(f.time+2000);
  assert.throws(()=>f.session.getAccessToken(),SignInError);
  assert.deepEqual(f.session.status(),{
    signedIn:false,expiresAt:null,tokenStoredOnDevice:false,
  });
  const {callback:next}=await f.started();
  await f.session.finishAuthorization(next);
  const done=f.session.logout();
  assert.deepEqual(done,{signedOutLocally:true,providerSessionMayRemain:true});
  assert.equal(f.saved.size,0);
  assert.throws(()=>f.session.getAccessToken(),SignInError);
});

test("configuration rejects unsafe or unregistered OAuth endpoints",()=>{
  const f=fixture();
  assert.equal(f.session.status().signedIn,false);
  for(const override of [
    {issuer:"http://login.telvyo.test/realms/telvyo"},
    {authorizationEndpoint:"https://user:password@login.telvyo.test/authorize"},
    {tokenEndpoint:"https://login.telvyo.test/token?debug=1"},
    {redirectUri:"https://telvyo.test/account/callback?code=provided"},
    {redirectUri:"https://telvyo.test/account/callback#fragment"},
    {apiOrigin:"https://api.telvyo.test/v1"},
    {clientId:""},
  ]){
    assert.throws(()=>createOidcPkceSession({
      ...BASE,...override,cryptoProvider:webcrypto,
      storage:{getItem(){},setItem(){},removeItem(){}},
      historyProvider:{replaceState(){}},
      fetchImpl:async()=>{},
    }),SignInError);
  }
});
