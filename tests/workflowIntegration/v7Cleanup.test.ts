import test from 'node:test';import assert from 'node:assert/strict';
import {createReferenceAcceptedPersistenceCoordinator,createReferenceAcceptedPersistenceDependencies} from '../../lib/acceptedPersistence/referenceAcceptedPersistenceCoordinator';
import type {PendingUploadAcceptedPersistenceInput} from '../../lib/acceptedPersistence/types';import type {Sensitive} from '../../lib/assets/types';
type FixtureData<T> = T extends Sensitive<string> ? string : T extends readonly (infer Item)[] ? readonly FixtureData<Item>[] : T extends object ? { [Key in keyof T as Key extends symbol ? never : Key]: FixtureData<T[Key]> } : T;
// Synthetic confidentiality markers only; not a production authority constructor.
const fixture=<T>(value:FixtureData<T>):T=>structuredClone(value) as T;
function input():PendingUploadAcceptedPersistenceInput{
 const common={operation:'generate-vocal' as const,tenantRef:'tenant',region:'region'},expiresAt='2031-01-01T00:00:00.000Z';
 return fixture<PendingUploadAcceptedPersistenceInput>({contractVersion:'1.0',acceptanceIdempotencyKey:'cleanup-proof',gateState:{stateVersion:'2.0',planFingerprint:'plan',providerId:'reference-provider',providerApiVersion:'reference-api-v1',operation:'generate-vocal',items:[],attempt:1},workflowResumeSeed:{seedVersion:'1.0',workflowSchemaVersion:'1.0',workflowEngineVersion:'1.0',...common,providerId:'reference-provider',providerApiVersion:'reference-api-v1',materializerBindingId:'materializer',generationClientBindingId:'client',outputIngestionBindingId:'ingestion',originalInputRecordRef:'original',restrictedAdapterRequestRef:'adapter',adapterOutputFingerprint:'schema',gatePlanFingerprint:'plan'},originalInputRecord:{recordVersion:'1.0',...common,contentKind:'vocal',encryptedPayloadRef:'original',schemaFingerprint:'schema',expiresAt},adapterRequestRecord:{recordVersion:'1.0',...common,adapterId:'adapter',adapterVersion:'1.0',requestSchemaVersion:'1.0',encryptedRequestRef:'adapter',requestFingerprint:'schema',expiresAt},policy:{policyVersion:'1.0',referenceExpiresAt:expiresAt,pendingStateExpiresAt:expiresAt,resumeRecordExpiresAt:expiresAt,journalExpiresAt:expiresAt,region:'region'},context:{contextVersion:'1.0',baselineTime:'2030-01-01T00:00:00.000Z',attempt:1,operationRef:'cleanup-operation'},authorization:{authorizationVersion:'1.0',...common,actorType:'internal-workflow-service',permission:'persist-accepted-upload',workflowOwnershipVerified:true,deletionState:'active',legalHold:false}});
}
const cases=[['journal-write-failed',['reference']],['pending-state-write-failed',['reference']],['input-record-write-failed',['pending','reference']],['adapter-record-write-failed',['input','pending','reference']],['resume-record-write-failed',['adapter','input','pending','reference']],['cross-record-mismatch',['resume','adapter','input','pending','reference']]] as const;
for(const [scenario,expected] of cases)test('accepted persistence early cleanup order: '+scenario,async()=>{
 const deps=createReferenceAcceptedPersistenceDependencies(),log:string[]=[];
 const ref=deps.referenceStore.delete.bind(deps.referenceStore);deps.referenceStore.delete=async key=>{log.push('reference');return ref(key);};
 const pending=deps.pendingStore.delete.bind(deps.pendingStore);deps.pendingStore.delete=async key=>{log.push('pending');return pending(key);};
 const original=deps.inputStore.delete.bind(deps.inputStore);deps.inputStore.delete=async key=>{log.push('input');return original(key);};
 const adapter=deps.adapterStore.delete.bind(deps.adapterStore);deps.adapterStore.delete=async key=>{log.push('adapter');return adapter(key);};
 const resume=deps.resumeStore.delete.bind(deps.resumeStore);deps.resumeStore.delete=async key=>{log.push('resume');return resume(key);};
 const result=await createReferenceAcceptedPersistenceCoordinator(deps,scenario).persistAcceptedUpload(input());assert.equal(result.status,'failed');assert.equal(result.audit.rollbackRequired,true);assert.deepEqual(log,expected);
});
