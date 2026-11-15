import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Intentionally separate from ACCOUNT_HASH_KEY. Rotation needs a migration plan.
export function syncEncryptionKey(env = process.env) {
  const raw = env.ACCOUNT_SYNC_ENCRYPTION_KEY;
  if (typeof raw !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(raw))
    throw Error("A private 32-byte base64 sync encryption key is required.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw)
    throw Error("Invalid sync encryption key.");
  return key;
}

function aad(accountKey, revision) {
  if (!/^[0-9a-f]{64}$/.test(accountKey) ||
      !Number.isSafeInteger(revision) || revision < 1)
    throw Error("Invalid sync encryption context.");
  return Buffer.from(`telvyo:sync:v1:\0${accountKey}:\0${revision}`, "utf8");
}

/** AES-256-GCM encrypted at rest, bound to pseudonymous account and revision. */
export function encryptSnapshot(ledger, accountKey, revision, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(accountKey, revision));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(ledger), "utf8"), cipher.final(),
  ]);
  return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), ciphertext]);
}

export function decryptSnapshot(blob, accountKey, revision, key) {
  if (!Buffer.isBuffer(blob) || blob.length < 30 ||
      blob[0] !== 1 || blob.length > 262144)
    throw Error("Invalid encrypted sync snapshot.");
  const decipher = createDecipheriv(
    "aes-256-gcm", key, blob.subarray(1, 13),
  );
  decipher.setAAD(aad(accountKey, revision));
  decipher.setAuthTag(blob.subarray(13, 29));
  const plaintext = Buffer.concat([
    decipher.update(blob.subarray(29)), decipher.final(),
  ]);
  try {
    return JSON.parse(plaintext.toString("utf8"));
  } finally {
    plaintext.fill(0);
  }
}
