import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { accountKeyFor } from "../server/privacy-api.js";
import { createPgPrivacyStore } from "../server/privacy-store.js";

const requireFromServer = createRequire(new URL("../server/index.js", import.meta.url));
const { Pool } = requireFromServer("pg");
const url = process.env.TELVYO_TEST_DATABASE_URL;

test("isolated PostgreSQL migration and pseudonymous consent persist with account isolation", {
  skip: !url ? "Requires a dedicated ephemeral CI test database" : false,
}, async () => {
  const u = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.pathname !== "/telvyo_test")
    throw Error("Refusing to run migration outside an isolated localhost telvyo_test database.");
  const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 5000 });
  try {
    const migration = await readFile(
      new URL("../server/migrations/001_privacy_consent.sql", import.meta.url),
      "utf8",
    );
    await pool.query(migration);
    const store = createPgPrivacyStore(pool);
    const env = {
      AUTH_ISSUER: "https://auth.test.example",
      ACCOUNT_HASH_KEY: "test-only-secret-32-chars-minimum-not-production",
    };
    const alice = accountKeyFor({ sub: "alice-account" }, env);
    const bob = accountKeyFor({ sub: "bob-account" }, env);
    assert.equal(await store.latest(alice, "ai-advisor"), null);
    const granted = await store.append(alice, "ai-advisor", true, "2026-11");
    assert.ok(granted.at instanceof Date);
    await store.append(bob, "ai-advisor", true, "2026-11");
    assert.equal((await store.latest(alice, "ai-advisor")).granted, true);
    await store.append(alice, "ai-advisor", false, "2026-11");
    assert.equal((await store.latest(alice, "ai-advisor")).granted, false);
    assert.equal((await store.latest(bob, "ai-advisor")).granted, true);
    const invalid = await store.latest("' OR 1=1 --", "ai-advisor");
    assert.equal(invalid, null);
    const history = await pool.query(
      "SELECT granted FROM telvyo.consent_events WHERE account_key = $1 ORDER BY id",
      [alice],
    );
    assert.deepEqual(history.rows.map(row => row.granted), [true, false]);
    assert.equal(await store.clear(alice), 2);
    assert.equal(await store.latest(alice, "ai-advisor"), null);
    assert.equal((await store.latest(bob, "ai-advisor")).granted, true);
    assert.equal(await store.clear(bob), 1);
  } finally {
    await pool.end();
  }
});
