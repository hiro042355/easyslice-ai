import assert from "node:assert/strict";
import test from "node:test";
import {createPostgreSQLReconciliationReadSession,lookupPostgreSQLReconciliationCommit} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {DurableWorkflowDatabaseCapability,DurableWorkflowDatabaseExecutionResult} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type {ObservationDraft,ProtectedIdentity,ReconciliationCommitLookupInput,ReconciliationDigestDomain,ReconciliationFingerprintDomain,SemanticFingerprint} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";

const identity=<D extends ReconciliationDigestDomain>(domain:D,seed:number):ProtectedIdentity<D>=>Object.freeze({domain,algorithm:"hmac-sha256",algorithmVersion:1,digest:new Uint8Array(32).fill(seed)});
const fingerprint=<D extends ReconciliationFingerprintDomain>(domain:D,seed:number):SemanticFingerprint<D>=>Object.freeze({domain,algorithm:"hmac-sha256",algorithmVersion:1,digest:new Uint8Array(32).fill(seed)});
const observation:ObservationDraft=Object.freeze({requestId:"10000000-0000-4000-8000-000000000001",identity:identity("observation",2),tenant:identity("tenant",3),fingerprint:fingerprint("observation-semantic",4),sequence:"1",source:"slice-a-store",result:"committed",evidence:"authoritative-summary",attempt:1,observedAt:"2020-01-01T00:00:00.000Z",payload:Object.freeze({status:"committed"})});
const input:ReconciliationCommitLookupInput=Object.freeze({request:identity("reconciliation-request",1),requestFingerprint:fingerprint("reconciliation-request-semantic",5),observation});
const database=(result:DurableWorkflowDatabaseExecutionResult):DurableWorkflowDatabaseCapability=>Object.freeze({capabilityVersion:"1.0",execute:async()=>result});

test("commit unknown lookup exhaustively classifies committed, not-committed, corrupted and unavailable",async()=>{
  const row=(request:number,observed:number,resolution:number,outbox:number)=>Object.freeze({status:"success" as const,rowCount:1,rows:Object.freeze([Object.freeze({request_count:request,observation_count:observed,resolution_count:resolution,outbox_count:outbox})])});
  assert.deepEqual(await lookupPostgreSQLReconciliationCommit(database(row(1,1,0,0)),input),{status:"committed"});
  assert.deepEqual(await lookupPostgreSQLReconciliationCommit(database(row(0,0,0,0)),input),{status:"not-committed"});
  assert.deepEqual(await lookupPostgreSQLReconciliationCommit(database(row(1,0,0,0)),input),{status:"corrupted"});
  assert.deepEqual(await lookupPostgreSQLReconciliationCommit(database(row(2,1,0,0)),input),{status:"corrupted"});
  assert.deepEqual(await lookupPostgreSQLReconciliationCommit(database({status:"failure",failure:"unavailable",retryable:true}),input),{status:"unavailable"});
});

test("read session is mutation isolated, expires once, and rejects late reads",async()=>{let calls=0,releases=0;const capability:DurableWorkflowDatabaseCapability=Object.freeze({capabilityVersion:"1.0",execute:async()=>{calls++;return{status:"not-found" as const};}});const owned=createPostgreSQLReconciliationReadSession(capability,()=>{releases++;});assert.equal(owned.state(),"active");assert.deepEqual(await owned.session.database.execute({commandVersion:"1.0",statementId:"safe",parameters:Object.freeze([]),expectedResult:"single"}),{status:"not-found"});assert.equal(await owned.release(),"released");assert.equal(await owned.release(),"already-released");assert.equal(owned.state(),"closed");assert.deepEqual(await owned.session.database.execute({commandVersion:"1.0",statementId:"safe",parameters:Object.freeze([]),expectedResult:"single"}),{status:"failure",failure:"transaction-aborted",retryable:false});assert.equal(calls,1);assert.equal(releases,1);});

test("read session release failure closes once, rejects late reads, and exposes no raw failure",async()=>{let calls=0,releases=0;const capability:DurableWorkflowDatabaseCapability=Object.freeze({capabilityVersion:"1.0",execute:async()=>{calls++;return{status:"not-found" as const};}});const owned=createPostgreSQLReconciliationReadSession(capability,()=>{releases++;throw new Error("private-release-failure");});assert.equal(await owned.release(),"release-failed");assert.equal(owned.state(),"closed");assert.equal(await owned.release(),"already-released");assert.deepEqual(await owned.session.database.execute({commandVersion:"1.0",statementId:"safe",parameters:Object.freeze([]),expectedResult:"single"}),{status:"failure",failure:"transaction-aborted",retryable:false});assert.equal(calls,0);assert.equal(releases,1);});

test("synthetic corruption matrix rejects partial, duplicate and impossible authoritative snapshots",async()=>{const fixtures=Object.freeze([[1,0,0,0],[0,1,0,0],[1,2,0,0],[2,2,0,0],[-1,0,0,0]] as const);for(const values of fixtures){const result={status:"success" as const,rowCount:1,rows:Object.freeze([Object.freeze({request_count:values[0],observation_count:values[1],resolution_count:values[2],outbox_count:values[3]})])};assert.deepEqual(await lookupPostgreSQLReconciliationCommit(database(result),input),{status:"corrupted"});}});
