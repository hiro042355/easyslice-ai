import type { DurableWorkflowTransactionContext } from "../durableTransaction";
import type { ManualRepairRecord, ManualRepairStore, ProtectedIdentity, ReconciliationOutboxRecord, ReconciliationOutboxStore, ReconciliationRequestRecord, ReconciliationRequestStore, StoreRecordResult } from "./types";

export type RequestTransitionAuthority=Readonly<{writerEpoch:string;expectedFence:string}>;
export type PostgreSQLReconciliationRequestTransitions=Readonly<{
  markRetryWait(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-request">,r:string,a:RequestTransitionAuthority):Promise<StoreRecordResult<ReconciliationRequestRecord>>;
  markResolved(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-request">,r:string,a:RequestTransitionAuthority,resolution:string):Promise<StoreRecordResult<ReconciliationRequestRecord>>;
  markStillUnknown(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-request">,r:string,a:RequestTransitionAuthority,escalation:"manual-repair"|"operator-review"):Promise<StoreRecordResult<ReconciliationRequestRecord>>;
  markCorrupted(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-request">,r:string,a:RequestTransitionAuthority):Promise<StoreRecordResult<ReconciliationRequestRecord>>;
  markManualRepairRequired(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-request">,r:string,a:RequestTransitionAuthority):Promise<StoreRecordResult<ReconciliationRequestRecord>>;
  markCancelled(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-request">,r:string,a:RequestTransitionAuthority):Promise<StoreRecordResult<ReconciliationRequestRecord>>;
}>;
export const createPostgreSQLReconciliationRequestTransitions=(store:ReconciliationRequestStore):PostgreSQLReconciliationRequestTransitions=>Object.freeze({
  markRetryWait:(c,i,r,a)=>store.transition(c,i,r,a,"retry-wait"),
  markResolved:(c,i,r,a,resolution)=>store.transition(c,i,r,a,"resolved",resolution),
  markStillUnknown:(c,i,r,a,escalation)=>store.transition(c,i,r,a,"still-unknown","still-unknown",escalation),
  markCorrupted:(c,i,r,a)=>store.transition(c,i,r,a,"corrupted","corrupted","manual-repair"),
  markManualRepairRequired:(c,i,r,a)=>store.transition(c,i,r,a,"manual-repair-required","manual-repair","manual-repair"),
  markCancelled:(c,i,r,a)=>store.transition(c,i,r,a,"cancelled","cancelled"),
});

export type PostgreSQLManualRepairTransitions=Readonly<{
  recordApproval(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
  markExecuting(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
  markReconciled(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
  markRejected(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
  markDeferred(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
  markTerminalSafeFailure(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
  markCancelled(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"manual-repair">,r:string,w:string,f:string):Promise<StoreRecordResult<ManualRepairRecord>>;
}>;
export const createPostgreSQLManualRepairTransitions=(store:ManualRepairStore):PostgreSQLManualRepairTransitions=>Object.freeze({recordApproval:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"authorized"),markExecuting:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"executing"),markReconciled:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"reconciled"),markRejected:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"rejected"),markDeferred:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"deferred"),markTerminalSafeFailure:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"terminal-safe-failure"),markCancelled:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,"cancelled")});

export type PostgreSQLReconciliationOutboxTransitions=Readonly<{markDelivered(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-outbox">,r:string,f:string):Promise<StoreRecordResult<ReconciliationOutboxRecord>>;markReconciliationRequired(c:DurableWorkflowTransactionContext,i:ProtectedIdentity<"reconciliation-outbox">,r:string,f:string,failure:string):Promise<StoreRecordResult<ReconciliationOutboxRecord>>}>;
export const createPostgreSQLReconciliationOutboxTransitions=(store:ReconciliationOutboxStore):PostgreSQLReconciliationOutboxTransitions=>Object.freeze({markDelivered:(c,i,r,f)=>store.transition(c,i,r,f,"delivered"),markReconciliationRequired:(c,i,r,f,failure)=>store.transition(c,i,r,f,"reconciliation-required",failure)});
