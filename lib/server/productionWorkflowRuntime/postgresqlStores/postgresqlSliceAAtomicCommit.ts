import type { DurableWorkflowTransactionContext } from "../durableTransaction";
import { durableTransactionFailure, durableTransactionSuccess } from "../durableTransaction";
import { bytesField, execute, stringField } from "./postgresqlStoreUtils";
import type { PostgreSQLFinalResultStoreV2, PostgreSQLOutboxStoreV2, PostgreSQLResultReferenceVaultV2, PostgreSQLSliceAAtomicCommitResult, PostgreSQLSliceAAtomicGroup, PostgreSQLSliceAUnknownLookupResult } from "./types";

export function createPostgreSQLSliceAAtomicCommit(stores:Readonly<{finalResults:PostgreSQLFinalResultStoreV2;references:PostgreSQLResultReferenceVaultV2;outbox:PostgreSQLOutboxStoreV2}>){return Object.freeze({
  async commit(context:DurableWorkflowTransactionContext,group:PostgreSQLSliceAAtomicGroup){
    const finalResult=await stores.finalResults.commitIfAbsent(context,group.finalResult);if(finalResult.status!=="created"&&finalResult.status!=="found")return durableTransactionFailure(finalResult.status==="unavailable"?"unavailable":"transaction-aborted");
    const reference=await stores.references.issueIfAbsent(context,finalResult.record.internalId,group.reference);if(reference.status!=="created"&&reference.status!=="found")return durableTransactionFailure(reference.status==="unavailable"?"unavailable":"transaction-aborted");
    const outbox=await stores.outbox.append(context,finalResult.record.internalId,group.outbox);if(outbox.status!=="appended"&&outbox.status!=="duplicate")return durableTransactionFailure(outbox.status==="unavailable"?"unavailable":"transaction-aborted");
    const replayed=finalResult.status==="found"&&reference.status==="found"&&outbox.status==="duplicate";
    return durableTransactionSuccess<PostgreSQLSliceAAtomicCommitResult>({status:replayed?"replayed":"committed",resultId:finalResult.record.internalId});
  },
  async lookup(context:DurableWorkflowTransactionContext,group:PostgreSQLSliceAAtomicGroup):Promise<PostgreSQLSliceAUnknownLookupResult>{
    const result=await execute(context.database,"slice-a.atomic.lookup",[group.finalResult.resultIdentity.bytes,group.reference.tokenIdentity.bytes,group.outbox.eventIdentity.bytes],"single");
    if(result.status!=="success"||result.rows.length!==1)return{status:result.status==="failure"?"unavailable":"corrupted"};
    const row=result.rows[0];const counts=[stringField(row,"result_count"),stringField(row,"reference_count"),stringField(row,"outbox_count")];
    if(counts.every((value)=>value==="1"))return{status:"committed"};if(counts.every((value)=>value==="0"))return{status:"not-committed"};return{status:"corrupted"};
  },
});}
