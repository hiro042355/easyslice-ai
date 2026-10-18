import type {AssetRecord} from '@/lib/assets/types';
import type {ImportedAssetRegistry,DuplicateAssetLookup,AssetRegistryCreateResult,IngestionJournal,OutputIngestionResult,ProvenanceStore} from './types';
import {deepCopy} from './outputIngestionUtils';
type CreateInput=Parameters<ImportedAssetRegistry['create']>[0];
function createRecord(i:CreateInput):AssetRecord|undefined{
 const base={schemaVersion:'1.0',assetId:`[reference-imported-asset-${i.slotIndex+1}]`,mimeType:i.mimeType,sizeBytes:i.sizeBytes,checksum:i.checksum,storageLocator:{locatorVersion:'1.0',locatorId:i.locatorRef},status:i.availability,region:i.policy.destinationRegion,retentionClass:i.policy.retentionClass,integrityState:'verified'} satisfies Omit<AssetRecord,'kind'|'metadata'>;
 if(i.kind==='video')return {...base,kind:i.kind,metadata:{type:'video',durationSeconds:i.metadata.durationSeconds,width:i.metadata.width,height:i.metadata.height,codec:i.metadata.codec}};
 if(i.kind==='image'||i.kind==='character'||i.kind==='brand')return {...base,kind:i.kind,metadata:{type:'image',width:i.metadata.width,height:i.metadata.height}};
 if(i.kind==='audio'||i.kind==='voice'||i.kind==='melody')return {...base,kind:i.kind,metadata:{type:'audio',durationSeconds:i.metadata.durationSeconds,codec:i.metadata.codec}};
}
export class ReferenceRegistry implements ImportedAssetRegistry,DuplicateAssetLookup,IngestionJournal,ProvenanceStore{
 private records:AssetRecord[]=[];
 private journal=new Map<string,{fingerprint:string;result:OutputIngestionResult}>();
 async find(i:Parameters<DuplicateAssetLookup['find']>[0]){return deepCopy(this.records.find(r=>r.checksum===i.checksum&&r.sizeBytes===i.sizeBytes&&r.mimeType===i.mimeType&&r.region===i.policy.destinationRegion&&r.retentionClass===i.policy.retentionClass));}
 async create(i:CreateInput):Promise<AssetRegistryCreateResult>{
  if(i.locatorRef.includes('registry-failure'))return {status:'failed',error:{category:'registry-failed',retryable:true}};
  const record=createRecord(i);if(!record)return {status:'failed',error:{category:'registry-failed',retryable:false}};
  this.records.push(record);return {status:'created',record:deepCopy(record)};
 }
 async write(){return {status:'written' as const};}
 async get(k:string){return deepCopy(this.journal.get(k));}
 async put(k:string,v:{fingerprint:string;result:OutputIngestionResult}){this.journal.set(k,deepCopy(v));}
}
