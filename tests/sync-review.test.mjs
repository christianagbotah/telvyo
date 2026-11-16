import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createEmpty } from "../dist/model.js";
import {
  SyncReviewError, fingerprintLedger, reviewSyncChanges, validateReviewLedger,
} from "../client/sync-review.js";

const timestamp = new Date(Date.now() - 3600000).toISOString();
const purchase = (id,simId,cost) =>
  ({id,simId,type:"data",amount:1000,cost,timestamp});
const ledger = () => createEmpty();

test("record review separates additions, removals, same-ID edits and identical entries",()=>{
  const local=ledger(),cloud=ledger();
  local.purchases=[purchase("shared","mtn",8),purchase("only-local","mtn",10)];
  cloud.purchases=[purchase("shared","mtn",9),purchase("only-cloud","telecel",3)];
  local.calls=[{id:"same",simId:"mtn",contact:"No Network Access",duration:30,cost:2,
    estimated:false,timestamp}];
  cloud.calls=structuredClone(local.calls);
  const previousLocal=structuredClone(local);
  const previousCloud=structuredClone(cloud);
  const review=reviewSyncChanges(local,cloud);
  assert.deepEqual(review.totals,{
    localOnly:1,cloudOnly:1,changed:1,identical:3,
  });
  assert.equal(review.hasDifferences,true);
  assert.equal(review.changedRecordCollisions,1);
  assert.equal(review.uploadWouldRemoveCloudEntries,1);
  assert.equal(review.downloadWouldRemoveLocalEntries,1);
  assert.equal(review.automaticMergeAvailable,false);
  assert.match(review.provenance,/Neither side is carrier-verified/);
  assert.deepEqual(local,previousLocal);
  assert.deepEqual(cloud,previousCloud);
  assert.deepEqual(review.categories.map(x=>x.kind),["sims","purchases","usage","calls"]);
});

test("empty cloud preview is not treated as automatically safe replacement",()=>{
  const local=ledger();
  local.purchases=[purchase("p1","mtn",8)];
  const plan=reviewSyncChanges(local,null);
  assert.equal(plan.uploadWouldRemoveCloudEntries,0);
  assert.equal(plan.downloadWouldRemoveLocalEntries,3);
  assert.equal(plan.automaticMergeAvailable,false);
  assert.equal(plan.hasDifferences,true);
  assert.equal(reviewSyncChanges(local,local).hasDifferences,false);
});

test("only manual v1 backup structures are accepted as sync input",()=>{
  const state=ledger();
  state.sims[0].monthlySpendLimit=150;
  state.purchases.push(purchase("p1","mtn",7));
  assert.equal(validateReviewLedger(state),state);
  const cases=[
    {...state,version:2},
    {...state,hidden:"private token"},
    {...state,purchases:[{...state.purchases[0],accessToken:"secret"}]},
    {...state,sims:[{...state.sims[0],source:{token:"hidden"}},state.sims[1]]},
    {...state,sims:[state.sims[0],{...state.sims[0],slot:1}]},
    {...state,purchases:[...state.purchases,...state.purchases]},
    {...state,purchases:[{...state.purchases[0],simId:"ghost"}]},
    {...state,calls:[]},
  ];
  // The calls-empty object is deliberately allowed (a valid but empty list).
  for (const item of cases.slice(0,-1))
    assert.throws(()=>validateReviewLedger(item),SyncReviewError);
  assert.doesNotThrow(()=>validateReviewLedger(cases.at(-1)));
});

test("oversized snapshots and unstable insecure crypto contexts fail closed",async()=>{
  const state=ledger();
  state.purchases=Array.from({length:3001},(_,i)=>purchase("id"+i,"mtn",10));
  assert.throws(()=>validateReviewLedger(state),/oversized/);
  const clean=ledger();
  const fingerprint=await fingerprintLedger(clean,webcrypto);
  assert.match(fingerprint,/^[0-9a-f]{64}$/);
  assert.equal(await fingerprintLedger(clean,webcrypto),fingerprint);
  clean.sims[0].label="Changed";
  assert.notEqual(await fingerprintLedger(clean,webcrypto),fingerprint);
  await assert.rejects(()=>fingerprintLedger(clean,{subtle:null}),SyncReviewError);
});
