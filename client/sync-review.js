import { validateRecord } from "../dist/model.js";

const COLLECTIONS = Object.freeze([
  ["sims", "sim", "SIM profiles"],
  ["purchases", "purchase", "Data and airtime purchases"],
  ["usage", "usage", "Recorded data usage"],
  ["calls", "call", "Recorded calls"],
]);
const KEYS = new Set(["version", ...COLLECTIONS.map(([key]) => key)]);
const ALLOWED = {
  sim: new Set(["id", "carrier", "label", "slot", "color", "rate",
    "dailyLimitMB", "rateSource", "source", "monthlySpendLimit"]),
  purchase: new Set(["id", "simId", "type", "amount", "cost", "timestamp", "expiresAt"]),
  usage: new Set(["id", "simId", "app", "mb", "background", "timestamp"]),
  call: new Set(["id", "simId", "contact", "duration", "cost", "estimated", "timestamp"]),
};
const plain = value => !!value && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const EMPTY = () => ({version:1,sims:[],purchases:[],usage:[],calls:[]});

export class SyncReviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyncReviewError";
  }
}

export function validateReviewLedger(ledger, now=Date.now()) {
  if (!plain(ledger) || ledger.version !== 1 ||
      Object.keys(ledger).some(key => !KEYS.has(key)))
    throw new SyncReviewError("Only a Telvyo v1 manual record backup is supported.");
  const caps = {sims:2,purchases:3000,usage:3000,calls:3000};
  for (const [key, maximum] of Object.entries(caps))
    if (!Array.isArray(ledger[key]) || ledger[key].length > maximum)
      throw new SyncReviewError("The backup contains an invalid or oversized record list.");
  if (ledger.purchases.length + ledger.usage.length + ledger.calls.length > 5000)
    throw new SyncReviewError("The backup contains too many entries.");
  for (const [key, kind] of COLLECTIONS) {
    const ids = new Set();
    for (const record of ledger[key]) {
      if (!plain(record) || Object.keys(record).some(field => !ALLOWED[kind].has(field)) ||
          ids.has(record.id) || validateRecord(kind, record, ledger, now))
        throw new SyncReviewError("The backup contains invalid or duplicate records.");
      if (kind === "sim" && ["source", "rateSource"].some(field =>
        record[field] !== undefined &&
        (typeof record[field] !== "string" || record[field].length > 40)))
        throw new SyncReviewError("The backup contains invalid SIM metadata.");
      ids.add(record.id);
    }
  }
  // Align with private sync API's 192 KiB limit. No server or network use.
  const bytes = new TextEncoder().encode(JSON.stringify(ledger)).byteLength;
  if (bytes > 196608) throw new SyncReviewError("The backup is too large for secure cloud sync.");
  return ledger;
}

/**
 * Descriptive comparison ONLY: same IDs in two devices are not permission
 * to merge them. Does not mutate input, upload data, or choose a winner.
 */
export function reviewSyncChanges(local, cloud, { now=Date.now() }={}) {
  validateReviewLedger(local, now);
  validateReviewLedger(cloud ?? EMPTY(), now);
  const incoming = cloud ?? EMPTY();
  const categories = COLLECTIONS.map(([key, ,label]) => {
    const left = new Map(local[key].map(record => [record.id, record]));
    const right = new Map(incoming[key].map(record => [record.id, record]));
    const localOnly = local[key].filter(record => !right.has(record.id)).length;
    const cloudOnly = incoming[key].filter(record => !left.has(record.id)).length;
    const changed = local[key].filter(record => right.has(record.id) &&
      JSON.stringify(record) !== JSON.stringify(right.get(record.id))).length;
    const identical = local[key].length - localOnly - changed;
    return {kind:key,label,localCount:left.size,cloudCount:right.size,
      localOnly,cloudOnly,changed,identical};
  });
  const totals = categories.reduce((result, row) => {
    for (const field of ["localOnly","cloudOnly","changed","identical"])
      result[field] += row[field];
    return result;
  },{localOnly:0,cloudOnly:0,changed:0,identical:0});
  return {
    categories,totals,
    hasDifferences:!!(totals.localOnly+totals.cloudOnly+totals.changed),
    uploadWouldRemoveCloudEntries:totals.cloudOnly,
    downloadWouldRemoveLocalEntries:totals.localOnly,
    changedRecordCollisions:totals.changed,
    automaticMergeAvailable:false,
    provenance:"Manual local records compared with the latest signed-in account snapshot. Neither side is carrier-verified.",
  };
}

export async function fingerprintLedger(ledger, cryptoProvider=globalThis.crypto) {
  validateReviewLedger(ledger);
  if (!cryptoProvider?.subtle)
    throw new SyncReviewError("Secure comparison is not available on this device.");
  const payload = new TextEncoder().encode(JSON.stringify(ledger));
  const digest = new Uint8Array(await cryptoProvider.subtle.digest("SHA-256", payload));
  return Array.from(digest, b => b.toString(16).padStart(2,"0")).join("");
}
