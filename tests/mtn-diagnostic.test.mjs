import test from "node:test";
import assert from "node:assert/strict";
import { MtnProviderError, requestMtnAccessToken } from "../server/mtn.js";
import { checkMtnAppCredentials } from "../scripts/check-mtn-token.mjs";

const creds = { clientId: "highly-sensitive-client-key", clientSecret: "highly-sensitive-client-secret" };
function rejectWith(body, { status = 401, type = "application/json" } = {}) {
  return new Response(body, { status, headers: { "content-type": type } });
}
async function failed(fetchImpl) {
  try {
    await requestMtnAccessToken(creds, fetchImpl);
    assert.fail("Provider must fail");
  } catch (e) {
    assert.ok(e instanceof MtnProviderError, e?.message);
    assert.doesNotMatch(e.message, /highly-sensitive|access_token|Bearer abc|private_body|password=/);
    assert.equal(e.stack.includes("highly-sensitive"), false);
    return e;
  }
}
test("401 invalid_client categorizes only allowlisted OAuth code and HTTP status", async () => {
  const response = await failed(async (url, init) => {
    assert.equal(url,
      "https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body);
    assert.deepEqual([...form.keys()], ["client_id","client_secret"]);
    assert.equal(form.get("client_id"), creds.clientId);
    assert.equal(form.get("client_secret"), creds.clientSecret);
    return rejectWith(JSON.stringify({error:"invalid_client", private_body:"highly-sensitive"}));
  });
  assert.deepEqual([response.kind,response.status,response.oauthCode],["HTTP",401,"invalid_client"]);
});

test("401 with HTML masquerading as JSON is still classified without body leakage", async () => {
  const err=await failed(async()=>rejectWith("<html>private_body highly-sensitive-client-secret</html>"));
  assert.equal(err.kind,"HTTP");
  assert.equal(err.status,401);
  assert.equal(err.oauthCode,null);
});

test("unexpected error fields and strings never get echoed or classified", async () => {
  for(const body of [
    JSON.stringify({error:"private_body highly-sensitive-client-secret"}),
    JSON.stringify({error:{message:"private_body"},client_secret:"highly-sensitive-client-secret"}),
    JSON.stringify(["invalid_client"]),
    JSON.stringify({error:"invalid_client",api_token:"highly-sensitive-client-secret"}).repeat(1000),
  ]){
    const err=await failed(async()=>rejectWith(body,{status:403}));
    assert.equal(err.kind,"HTTP");
    assert.equal(err.status,403);
    if(!body.includes('{"error":"invalid_client"') || body.length>4096)
      assert.equal(err.oauthCode,null);
  }
});

test("network errors and invalid successful content give safe categories", async () => {
  const network=await failed(async()=>{throw Error("network private_body highly-sensitive");});
  assert.equal(network.kind,"NETWORK");
  assert.equal(network.status,null);
  const bad=await failed(async()=>new Response("unexpected non JSON body"));
  assert.equal(bad.kind,"BAD_RESPONSE");
  const list=await failed(async()=>Response.json([]));
  assert.equal(list.kind,"BAD_RESPONSE");
});

test("private CLI emits only safe HTTP status and recognized code", async () => {
  for(const response of [
    rejectWith(JSON.stringify({error:"invalid_client",secret:"highly-sensitive-client-secret"})),
    rejectWith("private_body highly-sensitive-client-secret"),
  ]){
    const logs=[],errors=[];
    const code=await checkMtnAppCredentials({
      env:{MTN_CLIENT_ID:creds.clientId,MTN_CLIENT_SECRET:creds.clientSecret},
      authorize:(config)=>requestMtnAccessToken(config,async()=>response),
      log:s=>logs.push(s), error:s=>errors.push(s),
    });
    assert.equal(code,1);
    assert.deepEqual(logs,[]);
    const combined=errors.join(" ");
    assert.match(combined,/HTTP 401/);
    assert.doesNotMatch(combined,/highly-sensitive|private_body|Bearer|access_token/);
  }
});

test("private CLI never leaks unexpected non-provider exceptions",async()=>{
  const logs=[],errors=[];
  const status=await checkMtnAppCredentials({
    env:{MTN_CLIENT_ID:creds.clientId,MTN_CLIENT_SECRET:creds.clientSecret},
    authorize:async()=>{throw Error("highly-sensitive-client-secret in stack");},
    log:s=>logs.push(s),error:s=>errors.push(s),
  });
  assert.equal(status,1);
  assert.equal(logs.length,0);
  assert.doesNotMatch(errors.join(" "),/highly-sensitive/);
});
