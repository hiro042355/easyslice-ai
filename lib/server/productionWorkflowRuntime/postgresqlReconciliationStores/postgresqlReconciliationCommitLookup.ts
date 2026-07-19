import type { DurableWorkflowDatabaseCapability } from "../durableTransaction";
import { execute } from "./postgresqlReconciliationStoreUtils";
import type { ObservationDraft, ProtectedIdentity, ReconciliationCommitLookupResult, ReconciliationOutboxDraft, ResolutionDraft, SemanticFingerprint } from "./types";

export type ReconciliationCommitLookupInput=Readonly<{request:ProtectedIdentity<"reconciliation-request">;requestFingerprint:SemanticFingerprint<"reconciliation-request-semantic">;observation:ObservationDraft;resolution?:ResolutionDraft;outbox?:ReconciliationOutboxDraft}>;
export async function lookupPostgreSQLReconciliationCommit(database:DurableWorkflowDatabaseCapability,input:ReconciliationCommitLookupInput):Promise<ReconciliationCommitLookupResult>{
  const value=await execute(database,"reconciliation.commit.lookup",[input.request.digest,input.requestFingerprint.digest,input.observation.identity.digest,input.observation.fingerprint.digest,input.resolution?.identity.digest??null,input.resolution?.fingerprint.digest??null,input.outbox?.identity.digest??null,input.outbox?.fingerprint.digest??null],"single");
  if(value.status==="failure")return{status:"unavailable"};if(value.status!=="success"||value.rows.length!==1)return{status:"corrupted"};const row=value.rows[0]!,counts=[row.request_count,row.observation_count,row.resolution_count,row.outbox_count].map(Number);if(counts.some(count=>!Number.isSafeInteger(count)||count<0||count>1))return{status:"corrupted"};const required=[1,1,input.resolution?1:0,input.outbox?1:0];if(counts.every((count,index)=>count===required[index]))return{status:"committed"};if(counts.every(count=>count===0))return{status:"not-committed"};return{status:"corrupted"};
}
