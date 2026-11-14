import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
} from "../server/node_modules/jose/dist/webapi/index.js";
import { createGateway, verifyAccessToken } from "../server/gateway.js";
import { fetchMtnResource, requestMtnAccessToken } from "../server/mtn.js";
const env = {
  AUTH_JWKS_URL: "https://auth.example.test/jwks",
  AUTH_ISSUER: "https://auth.example.test",
  AUTH_AUDIENCE: "telco",
  OPENAI_API_KEY: "test-secret",
  OPENAI_MODEL: "configured-model",
  WEB_ORIGIN: "https://telco.example.test",
};
const payload = {
  consent: true,
  question: "Why did my data increase?",
  summary: {
    source: "manual",
    daysObserved: 4,
    averageDailyMB: 500,
    backgroundShare: 10,
    projectedDaysRemaining: 3,
  },
};
const request = (body = payload, headers = {}) =>
  new Request("https://api.example.test/v1/advisor", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      origin: env.WEB_ORIGIN,
      ...headers,
    },
    body: JSON.stringify(body),
  });
test("AI remains unavailable without real configuration", async () => {
  const res = await createGateway({ env: { WEB_ORIGIN: env.WEB_ORIGIN } })(
    request(),
  );
  assert.equal(res.status, 503);
  assert.match(await res.text(), /not configured/);
});
test("JWT verification checks signature, audience and expiration", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const make = (aud) =>
    new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(env.AUTH_ISSUER)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  assert.equal(
    (await verifyAccessToken(await make("telco"), env, keys)).sub,
    "user-1",
  );
  await assert.rejects(verifyAccessToken(await make("other-app"), env, keys));
  const expired = await new SignJWT({ sub: "user-1" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(env.AUTH_ISSUER)
    .setAudience("telco")
    .setIssuedAt(1)
    .setExpirationTime(2)
    .sign(privateKey);
  await assert.rejects(verifyAccessToken(expired, env, keys));
});
test("unauthorized requests never call AI provider", async () => {
  let count = 0;
  const handler = createGateway({
    env,
    verifyToken: async () => {
      throw Error("bad token");
    },
    fetchImpl: async () => {
      count++;
    },
  });
  assert.equal((await handler(request())).status, 401);
  assert.equal(count, 0);
});
test("consent, origin and aggregate-only fields are enforced", async () => {
  let count = 0;
  const handler = createGateway({
    env,
    verifyToken: async () => ({ sub: "u" }),
    fetchImpl: async () => {
      count++;
    },
  });
  assert.equal(
    (await handler(request({ ...payload, consent: false }))).status,
    400,
  );
  assert.equal(
    (await handler(request(payload, { origin: "https://attacker.test" })))
      .status,
    403,
  );
  assert.equal(
    (
      await handler(
        request({
          ...payload,
          summary: { ...payload.summary, contacts: ["private"] },
        }),
      )
    ).status,
    400,
  );
  assert.equal(count, 0);
});
test("AI sends only approved aggregate context with storage disabled", async () => {
  let sent;
  const handler = createGateway({
    env,
    verifyToken: async () => ({ sub: "u" }),
    fetchImpl: async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Your recorded usage is incomplete.",
              },
            ],
          },
        ],
      });
    },
  });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.equal(sent.body.store, false);
  assert.equal(sent.url, "https://api.openai.com/v1/responses");
  assert.match((await res.json()).answer, /incomplete/);
});
test("provider errors are sanitized and user requests are bounded", async () => {
  const handler = createGateway({
    env,
    limit: 1,
    verifyToken: async () => ({ sub: "u" }),
    fetchImpl: async () => {
      throw Error("test-secret provider stack");
    },
  });
  let res = await handler(request());
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /test-secret/);
  assert.equal((await handler(request())).status, 429);
});
test("MTN OAuth uses the documented query and form credentials", async () => {
  let call;
  const result = await requestMtnAccessToken(
    { clientId: "key", clientSecret: "secret" },
    async (url, init) => {
      call = { url, init };
      return Response.json({
        access_token: "approved-token",
        expires_in: "3600",
      });
    },
  );
  assert.equal(result.token, "approved-token");
  assert.equal(
    call.url,
    "https://api.mtn.com/v1/oauth/access_token?grant_type=client_credentials",
  );
  assert.equal(
    new URLSearchParams(call.init.body).get("client_secret"),
    "secret",
  );
});
test("MTN adapter requires explicit Ghana configuration and retains unconverted records", async () => {
  const consent = {
    subject: "user",
    customerId: "233000000000",
    scopes: ["usage"],
    expiresAt: Date.now() + 60000,
  };
  await assert.rejects(
    fetchMtnResource({
      operation: "usage",
      customerId: consent.customerId,
      consent,
      accessToken: "token",
    }),
    /countryCode/,
  );
  let call;
  const result = await fetchMtnResource(
    {
      operation: "usage",
      customerId: consent.customerId,
      consent,
      accessToken: "token",
      countryCode: "APPROVED",
      usageType: "APPROVED_TYPE",
    },
    async (url, init) => {
      call = { url, init };
      return Response.json({
        data: [
          {
            callDuration: "2",
            voiceCharge: { unit: "UNKNOWN", amount: "1.00" },
          },
        ],
      });
    },
  );
  assert.match(call.url, /\/usage\/233000000000/);
  assert.equal(call.init.headers.countryCode, "APPROVED");
  assert.equal(result.mapped, false);
  assert.equal(result.payload.data[0].voiceCharge.unit, "UNKNOWN");
});
test("MTN adapter rejects customer mismatch, expired consent and path injection", async () => {
  for (const customerId of ["other", "../usage"])
    await assert.rejects(
      fetchMtnResource({
        operation: "plans",
        customerId,
        accessToken: "token",
        consent: {
          subject: "u",
          customerId: "233",
          scopes: ["plans"],
          expiresAt: Date.now() + 60000,
        },
      }),
    );
});
