import { validateRecord } from "../dist/model.js";

const ALLOWED = {
  sim: new Set(["id", "carrier", "label", "slot", "color", "rate",
    "dailyLimitMB", "rateSource", "source", "monthlySpendLimit"]),
  purchase: new Set(["id", "simId", "type", "amount", "cost",
    "timestamp", "expiresAt"]),
  usage: new Set(["id", "simId", "app", "mb", "background", "timestamp"]),
  call: new Set(["id", "simId", "contact", "duration", "cost",
    "estimated", "timestamp"]),
};
const plain = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Only a v1 manually logged ledger. No access tokens, phone identities,
 * provider responses, cache state, hidden metadata or executable properties.
 */
export function validateSyncLedger(ledger, now = Date.now()) {
  if (!plain(ledger) || ledger.version !== 1 ||
      Object.keys(ledger).some(k =>
        !["version", "sims", "purchases", "usage", "calls"].includes(k)))
    throw Error("Only Telvyo v1 personal ledgers may be synchronized.");

  const limits = { sims: 2, purchases: 3000, usage: 3000, calls: 3000 };
  for (const [name, max] of Object.entries(limits))
    if (!Array.isArray(ledger[name]) || ledger[name].length > max)
      throw Error("Invalid or oversized ledger collection.");
  if (ledger.purchases.length + ledger.usage.length + ledger.calls.length > 5000)
    throw Error("Too many records in this sync snapshot.");

  for (const [kind, name] of [
    ["sim", "sims"], ["purchase", "purchases"],
    ["usage", "usage"], ["call", "calls"],
  ]) {
    const seen = new Set();
    for (const record of ledger[name]) {
      if (!plain(record) ||
          Object.keys(record).some(k => !ALLOWED[kind].has(k)))
        throw Error("Unexpected fields in sync snapshot.");
      if (kind === "sim" && ["source", "rateSource"].some(k =>
        record[k] !== undefined &&
        (typeof record[k] !== "string" || record[k].length > 40)))
        throw Error("Invalid optional SIM source metadata.");
      if (seen.has(record.id) || validateRecord(kind, record, ledger, now))
        throw Error("Invalid or duplicate record in sync snapshot.");
      seen.add(record.id);
    }
  }

  const encoded = JSON.stringify(ledger);
  if (Buffer.byteLength(encoded) > 196608)
    throw Error("Sync snapshot is too large.");
  return ledger;
}
