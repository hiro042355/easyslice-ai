import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceWorkflowApiFoundation} from '../../lib/server/workflowApi/referenceWorkflowApiFoundation';
import type {ReferenceWorkflowIntegrationRuntime} from '../../lib/workflowEntry/types';
import type {WorkflowApiPrincipal,WorkflowApiRequestContext,WorkflowApiServiceResult} from '../../lib/workflowApi/types';

const principal:WorkflowApiPrincipal={principalVersion:'1.0',actorType:'user',subjectRef:'synthetic-owner',tenantRef:'synthetic-tenant',region:'synthetic-region',permissions:['workflow:start','workflow:poll-upload','workflow:poll-generation','workflow:result','workflow:cancel']};
const context:WorkflowApiRequestContext={contextVersion:'1.0',baselineTime:'2030-01-01T00:00:00.000Z',requestRef:'synthetic-request',correlationRef:'synthetic-correlation',attempt:1};
function setup(){
 const calls={runtime:0,authorization:0};const forbidden=async():Promise<never>=>{calls.runtime++;throw Error('unexpected-runtime-call');};
 const runtime:ReferenceWorkflowIntegrationRuntime={runtimeVersion:'1.0',supportedOperations:['generate-vocal','generate-music','generate-mv'],startAccepted:forbidden,entryPoints:{pollUpload:forbidden,pollGeneration:forbidden,resume:forbidden,getResult:forbidden,cancel:forbidden}};
 const foundation=createReferenceWorkflowApiFoundation(runtime),project=foundation.authProjector.project;
 foundation.authProjector.project=input=>{calls.authorization++;return project(input);};
 return{...foundation,calls};
}
const requests={
 start:{requestVersion:'1.0',operation:'generate-vocal',workflowInput:{contractVersion:'1.0',operation:'generate-vocal'},idempotencyKey:'synthetic-start'},
 pollUpload:{requestVersion:'1.0',command:'poll-upload',pendingReference:{referenceVersion:'1.0',kind:'upload-pending',reference:'synthetic-upload'},idempotencyKey:'synthetic-poll'},
 pollGeneration:{requestVersion:'1.0',command:'poll-generation',generationReference:{referenceVersion:'1.0',kind:'generation-job',reference:'synthetic-generation'},idempotencyKey:'synthetic-generation'},
 queryResult:{requestVersion:'1.0',command:'result',reference:{referenceVersion:'1.0',kind:'workflow-result',reference:'synthetic-result'},idempotencyKey:'synthetic-result'},
 cancel:{requestVersion:'1.0',command:'cancel',reference:{referenceVersion:'1.0',kind:'workflow-result',reference:'synthetic-result'},idempotencyKey:'synthetic-cancel'},
};
for(const method of ['start','pollUpload','pollGeneration','queryResult','cancel']as const)for(const wrong of ['start','pollUpload','pollGeneration','queryResult','cancel']as const){
 if(method===wrong)continue;
 test(`method ${method} rejects validated but wrong ${wrong} command before authorization/runtime`,async()=>{
  const f=setup();
  // Deliberately exercise the untyped runtime boundary; production signatures remain strict.
  const result:WorkflowApiServiceResult=await Reflect.apply(f.service[method],f.service,[{request:requests[wrong],principal,context}]);
  assert.equal(result.status,'error');if(result.status!=='error')assert.fail('expected rejection');
  assert.equal(result.body.code,'request-invalid');assert.equal(result.http.statusCode,400);assert.deepEqual(f.calls,{runtime:0,authorization:0});
 });
}
for(const method of ['queryResult','cancel']as const)test(`${method} preserves same-owner terminal replay and rejects foreign ownership`,async()=>{
 const f=setup(),saved=f.referenceVault.commitTerminal('synthetic-terminal',{tenantRef:principal.tenantRef,region:principal.region,subjectRef:principal.subjectRef,operation:'generate-vocal',deletionState:'active',legalHold:false},reference=>({responseVersion:'1.0',status:'cancelled',operation:'generate-vocal',resultReference:reference}));
 if(saved.status==='conflict')assert.fail('fixture registration failed');
 const request={requestVersion:'1.0' as const,command:method==='queryResult'?'result' as const:'cancel' as const,reference:saved.reference,idempotencyKey:'synthetic-replay'};
 const result:WorkflowApiServiceResult=await Reflect.apply(f.service[method],f.service,[{request,principal,context}]);
 assert.equal(result.status,'success');if(result.status!=='success')assert.fail('expected terminal replay');assert.deepEqual(result.body,saved.result);
 const foreign:WorkflowApiServiceResult=await Reflect.apply(f.service[method],f.service,[{request,principal:{...principal,subjectRef:'foreign-owner'},context}]);
 assert.equal(foreign.status,'error');if(foreign.status!=='error')assert.fail('foreign owner must reject');assert.equal(foreign.body.code,'reference-unavailable');assert.equal(f.calls.runtime,0);
});
