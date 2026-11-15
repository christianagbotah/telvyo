import { randomUUID } from "node:crypto";
import { verifyAccessToken } from "./gateway.js";
import { accountKeyFor } from "./privacy-api.js";
import { decryptSnapshot, encryptSnapshot, syncEncryptionKey } from "./sync-crypto.js";
import { validateSyncLedger } from "./sync-records.js";

const isHttps = value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash;
  } catch {
    return false;
  }
};
const headersBase = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

async function limitedJSON(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw Error("Use application/json.");
  if (Number(request.headers.get("content-length")) > 200704)
    throw Error("Sync request is too large.");
  if (!request.body) throw Error("A JSON request body is required.");
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 200704) throw Error("Sync request is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let result;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Error("Invalid JSON.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw Error("A JSON object is required.");
  return result;
}

/** Private authenticated snapshot transport. Not a conflict-merging engine. */
export function createSyncAPI({
  env = process.env,
  repository = null,
  consentCheck = null,
  verifyToken = token => verifyAccessToken(token, env),
  now = Date.now,
} = {}) {
  let key = null;
  try { key = syncEncryptionKey(env); } catch { /* fail closed */ }
  const configured = !!(key && repository?.get && repository?.save &&
    repository?.clear && repository?.withAccountLock &&
    typeof consentCheck === "function" &&
    isHttps(env.AUTH_JWKS_URL) && isHttps(env.AUTH_ISSUER) &&
    isHttps(env.WEB_ORIGIN) && typeof env.AUTH_AUDIENCE === "string" &&
    env.AUTH_AUDIENCE.trim() && Buffer.byteLength(env.ACCOUNT_HASH_KEY || "") >= 32);

  return async function syncRequest(request) {
    const requestId = randomUUID();
    const origin = request.headers.get("origin");
    const path = new URL(request.url).pathname;
    const headers = { ...headersBase, "x-request-id": requestId };
    if (origin && origin === env.WEB_ORIGIN) {
      headers["access-control-allow-origin"] = origin;
      headers.vary = "Origin";
    }
    const reply = (status, data) =>
      new Response(JSON.stringify({ ...data, requestId }), { status, headers });

    if (origin && origin !== env.WEB_ORIGIN)
      return reply(403, { error: "Origin not allowed." });
    if (path !== "/v1/sync") return reply(404, { error: "Route not found." });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: {
        ...headers,
        "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type, X-Telvyo-Confirm",
        "access-control-max-age": "600",
      } });
    if (!["GET", "PUT", "DELETE"].includes(request.method))
      return reply(405, { error: "Method not allowed." });
    if (!configured)
      return reply(503, { error: "Encrypted account sync is not configured." });

    const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") || "");
    if (!bearer || bearer[1].length > 8192)
      return reply(401, { error: "Sign in is required." });
    let accountKey;
    try {
      const identity = await verifyToken(bearer[1]);
      accountKey = accountKeyFor(identity, env);
    } catch {
      return reply(401, { error: "Invalid or expired sign-in." });
    }

    // Reject bad/large payloads before acquiring a database transaction lock.
    // Authenticated deletes are still permitted after sync consent is revoked.
    if (request.method === "DELETE" &&
        request.headers.get("x-telvyo-confirm") !== "DELETE_SYNC_DATA")
      return reply(400, { error: "Confirm deletion of your cloud sync snapshot." });

    let input;
    if (request.method === "PUT") {
      try {
        input = await limitedJSON(request);
        if (Object.keys(input).sort().join(",") !== "expectedRevision,ledger" ||
            !Number.isSafeInteger(input.expectedRevision) ||
            input.expectedRevision < 0 || input.expectedRevision > 1e12)
          throw Error("A valid expected revision and ledger are required.");
        validateSyncLedger(input.ledger, now());
      } catch (e) {
        return reply(400, { error: e.message });
      }
    }

    try {
      // Consent status and snapshot mutations share the exact SAME
      // per-account PostgreSQL transaction lock as consent revocation.
      // A revoked account can never write after the revocation commits.
      return await repository.withAccountLock(accountKey, async ({ sync, consent }) => {
        if (request.method === "DELETE") {
          const result = await sync.clear(accountKey);
          return reply(200, {
            deleted: true,
            revision: Number(result.revision),
            localDeviceRecordsDeleted: false,
            accountDeleted: false,
          });
        }

        let consented;
        try {
          consented = await consentCheck(accountKey, consent);
        } catch {
          return reply(503, { error: "Sync authorization is temporarily unavailable." });
        }
        if (consented !== true)
          return reply(403, { error: "Enable the current cloud sync consent first." });

        if (request.method === "GET") {
          const row = await sync.get(accountKey);
          if (!row) return reply(200, { revision: 0, ledger: null });
          const revision = Number(row.revision);
          if (!Number.isSafeInteger(revision) || revision < 1)
            throw Error("Invalid stored revision.");
          const ledger = row.snapshot
            ? validateSyncLedger(decryptSnapshot(row.snapshot, accountKey, revision, key), now())
            : null;
          return reply(200, { revision, ledger, updatedAt: row.updatedAt });
        }

        const encrypted = encryptSnapshot(
          input.ledger, accountKey, input.expectedRevision + 1, key,
        );
        const saved = await sync.save(accountKey, input.expectedRevision, encrypted);
        if (!saved.saved)
          return reply(409, {
            error: "A newer cloud snapshot exists. Review it before choosing how to resolve the conflict.",
            currentRevision: Number(saved.revision),
          });
        return reply(200, {
          saved: true, revision: Number(saved.revision),
          updatedAt: saved.updatedAt,
        });
      });
    } catch {
      return reply(503, { error: "Cloud sync is temporarily unavailable." });
    }
  };
}
