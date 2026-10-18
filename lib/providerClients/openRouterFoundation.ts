import type {NormalizedProviderClientError} from './types';

/** Offline foundation only. No fetch, endpoint or credentials are persisted. */
export type OpenRouterModel=Readonly<{providerId:'openrouter';modelId:string;displayName:string;capabilities:readonly ('text'|'image'|'video'|'audio')[];availability:'available'|'unavailable';pricing:Readonly<{currency:'USD';inputPerToken:number;outputPerToken:number}>|null;refreshedAt:string;authority:'MOCK'}>;
export type OpenRouterConfig=Readonly<{enabled:boolean;apiKeyPresent:boolean;budgetUsd:number|null;timeoutMs?:number}>;
export type OpenRouterRequest=Readonly<{modelId:string;capability:'text'|'image'|'video'|'audio';inputTokens:number;maxOutputTokens:number}>;
export type UsageRecord=Readonly<{kind:'ESTIMATE'|'ACTUAL';usd:number;inputTokens:number;outputTokens:number;authority:'MOCK'}>;
export type UsageAccounting={reserve(estimate:UsageRecord,budgetUsd:number):boolean;record(actual:UsageRecord):void};
export function readOpenRouterConfig(env:Readonly<Record<string,string|undefined>>):OpenRouterConfig{
 const raw=env.OPENROUTER_BUDGET_USD;const n=raw&&raw.trim()?Number(raw):NaN;
 return Object.freeze({enabled:env.OPENROUTER_ENABLED==='true',apiKeyPresent:!!env.OPENROUTER_API_KEY?.trim(),budgetUsd:Number.isFinite(n)&&n>0?n:null});
}
const finiteNonNegative=(n:number)=>Number.isFinite(n)&&n>=0;
export function assessOpenRouterRequest(config:OpenRouterConfig,catalog:readonly OpenRouterModel[],request:OpenRouterRequest){
 if(!config.enabled)return {ok:false as const,code:'DISABLED'};
 if(!config.apiKeyPresent)return {ok:false as const,code:'MISSING_KEY'};
 if(config.budgetUsd===null||!Number.isFinite(config.budgetUsd)||config.budgetUsd<=0)return {ok:false as const,code:'MISSING_BUDGET'};
 const matches=catalog.filter(m=>m.modelId===request.modelId);if(matches.length!==1)return {ok:false as const,code:'UNKNOWN_MODEL'};
 const model=matches[0];if(model.availability!=='available'||!model.capabilities.includes(request.capability))return {ok:false as const,code:'UNSUPPORTED_CAPABILITY'};
 if(![request.inputTokens,request.maxOutputTokens].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000)||request.maxOutputTokens===0)return {ok:false as const,code:'INVALID_REQUEST'};
 if(!model.pricing||model.pricing.currency!=='USD'||![model.pricing.inputPerToken,model.pricing.outputPerToken].every(finiteNonNegative))return {ok:false as const,code:'UNKNOWN_PRICE'};
 const usd=request.inputTokens*model.pricing.inputPerToken+request.maxOutputTokens*model.pricing.outputPerToken;
 if(!Number.isFinite(usd)||usd>config.budgetUsd)return {ok:false as const,code:'BUDGET_EXCEEDED'};
 return {ok:true as const,estimate:Object.freeze({kind:'ESTIMATE' as const,usd,inputTokens:request.inputTokens,outputTokens:request.maxOutputTokens,authority:'MOCK' as const})};
}
export type MockOpenRouterTransport={readonly mode:'OFFLINE_MOCK';execute(request:OpenRouterRequest):Promise<unknown>};
export async function executeMockOpenRouter(config:OpenRouterConfig,catalog:readonly OpenRouterModel[],request:OpenRouterRequest,accounting:UsageAccounting,transport:MockOpenRouterTransport):Promise<{ok:true;text:string;actual:UsageRecord}|{ok:false;error:NormalizedProviderClientError}>{
 const fail=(category:NormalizedProviderClientError['category'],safeCode:string)=>({ok:false as const,error:{category,retryable:false,safeCode}});
 const gate=assessOpenRouterRequest(config,catalog,request);if(!gate.ok)return fail('invalid-request',gate.code);
 if(transport.mode!=='OFFLINE_MOCK')return fail('unsupported','LIVE_INFERENCE_FORBIDDEN');
 const selected=catalog.find(m=>m.modelId===request.modelId);
 if(!selected?.pricing)return fail('invalid-request','UNKNOWN_PRICE');
 const price={...selected.pricing};
 const boundedRequest=Object.freeze({...request});
 const budget=config.budgetUsd;
 if(budget===null)return fail('invalid-request','MISSING_BUDGET');
 const timeout=config.timeoutMs??5000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>30000)return fail('invalid-request','INVALID_TIMEOUT');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  if(!accounting.reserve(gate.estimate,budget))return fail('invalid-request','BUDGET_EXCEEDED');
  const outcome=await Promise.race([
   transport.execute(boundedRequest).then(value=>({kind:'result' as const,value})),
   new Promise<{kind:'timeout'}>(resolve=>{timer=setTimeout(()=>resolve({kind:'timeout'}),timeout);}),
  ]);
  if(outcome.kind==='timeout')return fail('timeout','MOCK_TIMEOUT');
  if(!outcome.value||typeof outcome.value!=='object'||Array.isArray(outcome.value))return fail('malformed-response','MALFORMED_RESPONSE');
  const result=outcome.value as Record<string,unknown>;
  if(typeof result.text!=='string'||result.text.length>65536||typeof result.inputTokens!=='number'||!Number.isSafeInteger(result.inputTokens)||result.inputTokens<0||result.inputTokens>boundedRequest.inputTokens||typeof result.outputTokens!=='number'||!Number.isSafeInteger(result.outputTokens)||result.outputTokens<0||result.outputTokens>boundedRequest.maxOutputTokens)return fail('malformed-response','MALFORMED_RESPONSE');
  const actual:UsageRecord=Object.freeze({kind:'ACTUAL',usd:result.inputTokens*price.inputPerToken+result.outputTokens*price.outputPerToken,inputTokens:result.inputTokens,outputTokens:result.outputTokens,authority:'MOCK'});
  accounting.record(actual);return {ok:true,text:result.text,actual};
 }catch{return fail('unknown','MOCK_EXECUTION_FAILED');}
 finally{if(timer)clearTimeout(timer);}
}

/** Conservative process-local MOCK budget, not a production financial ledger.
 * Reservations are synchronous and never released on timeout/ambiguous outcome.
 */
export function createMockUsageAccounting(approvedBudgetUsd:number):UsageAccounting{
 if(!Number.isFinite(approvedBudgetUsd)||approvedBudgetUsd<=0)throw Error('INVALID_MOCK_BUDGET');
 let reserved=0,actual=0;
 return Object.freeze({reserve(estimate:UsageRecord,budgetUsd:number){
  if(budgetUsd!==approvedBudgetUsd||estimate.kind!=='ESTIMATE'||estimate.authority!=='MOCK'||!finiteNonNegative(estimate.usd)||!Number.isFinite(reserved+estimate.usd)||reserved+estimate.usd>approvedBudgetUsd)return false;
  reserved+=estimate.usd;return true;
 },record(value:UsageRecord){
  if(value.kind!=='ACTUAL'||value.authority!=='MOCK'||!finiteNonNegative(value.usd)||actual+value.usd>reserved)throw Error('INVALID_MOCK_USAGE');actual+=value.usd;
 }});
}
