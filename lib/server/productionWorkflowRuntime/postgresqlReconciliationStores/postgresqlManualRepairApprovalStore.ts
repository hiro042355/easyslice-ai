import type { DurableWorkflowTransactionContext } from "../durableTransaction";
import { decodeRepair } from "./postgresqlReconciliationStores";
import { execute, sameDigest, validFingerprint, validIdentity } from "./postgresqlReconciliationStoreUtils";
import type { ManualRepairApprovalInput, ManualRepairApprovalStore, ManualRepairRecord, ManualRepairStore, StoreRecordResult } from "./types";

const highRiskReason=/^[a-z][a-z0-9-]{0,127}$/;
export function createPostgreSQLManualRepairApprovalStore(repairs:ManualRepairStore):ManualRepairApprovalStore{void repairs;return Object.freeze({storeVersion:"1.0",async recordApproval(context:DurableWorkflowTransactionContext,input:ManualRepairApprovalInput):Promise<StoreRecordResult<ManualRepairRecord>>{
  if(input.expectedPriorState!=="requested"||!validIdentity(input.repairIdentity,"manual-repair")||!validIdentity(input.requester,"operator-subject")||!validIdentity(input.approver,"operator-subject")||!validIdentity(input.approvalDecision,"approval-decision")||!validFingerprint(input.semanticFingerprint,"manual-repair-semantic")||input.authorizationPolicyVersion<1||!Number.isSafeInteger(input.authorizationPolicyVersion)||!highRiskReason.test(input.safeReasonCode)||sameDigest(input.requester.digest,input.approver.digest))return{status:"conflict"};
  const result=await execute(context.database,"reconciliation.repair.approve",[input.repairIdentity.algorithmVersion,input.repairIdentity.digest,input.expectedRevision,input.expectedPriorState,input.writerEpoch,input.fencingRevision,input.requester.digest,input.approver.digest,input.approver.algorithmVersion,input.approvalDecision.digest,input.approvalDecision.algorithmVersion,input.authorizationPolicyVersion,input.safeReasonCode,input.semanticFingerprint.algorithmVersion,input.semanticFingerprint.digest],"single");
  if(result.status==="success"&&result.rows[0]){const record=decodeRepair(result.rows[0]);return record?{status:"updated",record}:{status:"corrupted"};}
  if(result.status==="failure")return{status:"unavailable"};
  const authoritative=await execute(context.database,"reconciliation.repair.read",[input.repairIdentity.algorithmVersion,input.repairIdentity.digest],"single");
  if(authoritative.status==="failure")return{status:"unavailable"};
  if(authoritative.status!=="success"||!authoritative.rows[0])return{status:"conflict"};
  if(authoritative.rows[0].deletion_state!=="active")return{status:"terminal"};
  const existing=decodeRepair(authoritative.rows[0]);if(!existing)return{status:"corrupted"};
  if(existing.state==="authorized"&&existing.approver&&existing.approvalDecision&&sameDigest(existing.requester.digest,input.requester.digest)&&sameDigest(existing.approver.digest,input.approver.digest)&&sameDigest(existing.approvalDecision.digest,input.approvalDecision.digest)&&sameDigest(existing.fingerprint.digest,input.semanticFingerprint.digest))return{status:"replayed",record:existing};
  if(!sameDigest(existing.fingerprint.digest,input.semanticFingerprint.digest))return{status:"conflict"};
  if(["rejected","reconciled","deferred","terminal-safe-failure","cancelled"].includes(existing.state))return{status:"terminal"};
  if(existing.writerEpoch!==input.writerEpoch)return{status:"stale-writer"};if((existing.fencingRevision??"0")!==input.fencingRevision)return{status:"stale-fence"};if(existing.revision!==input.expectedRevision)return{status:"stale-revision"};return{status:"conflict"};
}});}
