import test from 'node:test';import assert from 'node:assert/strict';
import {ReferenceRegistry} from '../../lib/outputIngestion/referenceRegistry';
import type {ImportedAssetRegistry} from '../../lib/outputIngestion/types';
const input=(kind:Parameters<ImportedAssetRegistry['create']>[0]['kind']):Parameters<ImportedAssetRegistry['create']>[0]=>({slotIndex:0,kind,mimeType:kind==='video'?'video/mp4':['image','character','brand'].includes(kind)?'image/png':'audio/wav',sizeBytes:32,checksum:'sha256:fixture',metadata:{durationSeconds:2,width:16,height:16,codec:'fixture'},availability:'available',locatorRef:'opaque-fixture',policy:{policyVersion:'1.0',externalFetchAllowed:false,maximumDownloadBytes:32,requireHttps:true,redirectPolicy:'none',retentionClass:'project',sensitivityClass:'standard',scanRequired:true,metadataStrippingRequired:true,deletionPending:false}});
test('all seven registry asset kinds preserve the canonical metadata discriminant',async()=>{
 for(const kind of ['audio','voice','melody','image','character','brand','video'] as const){const registry=new ReferenceRegistry(),value=input(kind),result=await registry.create(value);assert.equal(result.status,'created');if(result.status!=='created')assert.fail('expected created');assert.equal(result.record.kind,kind);assert.equal(result.record.metadata.type,['image','character','brand'].includes(kind)?'image':kind==='video'?'video':'audio');result.record.status='deleted';const stored=await registry.find({checksum:value.checksum,sizeBytes:value.sizeBytes,mimeType:value.mimeType,policy:value.policy});assert.equal(stored?.status,'available');}
});
test('registry failure injection remains retryable while unknown runtime kinds fail closed',async()=>{
 const registry=new ReferenceRegistry();assert.deepEqual(await registry.create({...input('audio'),locatorRef:'registry-failure'}),{status:'failed',error:{category:'registry-failed',retryable:true}});
 assert.deepEqual(await Reflect.apply(registry.create,registry,[{...input('image'),kind:'foreign'}]),{status:'failed',error:{category:'registry-failed',retryable:false}});
});
