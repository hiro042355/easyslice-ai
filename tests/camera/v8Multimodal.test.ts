import test from 'node:test';import assert from 'node:assert/strict';
import {planMockMultimodal,type MockModalityModel,type MultimodalRequest} from '../../lib/providerClients/openRouterMultimodal';
import {executeMockOpenRouter,createMockUsageAccounting,type OpenRouterModel} from '../../lib/providerClients/openRouterFoundation';
const model=(kind:'text'|'image'|'video'):MockModalityModel=>({authority:'MOCK',modelId:'offline-'+kind,outputModalities:[kind],quote:{authority:'COMPLETE_MOCK_QUOTE',inputCostUpperBoundUsd:.01,outputUnitUsd:.02,unit:kind==='text'?'token':kind==='image'?'image':'second'},supportedDurations:[5,10],supportedResolutions:['720p'],supportedAspectRatios:['16:9']});
const request:MultimodalRequest={kind:'video',requestId:'local-test',modelId:'offline-video',durationSeconds:5,resolution:'720p',aspectRatio:'16:9'};
test('offline modality routing distinguishes token/image/second quote units and asynchronous video',()=>{
 const requests:MultimodalRequest[]=[{kind:'text',requestId:'text',modelId:'offline-text',maxOutputTokens:2},{kind:'image',requestId:'image',modelId:'offline-image',count:2,resolution:'720p',aspectRatio:'16:9'},request];
 for(const req of requests){const plan=planMockMultimodal([model(req.kind)],req,1);assert.equal(plan.realExecutionAllowed,false);assert.equal(plan.authority,'MOCK');assert.equal(plan.execution,req.kind==='video'?'asynchronous-job':'synchronous');assert.equal(plan.estimatedUpperBoundUsd,.01+(req.kind==='video'?5:2)*.02);assert.ok(Object.isFrozen(plan.request));}
});
test('unknown output modalities, missing prices, token-priced media and unverified model parameters fail closed',()=>{
 const m=model('video');
 for(const [catalog,req,budget]of [
  [[],request,1],[[m,m],request,1],[[{...m,outputModalities:['text']}],request,1],[[{...m,quote:null}],request,1],
  [[{...m,quote:{...m.quote!,unit:'token'}}],request,1],[[m],{...request,durationSeconds:3},1],[[m],{...request,resolution:'unlisted'},1],[[m],{...request,aspectRatio:'9:16'},1],[[m],request,0],[[m],request,.01],[[m],{...request,requestId:'bad/id'},1],
 ] as readonly [readonly MockModalityModel[],MultimodalRequest,number][]){assert.throws(()=>planMockMultimodal(catalog,req,budget));}
});
test('legacy text executor never dispatches image/video even when a mock catalog advertises them',async()=>{
 let calls=0;
 for(const capability of ['image','video']as const){const m:OpenRouterModel={providerId:'openrouter',modelId:'fixture',displayName:'offline',availability:'available',capabilities:[capability],pricing:{currency:'USD',inputPerToken:0,outputPerToken:0},refreshedAt:'2026-10-19',authority:'MOCK'};
 const result=await executeMockOpenRouter({enabled:true,apiKeyPresent:true,authorizedForMock:true,budgetUsd:1},[m],{requestId:capability,modelId:'fixture',capability,inputTokens:1,maxOutputTokens:1},createMockUsageAccounting(1),{mode:'OFFLINE_MOCK',execute:async()=>{calls++;throw Error('forbidden');}});
 assert.equal(result.ok,false);if(!result.ok)assert.equal(result.error.safeCode,'UNSUPPORTED_CAPABILITY');}assert.equal(calls,0);
});

test('catalog-listed zero and negative video durations cannot create negative or free cost reservations',()=>{
 const m={...model('video'),supportedDurations:[-5,0,5]};
 for(const durationSeconds of [-5,0])assert.throws(()=>planMockMultimodal([m],{...request,durationSeconds},1),/INVALID_VIDEO_PARAMETERS/);
 assert.equal(planMockMultimodal([m],request,1).estimatedUpperBoundUsd,.11);
});
