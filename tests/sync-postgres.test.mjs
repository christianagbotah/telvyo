import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createPgSyncStore } from "../server/sync-store.js";
import { accountKeyFor } from "../server/privacy-api.js";
import { encryptSnapshot, decryptSnapshot, syncEncryptionKey } from "../server/sync-crypto.js";
import { createEmpty } from "../dist/model.js";

const requireFromServer = createRequire(new URL("../server/index.js", import.meta.url));
const {Pool} = requireFromServer("pg");
const url = process.env.TELVYO_TEST_DATABASE_URL;

test("private sync PostgreSQL migration, encryption, isolation, CAS and tombstone",{
  skip:!url?"Requires dedicated ephemeral CI test database":false,
},async()=>{
  const u=new URL(url);
  if(!["127.0.0.1","localhost"].includes(u.hostname) ||
     u.pathname!=="/telvyo_test")
    throw Error("Refusing to run private sync migration on a non-isolated database.");
  const pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:5000});
  try{
    for(const migration of [
      "001_privacy_consent.sql","002_sync_snapshots.sql",
    ]){
      await pool.query(await readFile(
        new URL("../server/migrations/"+migration,import.meta.url),"utf8"
      ));
    }
    const env={
      AUTH_ISSUER:"https://login.telvyo.test",
      ACCOUNT_HASH_KEY:"test-only-hmac-account-key-32-bytes-minimum",
      ACCOUNT_SYNC_ENCRYPTION_KEY:Buffer.alloc(32,17).toString("base64"),
    };
    const alice=accountKeyFor({sub:"alice-postgres-sync"},env);
    const bob=accountKeyFor({sub:"bob-postgres-sync"},env);
    const key=syncEncryptionKey(env);
    const store=createPgSyncStore(pool);
    const data=createEmpty();
    data.sims[0].label="CONFIDENTIAL LOCAL SIM LABEL";
    data.purchases.push({id:"p1",simId:"mtn",type:"data",amount:1234,cost:12,
      timestamp:"2026-11-15T10:00:00.000Z"});
    assert.equal(await store.get(alice),null);
    const encrypted=encryptSnapshot(data,alice,1,key);
    const first=await store.save(alice,0,encrypted);
    assert.equal(Number(first.revision),1);
    assert.equal(first.saved,true);
    assert.equal((await store.save(alice,0,encrypted)).saved,false);
    const saved=await store.get(alice);
    assert.equal(Number(saved.revision),1);
    assert.deepEqual(decryptSnapshot(saved.snapshot,alice,1,key),data);
    assert.ok(!saved.snapshot.includes(Buffer.from("CONFIDENTIAL LOCAL SIM LABEL")));
    assert.equal(await store.get(bob),null);
    const second=await store.save(alice,1,encryptSnapshot(data,alice,2,key));
    assert.equal(Number(second.revision),2);
    assert.equal((await store.save(alice,1,encrypted)).saved,false);
    assert.equal(Number((await store.clear(alice)).revision),3);
    assert.equal((await store.get(alice)).snapshot,null);
    assert.equal((await store.save(alice,0,encrypted)).saved,false);
    assert.equal((await store.save(alice,2,encrypted)).saved,false);
    const fourth=await store.save(alice,3,encryptSnapshot(data,alice,4,key));
    assert.equal(Number(fourth.revision),4);
    assert.equal((await store.get(bob)),null);
    await store.clear(alice);

    // Real two-connection race: an upload that holds the account lock may
    // finish, but its succeeding revocation MUST erase it before committing.
    await pool.query(
      "INSERT INTO telvyo.consent_events (account_key, purpose, granted, policy_version) " +
      "VALUES ($1, 'cloud-sync', true, '2026-11')", [alice],
    );
    let releaseWriter;
    const writerGate = new Promise(resolve => { releaseWriter = resolve; });
    let enteredWriter;
    const writerEntered = new Promise(resolve => { enteredWriter = resolve; });
    const writing = store.withAccountLock(alice, async ({sync, consent}) => {
      const before = await consent.latest(alice, "cloud-sync");
      assert.equal(before.granted,true);
      enteredWriter();
      await writerGate;
      const current = await sync.get(alice);
      return sync.save(alice, Number(current.revision),
        encryptSnapshot(data, alice, Number(current.revision) + 1, key));
    });
    await writerEntered;
    const revoking = store.withAccountLock(alice, async ({sync, consent}) => {
      await sync.clear(alice);
      return consent.append(alice, "cloud-sync", false, "2026-11");
    });
    releaseWriter();
    const [writeResult, revocation] = await Promise.all([writing, revoking]);
    assert.equal(writeResult.saved,true);
    assert.equal(revocation.granted,false);
    assert.equal((await store.get(alice)).snapshot,null);
    assert.equal((await store.get(alice)).revision > writeResult.revision,true);

    // Opposite ordering: consent was revoked before an attempted PUT.
    // The locked consent check must reject the upload without restoring it.
    const lateWrite = await store.withAccountLock(alice, async ({sync, consent}) => {
      const latest = await consent.latest(alice, "cloud-sync");
      if (!latest?.granted) return "revoked";
      const current = await sync.get(alice);
      return sync.save(alice, Number(current.revision),
        encryptSnapshot(data, alice, Number(current.revision) + 1, key));
    });
    assert.equal(lateWrite, "revoked");
    assert.equal((await store.get(alice)).snapshot,null);

    await pool.query("DELETE FROM telvyo.sync_snapshots WHERE account_key = $1",[alice]);
    await pool.query(
      "DELETE FROM telvyo.consent_events WHERE account_key = $1 AND purpose = 'cloud-sync'",
      [alice],
    );
  }finally{await pool.end();}
});
