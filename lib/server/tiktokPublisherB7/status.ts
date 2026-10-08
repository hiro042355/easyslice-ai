import {AuthenticatedTikTokTransport} from "./artifact/tiktok/real/AuthenticatedTikTokTransport";
import {TikTokPublishStatusAdapter} from "./artifact/tiktok/real/TikTokPublishStatusAdapter";
import {API_ORIGIN,B7HttpExecutor,type ResolvePostingAuthorization} from "../tiktokHttp/adapter";
import type {TikTokHttpTransport} from "../tiktokHttp/transportRegistry";
/** Read-only status uses the accepted B7 parser/correlation authority; no alternate engine. */
export function createStatusObserver(transport:TikTokHttpTransport,authorize:ResolvePostingAuthorization){
 const authProvider={getAccessToken:async()=>{const c=await authorize("status");return {token:c.accessToken,expiresAtMs:c.expiresAt};},refreshToken:async()=>{throw new Error("REAUTH_REQUIRED");},isExpired:()=>false};
 let authoritative=false;const executor=new B7HttpExecutor(transport,authorize);const http={execute:async(input:Parameters<B7HttpExecutor["execute"]>[0])=>{const response=await executor.execute(input);const body=response.body;if(response.status>=200&&response.status<300&&body&&typeof body==="object"&&"error" in body&&"data" in body){const error=body.error,data=body.data;authoritative=!!error&&typeof error==="object"&&"code" in error&&error.code==="ok"&&!!data&&typeof data==="object"&&"status" in data&&["PUBLISH_COMPLETE","FAILED","PROCESSING_UPLOAD","PROCESSING_DOWNLOAD"].includes(String(data.status));}else authoritative=false;return response;}};
 const api=new AuthenticatedTikTokTransport({apiBase:API_ORIGIN,authProvider,timeoutMs:1000,retryPolicy:{maxRetries:0,initialDelayMs:0,backoffMultiplier:1,maxDelayMs:0}},http);
 const adapter=new TikTokPublishStatusAdapter(api);return {async fetchStatus(publishId:string){const result=await adapter.fetchStatus(publishId);return !authoritative||result.correlationConflict?{...result,status:"unknown" as const}:result;}};
}
