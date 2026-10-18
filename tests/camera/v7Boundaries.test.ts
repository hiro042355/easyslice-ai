import test from 'node:test';import assert from 'node:assert/strict';
import {createDevelopmentCastingStore} from '../../lib/server/characterEngine/developmentCasting';
import {executeMockOpenRouter,createMockUsageAccounting,type OpenRouterModel} from '../../lib/providerClients/openRouterFoundation';
test('scene assignment rejects foreign-project casting even when caller owns both projects',async()=>{
 const store=createDevelopmentCastingStore({authorizeProject:async owner=>owner==='owner-1',sceneBelongsToProject:async()=>true,lockedIdentity:async(characterId,revisionId)=>({ok:true,identity:{characterId,revisionId,ownerUserId:'owner-1',locked:true}})});
 const casting=await store.cast('owner-1','project-1','hero','hero-rev-1');await store.confirm('owner-1','project-1',casting.castingId);
 await assert.rejects(store.assign('owner-1','project-2','scene-2',casting.castingId,{}),/CONFIRMED_CASTING_REQUIRED/);assert.deepEqual(await store.listScenes('owner-1','project-2'),[]);
});
test('stale revision or missing service cannot authorize casting',async()=>{
 const stale=createDevelopmentCastingStore({authorizeProject:async()=>true,sceneBelongsToProject:async()=>true,lockedIdentity:async characterId=>({ok:true,identity:{characterId,revisionId:'other-revision',ownerUserId:'owner-1',locked:true}})});await assert.rejects(stale.cast('owner-1','project-1','hero','hero-rev-1'),/LOCK_AUTHORITY_REQUIRED/);
 const unavailable=createDevelopmentCastingStore({authorizeProject:async()=>true,sceneBelongsToProject:async()=>true,lockedIdentity:async()=>({ok:false,code:'UNAVAILABLE'})});await assert.rejects(unavailable.cast('owner-1','project-1','hero','hero-rev-1'),/LOCK_AUTHORITY_REQUIRED/);
});
test('OpenRouter invalid authorities and requests reject before any mock dispatch',async()=>{
 const model:OpenRouterModel={providerId:'openrouter',modelId:'fixture',displayName:'offline',capabilities:['text'],availability:'available',pricing:{currency:'USD',inputPerToken:.01,outputPerToken:.01},refreshedAt:'2026-10-18',authority:'MOCK'};
 const config={enabled:true,authorizedForMock:true,apiKeyPresent:true,budgetUsd:1},request={requestId:'unique',modelId:'fixture',capability:'text' as const,inputTokens:1,maxOutputTokens:1};let calls=0;
 const cases=[{config:{...config,enabled:false},request,models:[model]},{config:{...config,apiKeyPresent:false},request,models:[model]},{config:{...config,budgetUsd:null},request,models:[model]},{config,request:{...request,requestId:'invalid/id'},models:[model]},{config,request:{...request,inputTokens:-1},models:[model]},{config,request,models:[{...model,pricing:null}]},{config,request,models:[model,model]},{config,request:{...request,capability:'video' as const},models:[model]}];
 for(const c of cases){const result=await executeMockOpenRouter(c.config,c.models,c.request,createMockUsageAccounting(1),{mode:'OFFLINE_MOCK',execute:async()=>{calls++;throw Error('forbidden');}});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.error.retryable,false);}assert.equal(calls,0);
});
