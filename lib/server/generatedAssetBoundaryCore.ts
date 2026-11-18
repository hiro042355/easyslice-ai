import type {RouteAuthenticationResult} from './productionIdentity/routeGuardCore';
import {readBoundedJsonBody} from './boundedJsonBody';

/** Direct user prompts, not persisted project/media IDs. No caller owner authority is used. */
export function createGeneratedAssetBoundary(authenticate:(request:Request)=>Promise<RouteAuthenticationResult>,handler:(request:Request)=>Promise<Response>){
 return async(request:Request):Promise<Response>=>{
  const auth=await authenticate(request);if(!auth.ok)return auth.response;
  const fail=(status:number)=>Response.json({success:false,error:'generation-request-rejected'},{status,headers:{'cache-control':'private, no-store'}});
  if(request.headers.get('origin')!==new URL(request.url).origin)return fail(403);
  if(new URL(request.url).search||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return fail(400);
  let body:unknown;
  try{body=await readBoundedJsonBody(request,128*1024);}catch{return fail(400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail(400);
  if(request.signal.aborted)return fail(499);
  try{
   const bounded=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body),signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});
   const response=await handler(bounded);response.headers.set('Cache-Control','private, no-store');return response;
  }catch{return fail(request.signal.aborted?499:502);}
 };
}

/** Fixed existing provider endpoints remain route-owned; never return raw error bodies. */
export async function fetchGeneratedAsset(input:string,init:RequestInit,signal:AbortSignal,fetchImpl:typeof fetch=fetch):Promise<Response>{
 if(!/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[a-z0-9.-]+:generateContent$/.test(input))throw Error('invalid-provider');
 const response=await fetchImpl(input,{...init,signal});
 if(!response.ok){await response.body?.cancel().catch(()=>undefined);return Response.json({error:'generation-provider-failed'},{status:response.status});}
 const body=await readBoundedJsonBody(response,12*1024*1024);
 return Response.json(body);
}
