import {
  fingerprintLedger, reviewSyncChanges, validateReviewLedger,
  SyncReviewError,
} from "./sync-review.js";

const POLICY_PROMPT = "ENABLE CLOUD SYNC";
const UPLOAD_PROMPT = "UPLOAD LOCAL";
const DOWNLOAD_PROMPT = "USE CLOUD COPY";
const DELETE_PROMPT = "ERASE CLOUD COPY";
const strictOrigin = raw => {
  if (typeof raw !== "string") throw new SyncReviewError("Cloud sync is not configured.");
  let url;
  try { url = new URL(raw); }
  catch { throw new SyncReviewError("Cloud sync is not configured."); }
  if (url.protocol !== "https:" || !url.hostname || url.username ||
      url.password || url.pathname !== "/" || url.search || url.hash ||
      url.origin !== raw.replace(/\/$/, ""))
    throw new SyncReviewError("Cloud sync requires an exact HTTPS API origin.");
  return url.origin;
};

export class SyncConflictError extends SyncReviewError {
  constructor(currentRevision) {
    super("The cloud copy changed on another device. Review it again before choosing what to keep.");
    this.name = "SyncConflictError";
    this.currentRevision = currentRevision;
  }
}

function validateToken(value) {
  // Ephemeral bearer tokens supplied by a future authenticated identity
  // session. Never persist to localStorage, sessionStorage or query params.
  if (typeof value !== "string" || value.length < 16 ||
      value.length > 8192 || /\s/.test(value))
    throw new SyncReviewError("Sign in before using encrypted cloud sync.");
  return value;
}

/**
 * Dormant browser/native sync transport. This module is not referenced by
 * the public app and cannot authenticate without a configured IdP session.
 * It never merges, persists ledgers, refreshes tokens or retries conflicts.
 */
export function createManualSyncClient({
  apiOrigin, getAccessToken, fetchImpl=globalThis.fetch,
  cryptoProvider=globalThis.crypto, now=Date.now,
} = {}) {
  const origin = strictOrigin(apiOrigin);
  if (typeof getAccessToken !== "function" || typeof fetchImpl !== "function" ||
      !cryptoProvider?.subtle)
    throw new SyncReviewError("Authenticated cloud sync is not configured.");
  const issued = new WeakSet();

  async function request(method, path, body=null) {
    const token = validateToken(await getAccessToken());
    const init = {
      method, redirect:"error", credentials:"omit", cache:"no-store",
      referrerPolicy:"no-referrer",
      headers:{
        "authorization":`Bearer ${token}`,
        "accept":"application/json",
        ...(body===null?{}:{"content-type":"application/json"}),
      },
      ...(body===null?{}:{body:JSON.stringify(body)}),
    };
    let response;
    try { response = await fetchImpl(origin + path, init); }
    catch { throw new SyncReviewError("Cloud sync is unavailable. Your local records are unchanged."); }
    if (response.status === 404 || response.status === 503)
      throw new SyncReviewError("Cloud sync is not enabled for this Telvyo installation.");
    if (response.status === 401)
      throw new SyncReviewError("Your sign-in has expired. Sign in again.");
    if (response.status === 403)
      throw new SyncReviewError("Cloud sync access is not authorized. Confirm account consent.");
    let data;
    try {
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
        throw Error("Unexpected response");
      const raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > 262144)
        throw Error("Response too large");
      data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw Error("Unexpected response");
    } catch {
      throw new SyncReviewError("Cloud sync returned an invalid response. Local records are unchanged.");
    }
    if (response.status === 409)
      throw new SyncConflictError(
        Number.isSafeInteger(data.currentRevision) ? data.currentRevision : null,
      );
    if (!response.ok)
      throw new SyncReviewError("Cloud sync could not complete. Local records are unchanged.");
    return data;
  }

  async function status() {
    const data = await request("GET", "/v1/privacy");
    const state = data.cloudSync;
    if (!state || typeof state !== "object")
      throw new SyncReviewError("Cloud sync authorization status is unavailable.");
    return {
      available:state.available === true,
      granted:state.granted === true,
      policyVersion:typeof state.activePolicyVersion === "string"
        ? state.activePolicyVersion : null,
      accountConnected:data.accountConnected === true,
    };
  }

  async function enable({ confirmation } = {}) {
    if (confirmation !== POLICY_PROMPT)
      throw new SyncReviewError(`Type ${POLICY_PROMPT} to authorize a cloud backup.`);
    const current = await status();
    if (!current.available || !current.accountConnected || !current.policyVersion)
      throw new SyncReviewError("The secure cloud sync service is not ready.");
    const result = await request("POST", "/v1/privacy/cloud-sync", {
      granted:true,policyVersion:current.policyVersion,
    });
    if (result.granted !== true)
      throw new SyncReviewError("Cloud sync consent could not be verified.");
    return {granted:true};
  }

  async function disable({confirmation} = {}) {
    if (confirmation !== DELETE_PROMPT)
      throw new SyncReviewError(`Type ${DELETE_PROMPT} to erase the cloud copy.`);
    const result = await request("DELETE", "/v1/privacy/cloud-sync");
    if (result.granted !== false || result.cloudSyncDataDeleted !== true)
      throw new SyncReviewError("Cloud deletion could not be confirmed.");
    return {revoked:true, cloudCopyErased:true, localRecordsChanged:false};
  }

  async function preview(localLedger) {
    const consent = await status();
    if (!consent.available || !consent.granted || !consent.accountConnected)
      throw new SyncReviewError("Explicit cloud sync consent is required.");
    const localFingerprint = await fingerprintLedger(localLedger,cryptoProvider);
    const current = await request("GET", "/v1/sync");
    if (!Number.isSafeInteger(current.revision) || current.revision < 0 ||
        current.revision > 1e12 ||
        (current.revision === 0 && current.ledger !== null))
      throw new SyncReviewError("Invalid cloud revision. Local records are unchanged.");
    const ledger = current.ledger;
    if (ledger !== null) validateReviewLedger(ledger,now());
    const comparison = reviewSyncChanges(localLedger,ledger,{now:now()});
    const result = Object.freeze({
      revision:current.revision, localFingerprint, comparison,
      cloudLedger:ledger === null ? null : structuredClone(ledger),
      fetchedAt:now(),
      automaticMergeAvailable:false,
    });
    issued.add(result);
    return result;
  }

  async function checkPreview(previewState,currentLocal) {
    if (!previewState || !issued.has(previewState))
      throw new SyncReviewError("Review the latest cloud copy before continuing.");
    if (await fingerprintLedger(currentLocal,cryptoProvider) !== previewState.localFingerprint)
      throw new SyncReviewError("The local records changed since preview. Review again.");
  }

  async function upload(previewState,currentLocal,{confirmation}={}) {
    if (confirmation !== UPLOAD_PROMPT)
      throw new SyncReviewError(`Type ${UPLOAD_PROMPT} before replacing the cloud copy.`);
    // Freeze the submit decision to one independent snapshot before any
    // async token or network step can observe a later UI mutation.
    const submission = structuredClone(currentLocal);
    await checkPreview(previewState,submission);
    validateReviewLedger(submission,now());
    const result = await request("PUT","/v1/sync",{
      expectedRevision:previewState.revision, ledger:submission,
    });
    if (result.saved !== true || result.revision !== previewState.revision + 1)
      throw new SyncReviewError("Cloud sync did not confirm the new revision.");
    // A second upload requires a fresh GET/preview and explicit confirmation.
    issued.delete(previewState);
    return {saved:true, revision:result.revision,localRecordsChanged:false};
  }

  async function useCloudCopy(previewState,currentLocal,{confirmation}={}) {
    if (confirmation !== DOWNLOAD_PROMPT)
      throw new SyncReviewError(`Type ${DOWNLOAD_PROMPT} to review replacing local records.`);
    await checkPreview(previewState,currentLocal);
    // Even a download may be based on an outdated preview. Check the
    // revision again before handing a potentially destructive replacement
    // to the user's local restore-review flow.
    const latest = await request("GET","/v1/sync");
    if (!Number.isSafeInteger(latest.revision) ||
        latest.revision !== previewState.revision)
      throw new SyncConflictError(
        Number.isSafeInteger(latest.revision) ? latest.revision : null,
      );
    // Deliberately returns data without altering storage. The caller MUST use
    // the reviewed backup-replacement UI before committing any local records.
    issued.delete(previewState);
    return {
      proposedLedger:previewState.cloudLedger === null
        ? {version:1,sims:[],purchases:[],usage:[],calls:[]}
        : structuredClone(previewState.cloudLedger),
      persisted:false, requiresLocalRestoreReview:true,
    };
  }

  return Object.freeze({status,enable,disable,preview,upload,useCloudCopy});
}

export const MANUAL_SYNC_CONFIRMATIONS = Object.freeze({
  enable:POLICY_PROMPT,upload:UPLOAD_PROMPT,
  download:DOWNLOAD_PROMPT,revoke:DELETE_PROMPT,
});
