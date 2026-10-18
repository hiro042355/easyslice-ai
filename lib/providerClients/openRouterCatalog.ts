import type {OpenRouterModel} from './openRouterFoundation';

/** Offline catalog boundary. Real discovery/pricing authority is not implemented. */
export function createMockOpenRouterCatalog(raw:unknown):readonly OpenRouterModel[]{
 if(!Array.isArray(raw)||raw.length>256)throw Error('INVALID_MOCK_CATALOG');
 const ids=new Set<string>();
 const models=raw.map((value:unknown):OpenRouterModel=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_MOCK_MODEL');
  const m=value as Record<string,unknown>;
  if(m.providerId!=='openrouter'||m.authority!=='MOCK'||typeof m.modelId!=='string'||!m.modelId||m.modelId.length>200||ids.has(m.modelId)||typeof m.displayName!=='string'||!m.displayName||m.displayName.length>200||(m.availability!=='available'&&m.availability!=='unavailable')||typeof m.refreshedAt!=='string'||!Number.isFinite(Date.parse(m.refreshedAt)))throw Error('INVALID_MOCK_MODEL');
  ids.add(m.modelId);
  if(!Array.isArray(m.capabilities)||m.capabilities.length>4||new Set(m.capabilities).size!==m.capabilities.length)throw Error('INVALID_MOCK_CAPABILITY');
  const capabilities=m.capabilities.map((c:unknown)=>{if(c!=='text'&&c!=='image'&&c!=='video'&&c!=='audio')throw Error('INVALID_MOCK_CAPABILITY');return c;});
  let pricing:OpenRouterModel['pricing']=null;
  if(m.pricing!==null){
   if(!m.pricing||typeof m.pricing!=='object'||Array.isArray(m.pricing))throw Error('INVALID_MOCK_PRICE');
   const p=m.pricing as Record<string,unknown>;
   if(p.currency!=='USD'||typeof p.inputPerToken!=='number'||!Number.isFinite(p.inputPerToken)||p.inputPerToken<0||typeof p.outputPerToken!=='number'||!Number.isFinite(p.outputPerToken)||p.outputPerToken<0)throw Error('INVALID_MOCK_PRICE');
   pricing=Object.freeze({currency:'USD',inputPerToken:p.inputPerToken,outputPerToken:p.outputPerToken});
  }
  return Object.freeze({providerId:'openrouter',modelId:m.modelId,displayName:m.displayName,capabilities:Object.freeze(capabilities),availability:m.availability,pricing,refreshedAt:m.refreshedAt,authority:'MOCK'});
 });
 return Object.freeze(models);
}
