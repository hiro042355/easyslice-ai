import type { DurableWorkflowDatabaseCapability, DurableWorkflowDatabaseRow } from "../durableTransaction";
import { bytesField, execute, stringField, validDigest, validUuid } from "./postgresqlStoreUtils";
import type { PostgreSQLInternalUuidGenerator, PostgreSQLProtectedDigest, PostgreSQLResultReferenceRecord, PostgreSQLResultReferenceResult, PostgreSQLResultReferenceVaultV2 } from "./types";

function parse(row: DurableWorkflowDatabaseRow): PostgreSQLResultReferenceRecord | undefined {
  const internalId=stringField(row,"reference_id"), resultId=stringField(row,"result_id"), token=bytesField(row,"token_digest"), owner=bytesField(row,"owner_digest"), tenant=bytesField(row,"tenant_digest");
  const kind=stringField(row,"reference_kind"), operation=stringField(row,"operation"), region=stringField(row,"region"), state=stringField(row,"reference_state"), revision=stringField(row,"revision"), expiresAt=stringField(row,"expires_at"), deletionState=stringField(row,"deletion_state"), legalHoldState=stringField(row,"legal_hold_state");
  if(!internalId||!resultId||!token||!owner||!tenant||!kind||!operation||!region||!state||!revision||!expiresAt||!deletionState||!legalHoldState||!validUuid(internalId)||!validUuid(resultId)) return undefined;
  return Object.freeze({internalId,resultId,tokenIdentity:Object.freeze({algorithm:"sha256",version:1,bytes:token}),ownerIdentity:Object.freeze({algorithm:"sha256",version:1,bytes:owner}),tenantIdentity:Object.freeze({algorithm:"sha256",version:1,bytes:tenant}),kind:kind as PostgreSQLResultReferenceRecord["kind"],operation:operation as PostgreSQLResultReferenceRecord["operation"],region,state:state as PostgreSQLResultReferenceRecord["state"],revision,expiresAt,deletionState:deletionState as PostgreSQLResultReferenceRecord["deletionState"],legalHoldState:legalHoldState as PostgreSQLResultReferenceRecord["legalHoldState"]});
}

async function resolve(database:DurableWorkflowDatabaseCapability, token:PostgreSQLProtectedDigest):Promise<PostgreSQLResultReferenceResult>{
  const result=await execute(database,"slice-a.reference.read",[token.bytes],"single");
  if(result.status==="not-found") return {status:"not-found"};
  if(result.status!=="success"||!result.rows[0]) return {status:result.status==="failure"?"unavailable":"corrupted"};
  const record=parse(result.rows[0]); return record?{status:"found",record}:{status:"corrupted"};
}

export function createPostgreSQLResultReferenceVault(generator:PostgreSQLInternalUuidGenerator):PostgreSQLResultReferenceVaultV2{
  const cas=async(context:import("../durableTransaction").DurableWorkflowTransactionContext,token:PostgreSQLProtectedDigest,expectedRevision:string,state:PostgreSQLResultReferenceRecord["state"],deletionState:PostgreSQLResultReferenceRecord["deletionState"]):Promise<PostgreSQLResultReferenceResult>=>{const result=await execute(context.database,"slice-a.reference.cas",[token.bytes,expectedRevision,state,deletionState],"single");if(result.status==="not-found")return{status:"conflict"};if(result.status!=="success"||!result.rows[0])return{status:result.status==="failure"?"unavailable":"corrupted"};const record=parse(result.rows[0]);return record?{status:"found",record}:{status:"corrupted"};};
  return Object.freeze({storeVersion:"2.0",async issueIfAbsent(context,resultId,draft){
    const id=generator.generate(); if(!validUuid(id)||!validUuid(resultId)||!validDigest(draft.tokenIdentity)||!validDigest(draft.ownerIdentity)||!validDigest(draft.tenantIdentity)) return {status:"corrupted"};
    const result=await execute(context.database,"slice-a.reference.insert",[id,draft.tokenIdentity.bytes,resultId,draft.kind,draft.operation,draft.ownerIdentity.bytes,draft.tenantIdentity.bytes,draft.region,draft.state,draft.revision,draft.expiresAt,draft.deletionState,draft.legalHoldState],"many");
    if(result.status==="success"&&result.rows.length===1)return{status:"created",record:Object.freeze({...draft,internalId:id,resultId})};
    if(result.status==="success"&&result.rows.length===0){const existing=await resolve(context.database,draft.tokenIdentity);if(existing.status!=="found")return existing;const same=existing.record.resultId===resultId&&existing.record.kind===draft.kind&&existing.record.operation===draft.operation&&existing.record.region===draft.region&&existing.record.state===draft.state&&existing.record.revision===draft.revision&&Date.parse(existing.record.expiresAt)===Date.parse(draft.expiresAt)&&existing.record.deletionState===draft.deletionState&&existing.record.legalHoldState===draft.legalHoldState&&Buffer.from(existing.record.ownerIdentity.bytes).equals(Buffer.from(draft.ownerIdentity.bytes))&&Buffer.from(existing.record.tenantIdentity.bytes).equals(Buffer.from(draft.tenantIdentity.bytes));return same?existing:{status:"conflict"};}
    return{status:result.status==="failure"?"unavailable":"corrupted"};
  },resolve:(session,token)=>resolve(session.database,token),resolveInTransaction:(context,token)=>resolve(context.database,token),compareAndSet:cas,revoke:(context,token,revision)=>cas(context,token,revision,"revoked","active"),expire:(context,token,revision)=>cas(context,token,revision,"expired","active"),delete:(context,token,revision)=>cas(context,token,revision,"deleted","deleted")});
}
