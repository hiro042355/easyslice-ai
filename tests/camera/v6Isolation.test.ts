import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterReadClient} from '../../lib/server/characterEngine/clientCore';
import {createDevelopmentCastingStore} from '../../lib/server/characterEngine/developmentCasting';
import {createMockUsageAccounting,executeMockOpenRouter,type OpenRouterModel} from '../../lib/providerClients/openRouterFoundation';

const config={enabled:true,apiKeyPresent:true,budgetUsd:1,authorizedForMock:true,timeoutMs:30};
const model:OpenRouterModel={providerId:'openrouter',modelId:'offline',displayName:'fixture',capabilities:['text'],availability:'available',pricing:{currency:'USD',inputPerToken:.01,outputPerToken:.01},refreshedAt:'2026-10-18',authority:'MOCK'};
const request={requestId:'unique-operation',modelId:'offline',capability:'text' as const,inputTokens:1,maxOutputTokens:1};

test('production direct invocation cannot activate unresolved Character or mock inference',async()=>{
 const previous=process.env.NODE_ENV;assert.equal(Reflect.set(process.env,'NODE_ENV','production'),true);let calls=0;
 try{
  assert.deepEqual(await createCharacterReadClient({enabled:true},async()=>{calls++;throw Error('forbidden');}).lockedIdentity('hero','revision'),{ok:false,code:'DISABLED'});
  assert.throws(()=>createDevelopmentCastingStore({authorizeProject:async()=>true,sceneBelongsToProject:async()=>true,lockedIdentity:async()=>({ok:false,code:'DISABLED'})}),/DEVELOPMENT_ONLY/);
  const result=await executeMockOpenRouter(config,[model],request,createMockUsageAccounting(1),{mode:'OFFLINE_MOCK',execute:async()=>{calls++;return {};}});
  assert.equal(result.ok,false);assert.equal(calls,0);
 }finally{if(previous===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Reflect.set(process.env,'NODE_ENV',previous);}
});

test('mock authorization, duplicate claims and cancellation fail closed without retry',async()=>{
 let calls=0;const transport={mode:'OFFLINE_MOCK' as const,execute:async()=>{calls++;return {text:'safe',inputTokens:1,outputTokens:1};}};
 const accounting=createMockUsageAccounting(1);
 assert.deepEqual(await executeMockOpenRouter({...config,authorizedForMock:false},[model],request,accounting,transport),{ok:false,error:{category:'invalid-request',retryable:false,safeCode:'MISSING_AUTHORIZATION'}});
 const results=await Promise.all([executeMockOpenRouter(config,[model],request,accounting,transport),executeMockOpenRouter(config,[model],request,accounting,transport)]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.ok).length,1);assert.ok(results.some(r=>!r.ok&&r.error.safeCode==='DUPLICATE_REQUEST'));
 const abort=new AbortController();let cancelled=false;const pending=executeMockOpenRouter(config,[model],{...request,requestId:'cancelled'},accounting,{mode:'OFFLINE_MOCK',execute:async(_request,signal)=>{calls++;signal.addEventListener('abort',()=>{cancelled=true;},{once:true});return new Promise(()=>{});}},abort.signal);
 abort.abort();assert.deepEqual(await pending,{ok:false,error:{category:'invalid-request',retryable:false,safeCode:'MOCK_CANCELLED'}});assert.equal(cancelled,true);
 assert.deepEqual(await executeMockOpenRouter(config,[model],{...request,requestId:'cancelled'},accounting,transport),{ok:false,error:{category:'invalid-request',retryable:false,safeCode:'DUPLICATE_REQUEST'}});assert.equal(calls,2);
});
