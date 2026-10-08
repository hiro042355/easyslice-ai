import { assertTransportRequest, TikTokAdapterError, classifyProviderError, type MockFetch } from "./adapter";
import { registerTransport, type TikTokHttpTransport } from "./transportRegistry";
export type RetryDisposition="NEVER_REPLAY_SIDE_EFFECT"|"MANUAL_BACKOFF_OBSERVATION"|"REAUTH_REQUIRED"|"MANUAL_RECONCILIATION";
export function retryDisposition(status:number,body:unknown,observation:boolean):RetryDisposition {const c=classifyProviderError(status,body);if(c==="AUTH_REJECTED")return "REAUTH_REQUIRED";if(!observation)return "NEVER_REPLAY_SIDE_EFFECT";if(c==="RATE_LIMITED"||status>=500)return "MANUAL_BACKOFF_OBSERVATION";return "MANUAL_RECONCILIATION";}
/** Native fetch-compatible executor. Disabled default; only injected test I/O is enabled by this checkpoint. */
export class NativeHttpTransport implements TikTokHttpTransport {
 readonly #io:MockFetch|undefined;readonly #timeout:number;readonly #signal:AbortSignal|undefined;readonly #releaseAuthorization:(()=>Promise<void>)|undefined;
 constructor(options:Readonly<{execution?:"DISABLED"|"INJECTED_TEST"|"AUTHORIZED_NATIVE";releaseAuthorization?:()=>Promise<void>;timeoutMs?:number;signal?:AbortSignal}>={},io?:MockFetch){
  if(typeof process==="undefined"||!process.versions?.node)throw new TikTokAdapterError("NETWORK_DISABLED");
  this.#signal=options.signal;this.#timeout=options.timeoutMs??1000;if(!Number.isSafeInteger(this.#timeout)||this.#timeout<1||this.#timeout>30000)throw new TikTokAdapterError("AUTHORIZATION_REQUIRED");
  if(options.execution==="INJECTED_TEST"){if(!io||io===globalThis.fetch)throw new TikTokAdapterError("AUTHORIZATION_REQUIRED");this.#io=io;}
  else if(options.execution==="AUTHORIZED_NATIVE"){if(io||typeof options.releaseAuthorization!=="function")throw new TikTokAdapterError("AUTHORIZATION_REQUIRED");this.#releaseAuthorization=options.releaseAuthorization;this.#io=globalThis.fetch;}
  else if(options.execution!==undefined&&options.execution!=="DISABLED")throw new TikTokAdapterError("NETWORK_DISABLED");
  registerTransport(this);Object.freeze(this);
 }
 toJSON(){return {network:this.#releaseAuthorization?"EXPLICIT_RELEASE_GATED":this.#io?"INJECTED_TEST":"DISABLED",credentials:"[REDACTED]"};}
 async request(url:string,init:RequestInit):Promise<Response>{
  if(!this.#io)throw new TikTokAdapterError("NETWORK_DISABLED");try{assertTransportRequest(url,init);}catch{throw new TikTokAdapterError("AUTHORIZATION_REQUIRED");}
  const controller=new AbortController(),cancel=()=>controller.abort();const signal=init.signal??this.#signal;
  if(signal?.aborted)throw new TikTokAdapterError("TRANSPORT_UNKNOWN");signal?.addEventListener("abort",cancel,{once:true});
  let timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new TikTokAdapterError("TRANSPORT_UNKNOWN"));},this.#timeout);controller.signal.addEventListener("abort",()=>reject(new TikTokAdapterError("TRANSPORT_UNKNOWN")),{once:true});});
  try{
   if(this.#releaseAuthorization)await Promise.race([this.#releaseAuthorization().catch(()=>{throw new TikTokAdapterError("AUTHORIZATION_REQUIRED");}),deadline]);
   const response=await Promise.race([this.#io(url,{...init,redirect:"error",credentials:"omit",signal:controller.signal}),deadline]);
   if(!(response instanceof Response)||response.redirected||(response.status>=300&&response.status<400)||(response.url&&response.url!==url))throw new TikTokAdapterError("TRANSPORT_UNKNOWN");
   const chunks:Uint8Array[]=[];let size=0;
   if(response.body){reader=response.body.getReader();for(;;){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;size+=part.value.length;if(size>1024*1024)throw new TikTokAdapterError("MALFORMED_RESPONSE");chunks.push(part.value);}}
   if(controller.signal.aborted)throw new TikTokAdapterError("TRANSPORT_UNKNOWN");
   const body=Buffer.concat(chunks);return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,headers:{"content-type":response.headers.get("content-type")??"application/json"}});
  }catch(error){if(error instanceof TikTokAdapterError)throw error;throw new TikTokAdapterError("TRANSPORT_UNKNOWN");}
  finally{if(timer)clearTimeout(timer);controller.abort();signal?.removeEventListener("abort",cancel);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
}
Object.freeze(NativeHttpTransport.prototype);
/** Bounded observation coordinator; never retries init/upload or infers processing as success. */
export async function observePublication(observe:()=>Promise<"success"|"failure"|"processing"|"unknown">,authorize:()=>Promise<void>,options:Readonly<{maxObservations:number;deadlineMs:number;signal?:AbortSignal}>,now=Date.now){
 if(!Number.isSafeInteger(options.maxObservations)||options.maxObservations<1||options.maxObservations>5||!Number.isFinite(options.deadlineMs)||options.deadlineMs<=now())throw new TikTokAdapterError("AUTHORIZATION_REQUIRED");
 for(let i=0;i<options.maxObservations;i++){
  if(options.signal?.aborted||now()>=options.deadlineMs)return "unknown" as const;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
  try{
   const state=await Promise.race([(async()=>{await authorize();if(!active||options.signal?.aborted||now()>=options.deadlineMs)return "unknown" as const;return observe();})(),new Promise<"unknown">(resolve=>{onAbort=()=>resolve("unknown");options.signal?.addEventListener("abort",onAbort,{once:true});timer=setTimeout(()=>resolve("unknown"),Math.max(1,options.deadlineMs-now()));})]);
   if(options.signal?.aborted||now()>=options.deadlineMs)return "unknown" as const;
   if(state==="success"||state==="failure"||state==="unknown")return state;
  }catch{return "unknown" as const;}finally{active=false;if(timer)clearTimeout(timer);if(onAbort)options.signal?.removeEventListener("abort",onAbort);}
 }
 return "unknown" as const;
}
