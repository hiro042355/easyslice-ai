/** Offline planning contracts, NOT a production executor or a live pricing catalog. */
export type GenerationModality='text'|'image'|'video';
type Quote=Readonly<{authority:'COMPLETE_MOCK_QUOTE';inputCostUpperBoundUsd:number;outputUnitUsd:number;unit:'token'|'image'|'second'}>;
export type MockModalityModel=Readonly<{authority:'MOCK';modelId:string;outputModalities:readonly GenerationModality[];quote:Quote|null;supportedDurations?:readonly number[];supportedResolutions?:readonly string[];supportedAspectRatios?:readonly string[]}>;
export type MultimodalRequest=
 |Readonly<{kind:'text';requestId:string;modelId:string;maxOutputTokens:number}>
 |Readonly<{kind:'image';requestId:string;modelId:string;count:number;resolution:string;aspectRatio:string}>
 |Readonly<{kind:'video';requestId:string;modelId:string;durationSeconds:number;resolution:string;aspectRatio:string}>;
export type OfflineGenerationPlan=Readonly<{authority:'MOCK';realExecutionAllowed:false;request:MultimodalRequest;estimatedUpperBoundUsd:number;execution:'synchronous'|'asynchronous-job'}>;
export type AsyncVideoObservation=
 |Readonly<{status:'pending'|'processing';jobId:string}>
 |Readonly<{status:'completed';jobId:string;artifactId:string}>
 |Readonly<{status:'failed'|'cancelled'|'expired';jobId:string;safeCode:string}>
 |Readonly<{status:'unknown';jobId:string;reuseOrResubmitAllowed:false}>;
/** A future implementation needs durable owner/job/fencing and quote binding.
 * No endpoint, arbitrary download URL, API key, or network implementation lives here.
 */
export interface OfflineVideoJobTransport{
 readonly mode:'OFFLINE_MOCK';
 submit(plan:OfflineGenerationPlan,signal:AbortSignal):Promise<AsyncVideoObservation>;
 poll(jobId:string,signal:AbortSignal):Promise<AsyncVideoObservation>;
}
export function planMockMultimodal(catalog:readonly MockModalityModel[],request:MultimodalRequest,budgetUsd:number):OfflineGenerationPlan{
 if(!/^[-a-zA-Z0-9_]{1,128}$/.test(request.requestId)||!Number.isFinite(budgetUsd)||budgetUsd<=0)throw Error('INVALID_MOCK_REQUEST');
 const models=catalog.filter(m=>m.modelId===request.modelId);
 if(models.length!==1)throw Error('UNKNOWN_MODEL');
 const model=models[0];if(model.authority!=='MOCK'||!model.outputModalities.includes(request.kind))throw Error('UNSUPPORTED_MODALITY');
 const quote=model.quote;
 if(!quote||quote.authority!=='COMPLETE_MOCK_QUOTE'||![quote.inputCostUpperBoundUsd,quote.outputUnitUsd].every(n=>Number.isFinite(n)&&n>=0))throw Error('UNKNOWN_PRICE');
 let units:number;
 if(request.kind==='text'){
  if(quote.unit!=='token'||!Number.isSafeInteger(request.maxOutputTokens)||request.maxOutputTokens<1||request.maxOutputTokens>1000000)throw Error('INVALID_TEXT_PARAMETERS');
  units=request.maxOutputTokens;
 }else{
  if(!model.supportedResolutions?.includes(request.resolution)||!model.supportedAspectRatios?.includes(request.aspectRatio))throw Error('UNSUPPORTED_PARAMETERS');
  if(request.kind==='image'){
   if(quote.unit!=='image'||!Number.isSafeInteger(request.count)||request.count<1||request.count>10)throw Error('INVALID_IMAGE_PARAMETERS');units=request.count;
  }else{
   if(quote.unit!=='second'||!Number.isSafeInteger(request.durationSeconds)||!model.supportedDurations?.includes(request.durationSeconds))throw Error('INVALID_VIDEO_PARAMETERS');units=request.durationSeconds;
  }
 }
 const estimatedUpperBoundUsd=quote.inputCostUpperBoundUsd+units*quote.outputUnitUsd;
 if(!Number.isFinite(estimatedUpperBoundUsd)||estimatedUpperBoundUsd>budgetUsd)throw Error('BUDGET_EXCEEDED');
 return Object.freeze({authority:'MOCK',realExecutionAllowed:false,request:Object.freeze({...request}),estimatedUpperBoundUsd,execution:request.kind==='video'?'asynchronous-job':'synchronous'});
}
