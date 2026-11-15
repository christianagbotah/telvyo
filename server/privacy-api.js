import { createHmac, randomUUID } from "node:crypto";
import { verifyAccessToken } from "./gateway.js";
import { syncEncryptionKey } from "./sync-crypto.js";

export const CURRENT_AI_CONSENT_VERSION = "2026-11";
export const CURRENT_SYNC_CONSENT_VERSION = "2026-11";
const PURPOSE = "ai-advisor";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const validHttps = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
};

export function accountKeyFor(identity, env) {
  if (!env.ACCOUNT_HASH_KEY || Buffer.byteLength(env.ACCOUNT_HASH_KEY) < 32 ||
      !identity || typeof identity.sub !== "string" ||
      !identity.sub.trim() || identity.sub.length > 256 ||
      !validHttps(env.AUTH_ISSUER))
    throw new Error("Account identity is unavailable.");
  // Pseudonymous identity; neither email nor IdP subject is persisted in SQL.
  return createHmac("sha256", env.ACCOUNT_HASH_KEY)
    .update("telvyo:identity:v1\0")
    .update(env.AUTH_ISSUER)
    .update("\0")
    .update(identity.sub)
    .digest("hex");
}

async function limitedJSON(request) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
      "application/json") throw new Error("Use application/json.");
  if (Number(request.headers.get("content-length")) > 1024)
    throw new Error("Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("A request body is required.");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw new Error("Request is too large.");
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || Array.isArray(data) || typeof data !== "object")
      throw new Error("Invalid JSON object.");
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Invalid JSON.");
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Server-side consent controls. A signed bearer token identifies the customer;
 * only an AI aggregate-processing opt-in is available here. Carrier consent
 * requires a separate network-approved and customer-verified authorization.
 *
 * The repository must supply latest(accountKey, purpose),
 * append(accountKey, purpose, granted, policyVersion), and clear(accountKey).
 */
export function createPrivacyAPI({
  env = process.env,
  repository = null,
  syncRepository = null,
  verifyToken = (token) => verifyAccessToken(token, env),
} = {}) {
  const configured = !!(
    repository?.latest && repository?.append && repository?.clear &&
    validHttps(env.AUTH_JWKS_URL) && validHttps(env.AUTH_ISSUER) &&
    validHttps(env.WEB_ORIGIN) && typeof env.AUTH_AUDIENCE === "string" &&
    env.AUTH_AUDIENCE.trim() && Buffer.byteLength(env.ACCOUNT_HASH_KEY || "") >= 32
  );

  let encryptionReady = false;
  try { syncEncryptionKey(env); encryptionReady = true; } catch { /* fail closed */ }
  const syncStorageReady = configured && !!(
    syncRepository?.clear && syncRepository?.get && syncRepository?.save &&
    syncRepository?.withAccountLock
  );
  const syncReady = syncStorageReady && encryptionReady;

  return async function handlePrivacy(request) {
    const requestId = randomUUID();
    const origin = request.headers.get("origin");
    const headers = { ...JSON_HEADERS, "x-request-id": requestId };
    if (origin && origin === env.WEB_ORIGIN) {
      headers["access-control-allow-origin"] = origin;
      headers.vary = "Origin";
    }
    const respond = (code, body) =>
      new Response(JSON.stringify({ ...body, requestId }), { status: code, headers });

    if (origin && origin !== env.WEB_ORIGIN)
      return respond(403, { error: "Origin not allowed." });
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type, X-Telvyo-Confirm",
          "access-control-max-age": "600",
        },
      });
    }

    const path = new URL(request.url).pathname;
    const routeMethods = {
      "/v1/privacy": ["GET"],
      "/v1/privacy/ai-advisor": ["POST", "DELETE"],
      "/v1/privacy/cloud-sync": ["POST", "DELETE"],
      "/v1/privacy/records": ["DELETE"],
    };
    if (!Object.hasOwn(routeMethods, path))
      return respond(404, { error: "Route not found." });
    if (!routeMethods[path].includes(request.method))
      return respond(405, { error: "Method not allowed." });
    if (!configured)
      return respond(503, { error: "Private account services are not configured." });

    const bearer = /^Bearer ([^\s]+)$/.exec(
      request.headers.get("authorization") || "",
    );
    if (!bearer || bearer[1].length > 8192)
      return respond(401, { error: "Sign in is required." });

    let accountKey;
    try {
      const identity = await verifyToken(bearer[1]);
      accountKey = accountKeyFor(identity, env);
    } catch {
      return respond(401, { error: "Invalid or expired sign-in." });
    }

    try {
      if (path === "/v1/privacy" && request.method === "GET") {
        const saved = await repository.latest(accountKey, PURPOSE);
        const syncStatus = await repository.latest(accountKey, "cloud-sync");
        return respond(200, {
          accountConnected: true,
          storedData: syncReady
            ? "Cloud consent history and optional encrypted sync snapshot; device records remain separate."
            : "Cloud consent history only; local device records are separate.",
          aiAdvisor: {
            granted: saved?.granted === true,
            policyVersion: saved?.policyVersion || null,
            updatedAt: saved?.at || null,
            activePolicyVersion: CURRENT_AI_CONSENT_VERSION,
          },
          cloudSync: {
            available: syncReady,
            granted: syncReady && syncStatus?.granted === true &&
              syncStatus.policyVersion === CURRENT_SYNC_CONSENT_VERSION,
            policyVersion: syncStatus?.policyVersion || null,
            updatedAt: syncStatus?.at || null,
            activePolicyVersion: CURRENT_SYNC_CONSENT_VERSION,
          },
          carrierSubscriberAccess: "not-authorized",
        });
      }
      if (path === "/v1/privacy/ai-advisor" && request.method === "POST") {
        let data;
        try {
          data = await limitedJSON(request);
        } catch (error) {
          return respond(400, { error: error.message });
        }
        if (Object.keys(data).sort().join(",") !== "granted,policyVersion" ||
            data.granted !== true ||
            data.policyVersion !== CURRENT_AI_CONSENT_VERSION)
          return respond(400, {
            error: "Explicit opt-in to the current AI data policy is required.",
          });
        const saved = await repository.append(
          accountKey, PURPOSE, true, CURRENT_AI_CONSENT_VERSION,
        );
        return respond(200, { granted: true, recordedAt: saved.at });
      }
      if (path === "/v1/privacy/ai-advisor" && request.method === "DELETE") {
        const saved = await repository.append(
          accountKey, PURPOSE, false, CURRENT_AI_CONSENT_VERSION,
        );
        return respond(200, { granted: false, recordedAt: saved.at });
      }
      if (path === "/v1/privacy/cloud-sync" && request.method === "POST") {
        if (!syncReady)
          return respond(503, { error: "Encrypted sync is not configured." });
        let data;
        try { data = await limitedJSON(request); }
        catch (error) { return respond(400, { error: error.message }); }
        if (Object.keys(data).sort().join(",") !== "granted,policyVersion" ||
            data.granted !== true ||
            data.policyVersion !== CURRENT_SYNC_CONSENT_VERSION)
          return respond(400, {
            error: "Explicit opt-in to the current cloud sync policy is required.",
          });
        const saved = await syncRepository.withAccountLock(accountKey,
          async ({ consent }) => consent.append(accountKey, "cloud-sync", true,
            CURRENT_SYNC_CONSENT_VERSION));
        return respond(200, { granted: true, recordedAt: saved.at });
      }
      if (path === "/v1/privacy/cloud-sync" && request.method === "DELETE") {
        // Deleting ciphertext must NOT depend on having the encryption key.
        // Users can still revoke and erase snapshots after a key outage.
        if (!syncStorageReady)
          return respond(503, { error: "Encrypted sync records are unavailable." });
        // A snapshot save can no longer commit after this revocation commits:
        // the two operations acquire the same account transaction lock.
        const saved = await syncRepository.withAccountLock(accountKey,
          async ({ sync, consent }) => {
            await sync.clear(accountKey);
            return consent.append(accountKey, "cloud-sync", false,
              CURRENT_SYNC_CONSENT_VERSION);
          });
        return respond(200, { granted: false, cloudSyncDataDeleted: true,
          recordedAt: saved.at, localDeviceRecordsDeleted: false });
      }
      if (path === "/v1/privacy/records" && request.method === "DELETE") {
        if (request.headers.get("x-telvyo-confirm") !== "DELETE_CLOUD_RECORDS")
          return respond(400, { error: "Confirm deletion of cloud consent records." });
        // Both erasure operations MUST succeed in one transaction; never clear
        // the permission history while a private ciphertext could remain.
        if (syncStorageReady) {
          await syncRepository.withAccountLock(accountKey,
            async ({ sync, consent }) => {
              await sync.clear(accountKey);
              await consent.clear(accountKey);
            });
        } else {
          // If sync infrastructure is only partly configured, fail closed.
          if (syncRepository) return respond(503, {
            error: "Encrypted sync records must be available for cloud account erasure.",
          });
          await repository.clear(accountKey);
        }
        return respond(200, {
          cloudConsentRecordsDeleted: true,
          cloudSyncDataDeleted: syncStorageReady,
          identityProviderAccountDeleted: false,
          localDeviceRecordsDeleted: false,
        });
      }
      return respond(404, { error: "Route not found." });
    } catch {
      return respond(503, {
        error: "Account data is temporarily unavailable. No access was granted.",
      });
    }
  };
}
