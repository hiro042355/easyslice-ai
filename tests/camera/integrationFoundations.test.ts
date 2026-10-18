import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterReadClient} from '../../lib/server/characterEngine/clientCore';
import {assessOpenRouterRequest,readOpenRouterConfig,executeMockOpenRouter,createMockUsageAccounting,type OpenRouterModel} from '../../lib/providerClients/openRouterFoundation';
import {createMockOpenRouterCatalog} from '../../lib/providerClients/openRouterCatalog';

const config={enabled:true,baseUrl:'https://character.example.com/api/v1',allowedOrigin:'https://character.example.com',bearerToken:'offline-fixture-not-a-credential',timeoutMs:30};
const bible={movementStyle:'still',...Object.fromEntries(['identityTraits','faceCharacteristics','hairCharacteristics','eyeCharacteristics','bodyCharacteristics','personality','clothing','accessories','colorPalette','expressionRules','identityConstraints','forbiddenChanges','referenceAssetIds'].map(k=>[k,[]]))};
const revision={id:'hero-rev-1',characterId:'hero',status:'LOCKED',identity:{characterId:'hero',bible}};
const character={id:'hero',ownerUserId:'owner-1',revisions:[revision],identityLock:{characterId:'hero',revisionId:'hero-rev-1',status:'LOCKED',lockedRevision:revision}};
test('Character client disabled by default configuration performs no transport',async()=>{
 const c=createCharacterReadClient({enabled:false},async()=>{throw Error('must not call');});assert.deepEqual(await c.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'DISABLED'});
});
test('Character locked revision projection uses official opaque IDs and authenticated GET',async()=>{
 let count=0;const c=createCharacterReadClient(config,async(url,init)=>{count++;assert.equal(url.pathname,'/api/v1/characters/hero');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');return Response.json({ok:true,character});});
 assert.deepEqual(await c.lockedIdentity('hero','hero-rev-1'),{ok:true,identity:{characterId:'hero',revisionId:'hero-rev-1',ownerUserId:'owner-1',locked:true}});assert.equal(count,1);
});
test('Character rejects absent lock, mismatched revision, character and malformed response',async()=>{
 for(const raw of [{ok:true,character:{...character,identityLock:undefined}},{ok:true,character:{...character,id:'other'}},{ok:true,character:{...character,identityLock:{...character.identityLock,revisionId:'other'}}},{ok:true,character:{...character,revisions:[]}},{}]){
  const c=createCharacterReadClient(config,async()=>Response.json(raw));assert.deepEqual(await c.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'MALFORMED_RESPONSE'});
 }
});
test('Character rejects approved-but-not-locked and duplicate revision authority',async()=>{
 for(const c of [{...character,identityLock:{...character.identityLock,lockedRevision:{...revision,status:'APPROVED'}}},{...character,revisions:[revision,revision]}]){
  assert.deepEqual(await createCharacterReadClient(config,async()=>Response.json({ok:true,character:c})).lockedIdentity('hero','hero-rev-1'),{ok:false,code:'MALFORMED_RESPONSE'});
 }
});
test('Character body timeout cancels stalled stream and oversized body is rejected',async()=>{
 let cancelled=false;const stalled=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
 const c=createCharacterReadClient(config,async()=>new Response(stalled,{headers:{'content-type':'application/json'}}));
 assert.deepEqual(await c.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'TIMEOUT'});assert.equal(cancelled,true);
 const big=createCharacterReadClient(config,async()=>new Response('x'.repeat(262145),{headers:{'content-type':'application/json'}}));assert.deepEqual(await big.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'MALFORMED_RESPONSE'});
});
test('Character SSRF/path traversal and invalid configuration denied before dispatch',async()=>{
 for(const baseUrl of ['http://localhost/api/v1','https://127.0.0.1/api/v1','https://evil.example/api/v1','https://character.example.com/api/v1?x=1']){
  const c=createCharacterReadClient({...config,baseUrl},async()=>{throw Error('unexpected');});assert.deepEqual(await c.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'CONFIGURATION'});
 }
 assert.deepEqual(await createCharacterReadClient(config).lockedIdentity('../secret','rev'),{ok:false,code:'INVALID_ID'});
});
test('Character timeout, unavailable and unauthorized have bounded secret-safe errors and no retry',async()=>{
 const timeout=createCharacterReadClient(config,async()=>new Promise(()=>{}));assert.deepEqual(await timeout.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'TIMEOUT'});
 let calls=0;const failed=createCharacterReadClient(config,async()=>{calls++;throw Error('sensitive transport data');});assert.deepEqual(await failed.lockedIdentity('hero','hero-rev-1'),{ok:false,code:'UNAVAILABLE'});assert.equal(calls,1);
 assert.deepEqual(await createCharacterReadClient(config,async()=>Response.json({}, {status:403})).lockedIdentity('hero','hero-rev-1'),{ok:false,code:'UNAUTHORIZED'});
});
const model:OpenRouterModel={providerId:'openrouter',modelId:'fixture-only/not-a-real-model',displayName:'Offline fixture',capabilities:['text'],availability:'available',pricing:{currency:'USD',inputPerToken:.001,outputPerToken:.002},refreshedAt:'2026-10-18T00:00:00Z',authority:'MOCK'};
const request={modelId:model.modelId,capability:'text' as const,inputTokens:10,maxOutputTokens:10};
const enabled={enabled:true,apiKeyPresent:true,budgetUsd:1};
test('OpenRouter defaults disabled and missing/unknown authorities deny',()=>{
 assert.deepEqual(readOpenRouterConfig({}),{enabled:false,apiKeyPresent:false,budgetUsd:null});
 for(const [cfg,catalog,req,expected] of [
  [{...enabled,enabled:false},[model],request,'DISABLED'],[{...enabled,apiKeyPresent:false},[model],request,'MISSING_KEY'],[{...enabled,budgetUsd:null},[model],request,'MISSING_BUDGET'],
  [enabled,[],request,'UNKNOWN_MODEL'],[enabled,[model],{...request,capability:'video'},'UNSUPPORTED_CAPABILITY'],[enabled,[{...model,pricing:null}],request,'UNKNOWN_PRICE'],[{...enabled,budgetUsd:.001},[model],request,'BUDGET_EXCEEDED'],
 ] as const)assert.deepEqual(assessOpenRouterRequest(cfg,catalog,req),{ok:false,code:expected});
});
test('OpenRouter mock separates reserved estimate from actual; errors never leak and never retry',async()=>{
 const records:string[]=[];const accounting={reserve:()=>{records.push('ESTIMATE');return true;},record:()=>{records.push('ACTUAL');}};
 const result=await executeMockOpenRouter(enabled,[model],request,accounting,{mode:'OFFLINE_MOCK',execute:async()=>({text:'offline text',inputTokens:8,outputTokens:5})});assert.equal(result.ok,true);assert.deepEqual(records,['ESTIMATE','ACTUAL']);
 let calls=0;const failure=await executeMockOpenRouter(enabled,[model],request,accounting,{mode:'OFFLINE_MOCK',execute:async()=>{calls++;throw Error('secret');}});assert.deepEqual(failure,{ok:false,error:{category:'unknown',retryable:false,safeCode:'MOCK_EXECUTION_FAILED'}});assert.equal(calls,1);
});
test('model discovery mock snapshots metadata and preserves unknown pricing',()=>{
 const input=structuredClone({...model,pricing:null});const catalog=createMockOpenRouterCatalog([input]);assert.equal(catalog[0].pricing,null);assert.equal(Object.isFrozen(catalog[0].capabilities),true);
 input.displayName='changed';assert.equal(catalog[0].displayName,'Offline fixture');
 assert.throws(()=>createMockOpenRouterCatalog([model,model]));assert.throws(()=>createMockOpenRouterCatalog([{...model,authority:'LIVE'}]));assert.throws(()=>createMockOpenRouterCatalog([{...model,pricing:undefined}]));
});
test('OpenRouter stalled/mock malformed response fail closed without retry',async()=>{
 const accounting=createMockUsageAccounting(1);let calls=0;
 const timed=await executeMockOpenRouter({...enabled,timeoutMs:10},[model],request,accounting,{mode:'OFFLINE_MOCK',execute:async()=>{calls++;return new Promise(()=>{});}});
 assert.deepEqual(timed,{ok:false,error:{category:'timeout',retryable:false,safeCode:'MOCK_TIMEOUT'}});assert.equal(calls,1);
 for(const value of [null,{}, {text:'safe',inputTokens:0,outputTokens:1000000}]){
  const result=await executeMockOpenRouter(enabled,[model],request,accounting,{mode:'OFFLINE_MOCK',execute:async()=>value});assert.deepEqual(result,{ok:false,error:{category:'malformed-response',retryable:false,safeCode:'MALFORMED_RESPONSE'}});
 }
});
test('mock budget reservations prevent concurrent aggregate overspend and retain unknown reservations',async()=>{
 const budget=.04,accounting=createMockUsageAccounting(budget);let calls=0;
 const run=()=>executeMockOpenRouter({...enabled,budgetUsd:budget,timeoutMs:10},[model],request,accounting,{mode:'OFFLINE_MOCK',execute:async()=>{calls++;return new Promise(()=>{});}});
 const results=await Promise.all([run(),run()]);assert.equal(calls,1);assert.ok(results.some(r=>!r.ok&&r.error.safeCode==='BUDGET_EXCEEDED'));
 assert.deepEqual(await run(),{ok:false,error:{category:'invalid-request',retryable:false,safeCode:'BUDGET_EXCEEDED'}});
});
