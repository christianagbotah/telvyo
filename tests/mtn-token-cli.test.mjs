import test from "node:test";
import assert from "node:assert/strict";
import { checkMtnAppCredentials } from "../scripts/check-mtn-token.mjs";

test("MTN OAuth check requires private credentials, never logs tokens", async () => {
  const logs = [], errors = [];
  const log = value => logs.push(value);
  const error = value => errors.push(value);
  assert.equal(await checkMtnAppCredentials({env:{},log,error}),2);
  assert.match(errors.join(" "),/not configured/);
  const code = await checkMtnAppCredentials({
    env:{MTN_CLIENT_ID:"private-client-id",MTN_CLIENT_SECRET:"private-client-secret"},
    authorize: async ({clientId,clientSecret}) => {
      assert.equal(clientId,"private-client-id");
      assert.equal(clientSecret,"private-client-secret");
      return {token:"confidential-access-token",expiresAt:Date.now()+60000};
    },
    log,error,
  });
  assert.equal(code,0);
  assert.match(logs.join(" "),/successful/);
  assert.match(logs.join(" "),/NOT tested/);
  assert.doesNotMatch(logs.join(" ")+errors.join(" "),/private-client-id|private-client-secret|confidential-access-token/);
});

test("MTN OAuth check sanitizes provider failure", async () => {
  const logs=[],errors=[];
  const result=await checkMtnAppCredentials({
    env:{MTN_CLIENT_ID:"x",MTN_CLIENT_SECRET:"secret-test"},
    authorize:async()=>{throw Error("secret-test upstream leaked stack");},
    log:v=>logs.push(v),
    error:v=>errors.push(v),
  });
  assert.equal(result,1);
  assert.equal(logs.length,0);
  assert.doesNotMatch(errors.join(" "),/secret-test|upstream leaked stack/);
});
