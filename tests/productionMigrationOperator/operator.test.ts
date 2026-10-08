import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { ARTIFACTS, DEFAULT_TARGET, OperatorFailure, artifactMatches, preflight, versions, type PreflightInput, type Review } from "../../lib/productionMigrationOperator/contracts";
import { consumeLocalAuthorization, issueLocalRehearsalAuthorization } from "../../lib/productionMigrationOperator/authorization";
import { LocalFixture, LocalMigrationSession, SharedRehearsalLease, type FixtureOptions } from "../../lib/productionMigrationOperator/session";
import { createRehearsal, rehearsalInput } from "../../lib/productionMigrationOperator/rehearsal";
const clone = (): PreflightInput => structuredClone(rehearsalInput());
const reject = (input: PreflightInput, code: string) => assert.throws(() => preflight(input), (e: unknown) => e instanceof OperatorFailure && e.code === code);
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function waiting(options: FixtureOptions = {}) {
  const h = createRehearsal(options);
  await h.session.start(clone()); await h.session.execute("INFO"); await h.session.execute("VALIDATE");
  return h;
}
test("default entry point is NONE/inert and all supplied CLI arguments fail", () => {
  assert.equal(DEFAULT_TARGET,"NONE");
  const output = execFileSync(process.execPath,["scripts/productionMigrationOperator.mjs"],{encoding:"utf8",windowsHide:true});
  assert.deepEqual(JSON.parse(output),{tool:"migration-operator-foundation",target:"NONE",productionExecutable:false,status:"INERT"});
  for (const arg of ["--production","migrate","--target=PRODUCTION"]) {
    const r = spawnSync(process.execPath,["scripts/productionMigrationOperator.mjs",arg],{encoding:"utf8",windowsHide:true});
    assert.equal(r.status,2); assert.equal(JSON.parse(r.stdout).status,"OPERATION_REJECTED");
  }
});
for (const [name,change,code] of [
  ["no target",{target:undefined},"TARGET_REQUIRED"],
  ["NONE",{target:{...clone().target!,kind:"NONE"}},"TARGET_REQUIRED"],
  ["PRODUCTION",{target:{...clone().target!,kind:"PRODUCTION"}},"PRODUCTION_ADAPTER_UNAVAILABLE"],
  ["cloud target without adapter",{target:{...clone().target!,kind:"NON_PRODUCTION_CLOUD_SQL"}},"CLOUD_ADAPTER_UNAVAILABLE"],
  ["runtime identity",{target:{...clone().target!,identity:"RUNTIME"}},"IDENTITY_REJECTED"],
  ["bootstrap identity",{target:{...clone().target!,identity:"BOOTSTRAP"}},"IDENTITY_REJECTED"],
  ["dirty",{worktreeClean:false},"DIRTY_SOURCE"],
  ["index",{indexClean:false},"INDEX_DIRTY"],
  ["SHA",{actualCommit:"b".repeat(40)},"SOURCE_MISMATCH"],
  ["untracked",{untrackedMigrations:["V000009__development.sql"]},"UNTRACKED_MIGRATION"],
  ["collision",{knownCollisions:["000009"]},"VERSION_COLLISION"],
  ["unverified history",{history:{...clone().history,verified:"UNKNOWN"}},"HISTORY_UNVERIFIED"],
  ["missing history",{history:{...clone().history,locations:0}},"HISTORY_UNVERIFIED"],
  ["second history",{history:{...clone().history,locations:2}},"HISTORY_UNVERIFIED"],
  ["wrong history target",{history:{...clone().history,targetId:"other"}},"HISTORY_UNVERIFIED"],
  ["wrong history database",{history:{...clone().history,database:"other"}},"HISTORY_UNVERIFIED"],
  ["unknown privilege",{privileges:{...clone().privileges,create:"UNKNOWN"}},"PRIVILEGE_UNVERIFIED"],
  ["privilege denial",{privileges:{...clone().privileges,ownershipAlter:"NO"}},"PRIVILEGE_UNVERIFIED"],
  ["digest",{flyway:{...ARTIFACTS.flyway,digest:"sha256:"+"0".repeat(64)}},"ARTIFACT_MISMATCH"],
  ["floating",{flyway:{...ARTIFACTS.flyway,version:"latest"}},"ARTIFACT_MISMATCH"],
  ["missing digest",{flyway:{...ARTIFACTS.flyway,digest:""}},"ARTIFACT_MISMATCH"],
  ["platform",{proxy:{...ARTIFACTS.proxy,platform:"linux/arm64"}},"ARTIFACT_MISMATCH"],
  ["child digest",{proxy:{...ARTIFACTS.proxy,childDigest:"sha256:"+"0".repeat(64)}},"ARTIFACT_MISMATCH"],
  ["extra file",{migrations:[...clone().migrations,{filename:"V000002__extra.sql",sha256:"2".repeat(64)}]},"MANIFEST_MISMATCH"],
  ["missing expected file",{approvedManifest:[...clone().approvedManifest,{filename:"V000002__expected.sql",sha256:"2".repeat(64)}]},"MANIFEST_MISMATCH"],
  ["manifest checksum",{approvedManifest:[{filename:"V000001__fixture.sql",sha256:"2".repeat(64)}]},"MANIFEST_MISMATCH"],
] as const) test(`preflight rejects ${name} before resource acquisition`, async () => {
  const input = {...clone(),...change} as PreflightInput;
  reject(input,code);
  const h=createRehearsal(); const r=await h.session.start(input);
  assert.equal(r.state,"FAILED");assert.equal(r.failureCode,code);assert.equal(h.fixture.counts.starts,0);assert.equal(r.cleanup,"NOT_NEEDED");
});
for (const bad of ["V000000__zero.sql","V9__short.sql","V000001__Upper.sql","V000001__bad-name.sql","../V000001__path.sql","V000001__a.sql;echo"]) test(`malformed filename rejected: ${bad}`, () => reject({...clone(),migrations:[{filename:bad,sha256:"1".repeat(64)}]},"VERSION_INVALID"));
test("duplicate versions, gaps, empty/oversized sets and invalid hash reject without allocating a version", () => {
  reject({...clone(),migrations:[...clone().migrations,{filename:"V000001__other.sql",sha256:"2".repeat(64)}]},"VERSION_DUPLICATE");
  reject({...clone(),migrations:[{filename:"V000002__gap.sql",sha256:"2".repeat(64)}]},"VERSION_GAP");
  assert.throws(()=>versions([]));assert.throws(()=>versions(Array.from({length:65},(_,i)=>({filename:`V${String(i+1).padStart(6,"0")}__x.sql`,sha256:"1".repeat(64)}))));
  assert.throws(()=>versions([{filename:"V000001__x.sql",sha256:"not-a-hash"}]));
  assert.deepEqual(versions(clone().migrations),["000001"]);
});
for (const key of ["identityVerified","databaseVerified","schemaExists","connect","usage","create","ownershipAlter","historyReadable","historyAuthoritative"] as const) test(`UNKNOWN ${key} fails closed`,()=>reject({...clone(),privileges:{...clone().privileges,[key]:"UNKNOWN"}},"PRIVILEGE_UNVERIFIED"));
for (const change of [{publishedPorts:true},{binding:"0.0.0.0"},{restartPolicy:"ALWAYS"},{credentialModel:"STATIC_KEY"},{adapter:"REAL"},{sessionMs:0},{sessionMs:30*60*1000+1}]) test(`unsafe transport ${JSON.stringify(change)} rejected`,()=>reject({...clone(),transport:{...clone().transport,...change}} as PreflightInput,"TRANSPORT_CONTRACT_REJECTED"));
test("artifact substitution is strict and pinned constants are immutable",()=> {
  assert.equal(artifactMatches(ARTIFACTS.flyway,ARTIFACTS.flyway),true);
  assert.equal(artifactMatches({...ARTIFACTS.flyway,image:"attacker/image"},ARTIFACTS.flyway),false);
  assert.throws(()=>Object.assign(ARTIFACTS.flyway,{digest:"wrong"}));
});
test("preflight copies source data and no caller mutation changes the certificate",()=> {
  const input=clone();const result=preflight(input);
  Object.assign(input.migrations[0],{sha256:"f".repeat(64)});
  assert.equal(result.manifest[0].sha256,"1".repeat(64));assert.ok(Object.isFrozen(result.manifest[0]));
});
for (const operation of ["INFO","VALIDATE"] as const) test(`${operation} cannot automatically migrate`,async()=> {
  const h=createRehearsal();await h.session.start(clone());await h.session.execute(operation);
  assert.equal(h.fixture.counts.migrate,0);assert.notEqual(h.session.state(),"MIGRATION_AUTHORIZED");
  const r=await h.session.execute("MIGRATE");assert.equal(r.failureCode,"AUTHORIZATION_REJECTED");assert.equal(h.fixture.counts.migrate,0);assert.equal(h.fixture.counts.stops,1);
});
test("explicit local approval permits only one conceptual migration and post validation",async()=> {
  const h=await waiting();assert.equal(h.session.state(),"AWAITING_MIGRATE_AUTHORIZATION");
  await h.session.authorize(h.approve());const r=await h.session.execute("MIGRATE");
  assert.equal(r.state,"COMPLETED");assert.equal(r.cleanup,"PASS");assert.equal(h.fixture.counts.migrate,1);assert.equal(h.fixture.counts.postValidate,1);assert.equal(h.fixture.counts.stops,1);
  await h.session.execute("MIGRATE");await h.session.cancel();assert.equal(h.fixture.counts.migrate,1);assert.equal(h.fixture.counts.stops,1);
  assert.ok(h.session.trace().includes("VALIDATED"));assert.ok(h.session.trace().includes("POST_VALIDATING"));
});
for (const key of ["source","targetBinding","historyBinding","flywayDigest","proxyDigest","pending","sessionId"] as const) test(`authorization binds exact ${key}`,async()=> {
  const h=await waiting();const review=h.session.review();
  const changed={...review,[key]:key==="pending"?[]:key==="source"?"b".repeat(40):"other"} as Review;
  if(key==="flywayDigest"||key==="proxyDigest") {assert.throws(()=>h.approve(changed));await h.session.cancel();}
  else {const r=await h.session.authorize(h.approve(changed));assert.equal(r.failureCode,"AUTHORIZATION_REJECTED");}
  assert.equal(h.fixture.counts.migrate,0);assert.equal(h.fixture.counts.stops,1);
});
test("Production approval cannot be issued; ordinary success and lookalike grants are insufficient",async()=> {
  const h=await waiting();assert.throws(()=>h.approve({...h.session.review(),targetKind:"PRODUCTION"} as unknown as Review));
  const r=await h.session.authorize(Object.freeze({scope:"LOCAL_REHEARSAL"}));assert.equal(r.failureCode,"AUTHORIZATION_REJECTED");
});
test("authorization is immutable, expires before consumption and cannot replay",async()=> {
  const h=await waiting();const review=h.session.review(),grant=h.approve();assert.ok(Object.isFrozen(grant));
  consumeLocalAuthorization(grant,review,h.fixture.now);assert.throws(()=>consumeLocalAuthorization(grant,review,h.fixture.now),(e:unknown)=>e instanceof OperatorFailure&&e.code==="AUTHORIZATION_REPLAY");await h.session.cancel();
  const expired=await waiting();const g=expired.approve();expired.fixture.advance(10_001);const r=await expired.session.authorize(g);assert.equal(r.failureCode,"AUTHORIZATION_EXPIRED");
});
test("expiry is rechecked immediately before migration",async()=> {
  const h=await waiting();await h.session.authorize(h.approve());h.fixture.advance(10_001);const r=await h.session.execute("MIGRATE");assert.equal(r.failureCode,"AUTHORIZATION_EXPIRED");assert.equal(h.fixture.counts.migrate,0);
});
test("post-issue pending substitution fails before MIGRATE",async()=> {
  const h=await waiting();await h.session.authorize(h.approve());h.fixture.pending=[];const r=await h.session.execute("MIGRATE");assert.equal(r.failureCode,"PENDING_MISMATCH");assert.equal(h.fixture.counts.migrate,0);
});
for (const op of ["REPAIR","CLEAN","BASELINE","UNDO","sh -c arbitrary"]) test(`${op} unavailable`,async()=> {
  const h=createRehearsal();await h.session.start(clone());const r=await h.session.execute(op as "INFO");assert.equal(r.failureCode,"OPERATION_REJECTED");assert.equal(h.fixture.counts.migrate,0);assert.equal(h.fixture.counts.stops,1);
});
for (const stage of ["START","INFO","VALIDATE","MIGRATE","POST_VALIDATE","STOP"] as const) test(`failure at ${stage} is terminal with one cleanup and no retry`,async()=> {
  const h=createRehearsal({failAt:stage,rawFailure:"Bearer TOP_SECRET password=TOP_SECRET raw-stack"});
  await h.session.start(clone());
  if(h.session.state()!=="FAILED") await h.session.execute("INFO");
  if(h.session.state()!=="FAILED") await h.session.execute("VALIDATE");
  if(h.session.state()!=="FAILED") {await h.session.authorize(h.approve());await h.session.execute("MIGRATE");}
  assert.equal(h.session.state(),"FAILED");assert.equal(h.fixture.counts.stops,1);const counts={...h.fixture.counts};await h.session.execute("MIGRATE");await h.session.cancel();assert.deepEqual(h.fixture.counts,counts);
  assert.doesNotMatch(JSON.stringify(h.session.receipt()),/TOP_SECRET|Bearer|password|raw-stack/);
});
test("cancellation before acquisition is terminal and does not acquire",async()=> {
  const h=createRehearsal();await h.session.cancel();await h.session.start(clone());assert.equal(h.fixture.counts.starts,0);assert.equal(h.fixture.counts.stops,0);
});
test("cancellation during transport startup prevents stale success and cleans once",async()=> {
  const h=createRehearsal({pauseAt:"START"});const start=h.session.start(clone());await tick();await h.session.cancel();h.fixture.release();await start;assert.equal(h.session.state(),"CANCELLED");assert.equal(h.fixture.counts.stops,1);
});
test("timeout interrupts a hung fake operation and cleanup completes exactly once",async()=> {
  const h=createRehearsal({pauseAt:"INFO"});await h.session.start({...clone(),transport:{...clone().transport,sessionMs:10}});const r=await h.session.execute("INFO");assert.equal(r.state,"TIMED_OUT");assert.equal(r.failureCode,"TIMEOUT");assert.equal(h.fixture.counts.stops,1);await h.session.cancel();assert.equal(h.fixture.counts.stops,1);
});
test("concurrent operations fail closed and late completion cannot overwrite terminal state",async()=> {
  const h=createRehearsal({pauseAt:"INFO"});await h.session.start(clone());const pending=h.session.execute("INFO");await tick();await h.session.execute("VALIDATE");await pending;assert.equal(h.session.state(),"FAILED");assert.equal(h.fixture.counts.stops,1);assert.equal(h.fixture.counts.migrate,0);
});
test("validation-only completion cleans without migration",async()=> {
  const h=await waiting();const r=await h.session.finishWithoutMigration();assert.equal(r.state,"COMPLETED");assert.equal(h.fixture.counts.stops,1);assert.equal(h.fixture.counts.migrate,0);
});
test("receipts contain only bounded allowlisted classifications, not arbitrary fields/output",async()=> {
  const input=Object.assign(clone(),{token:"TOP_SECRET",password:"TOP_SECRET",cookie:"TOP_SECRET",Authorization:"TOP_SECRET",stdout:"TOP_SECRET",stderr:"TOP_SECRET",sql:"TOP_SECRET",adc:"TOP_SECRET"});
  const h=createRehearsal();await h.session.start(input);await h.session.execute("VALIDATE");const r=h.session.receipt();
  assert.doesNotMatch(JSON.stringify(r),/TOP_SECRET/); assert.ok(Object.keys(r).every(k => !["token","password","cookie","Authorization","stdout","stderr","sql","adc"].includes(k)));assert.ok(Buffer.byteLength(JSON.stringify(r))<4096);assert.ok(Object.isFrozen(r));await h.session.cancel();
});
test("core modules contain no direct network/process/credential execution or migration allocator",()=> {
  for(const file of ["contracts.ts","authorization.ts","session.ts","rehearsal.ts"]){const s=readFileSync(`lib/productionMigrationOperator/${file}`,"utf8");assert.doesNotMatch(s,/from ["'](?:node:child_process|node:https?|pg|google-auth-library|@google-cloud)/);assert.doesNotMatch(s,/\bfetch\(|process\.env|execFile\(|spawn\(|gcloud|\.getIdToken\(|\.query\(/);}
  assert.equal((DEFAULT_TARGET as string),"NONE");
});
test("review mutation after issue cannot alter authorization bindings",async()=> {
  const h=await waiting();const review=structuredClone(h.session.review());
  const grant=issueLocalRehearsalAuthorization(review,h.fixture.now+10_000,h.fixture.now);
  Object.assign(review,{source:"b".repeat(40),targetBinding:"other",historyBinding:"other"});
  (review.pending as string[]).splice(0);
  await h.session.authorize(grant);const r=await h.session.execute("MIGRATE");assert.equal(r.state,"COMPLETED");assert.equal(h.fixture.counts.migrate,1);
});
test("arbitrary transport and subclass injection is rejected without execution",()=> {
  let calls=0;
  const foreign={perform(){calls++;}};
  assert.throws(()=>new LocalMigrationSession(foreign as unknown as LocalFixture));
  class Foreign extends LocalFixture { override async perform(){calls++;} }
  assert.throws(()=>new LocalMigrationSession(new Foreign()));assert.equal(calls,0);
});
test("session internals and fake adapter methods cannot be overwritten",async()=> {
  const h=await waiting();
  assert.throws(()=>Object.assign(h.session,{currentState:"MIGRATION_AUTHORIZED",authorizationExpiry:Infinity}));
  assert.throws(()=>Object.assign(h.fixture,{perform:async()=>{throw new Error("injected");}}));
  assert.throws(()=>Object.defineProperty(h.fixture,"now",{value:0}));
  assert.throws(()=>Object.assign(LocalFixture.prototype,{perform:async()=>{}}));
  assert.equal(h.session.state(),"AWAITING_MIGRATE_AUTHORIZATION");
  await h.session.cancel();assert.equal(h.fixture.counts.stops,1);
});
test("mutated safe-error codes and hostile error getters never enter receipts",async()=> {
  for(const accessor of [false,true]) {
    const error=new OperatorFailure("SOURCE_MISMATCH");
    if(accessor) Object.defineProperty(error,"code",{get(){throw new Error("TOP_SECRET");}});
    else Object.assign(error,{code:"Bearer TOP_SECRET"});
    const input=clone();Object.defineProperty(input,"target",{get(){throw error;}});
    const h=createRehearsal();const r=await h.session.start(input);
    assert.equal(r.failureCode,"TRANSPORT_FAILED");assert.doesNotMatch(JSON.stringify(r),/TOP_SECRET|Bearer/);assert.equal(h.fixture.counts.starts,0);
  }
});
test("coercible source metadata cannot inject a raw secret into receipts",async()=> {
  const poison={toString(){return "a".repeat(40);},toJSON(){return "TOP_SECRET";}};
  const h=createRehearsal();const r=await h.session.start({...clone(),expectedCommit:poison,actualCommit:poison} as unknown as PreflightInput);
  assert.equal(r.failureCode,"SOURCE_MISMATCH");assert.doesNotMatch(JSON.stringify(r),/TOP_SECRET/);
});
test("unknown nested metadata is discarded rather than retained in preflight proof",()=> {
  const input=clone();Object.assign(input.target!,{token:{value:"TOP_SECRET"}});Object.assign(input.history,{adc:{value:"TOP_SECRET"}});Object.assign(input.privileges,{password:"TOP_SECRET"});
  assert.doesNotMatch(JSON.stringify(preflight(input)),/TOP_SECRET/);
});
test("automatic artifact upgrade and unexpected reference fields are rejected",()=> {
  assert.equal(artifactMatches({...ARTIFACTS.flyway,automaticUpgrade:true} as never,ARTIFACTS.flyway),false);
  assert.equal(artifactMatches({...ARTIFACTS.flyway,reference:"latest"} as never,ARTIFACTS.flyway),false);
});
test("maximum receipt and manifest stay bounded",async()=> {
  const entries=Array.from({length:64},(_,i)=>({filename:`V${String(i+1).padStart(6,"0")}__fixture.sql`,sha256:"1".repeat(64)}));
  const pending=entries.map((_,i)=>String(i+1).padStart(6,"0"));const h=createRehearsal({pending});
  await h.session.start({...clone(),migrations:entries,approvedManifest:entries});await h.session.execute("VALIDATE");
  assert.equal(h.session.receipt().pendingVersions.length,64);assert.ok(Buffer.byteLength(JSON.stringify(h.session.receipt()))<4096);await h.session.cancel();
});
for(const outcome of ["ROLLED_BACK","COMMIT_UNKNOWN","UNKNOWN"] as const) test(`fake transactional failure ${outcome} never retries`,async()=> {
  const h=await waiting({failAt:"MIGRATE",failureOutcome:outcome});await h.session.authorize(h.approve());const r=await h.session.execute("MIGRATE");
  assert.equal(r.state,"FAILED");assert.equal(r.transactionOutcome,outcome);assert.equal(h.fixture.counts.migrate,1);assert.equal(h.fixture.counts.stops,1);await h.session.execute("MIGRATE");assert.equal(h.fixture.counts.migrate,1);
});
test("cancellation during migration reports unknown outcome and cleans once",async()=> {
  const h=await waiting({pauseAt:"MIGRATE"});await h.session.authorize(h.approve());const pending=h.session.execute("MIGRATE");await tick();await h.session.cancel();await pending;
  assert.equal(h.session.state(),"CANCELLED");assert.equal(h.session.receipt().transactionOutcome,"UNKNOWN");assert.equal(h.fixture.counts.stops,1);assert.equal(h.fixture.counts.postValidate,0);
});
test("shared in-memory lease models competing runners without automatic retry",async()=> {
  const lease=new SharedRehearsalLease();const first=await waiting({lease,pauseAt:"MIGRATE"});await first.session.authorize(first.approve());const active=first.session.execute("MIGRATE");await tick();
  const second=await waiting({lease});await second.session.authorize(second.approve());const denied=await second.session.execute("MIGRATE");assert.equal(denied.state,"FAILED");assert.equal(second.fixture.counts.stops,1);
  first.fixture.release();await active;assert.equal(first.session.state(),"COMPLETED");await second.session.execute("MIGRATE");assert.equal(second.fixture.counts.migrate,1);
  const third=await waiting({lease});await third.session.authorize(third.approve());assert.equal((await third.session.execute("MIGRATE")).state,"COMPLETED");
});
