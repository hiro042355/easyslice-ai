import { CONNECTION_STATES, type ConnectionResponse, type FutureConnectionApi } from "../tiktokConnection/contracts";
export type ConnectionApi=FutureConnectionApi & Readonly<{execution:"UNAVAILABLE"|"LOCAL_TEST"}>;
export interface LocalRouteTransport { request(path:string,method:"GET"|"POST",body?:string):Promise<Response>; completeMockRedirect(response:Response):Promise<void> }
export const unavailableConnectionApi:ConnectionApi=Object.freeze({execution:"UNAVAILABLE",getConnection:async()=>({version:"1",status:"UNAVAILABLE"} as const),startOAuth:async()=>({status:"UNAVAILABLE"} as const),disconnect:async()=>({status:"UNAVAILABLE"} as const)});
const localApis=new WeakSet<object>();
export function isLocalConnectionApi(api:ConnectionApi):boolean{return localApis.has(api);}
export function createLocalConnectionApi(transport:LocalRouteTransport,target:string):ConnectionApi {
  if(target!=="LOCAL_TEST" || (transport.request as unknown)===globalThis.fetch) throw new Error("LOCAL_TRANSPORT_REQUIRED");
  const api=Object.freeze({execution:"LOCAL_TEST" as const,
    async getConnection(){const r=await transport.request("/api/tiktok/connection","GET");if(r.status===501 || r.status===401) return {version:"1" as const,status:"UNAVAILABLE" as const};if(!r.ok) throw new Error("CONNECTION_CHECK_FAILED");const body=await r.json();if(body.version!=="1" || !CONNECTION_STATES.includes(body.status)) throw new Error("CONNECTION_CHECK_FAILED");const value:ConnectionResponse={version:"1",status:body.status,...(body.status==="CONNECTED" && typeof body.account?.displayName==="string"?{account:{displayName:body.account.displayName}}:{}),...(body.status==="ERROR"?{error:"CONNECTION_CHECK_FAILED" as const}:{})};return Object.freeze(value);},
    async startOAuth(){const r=await transport.request("/api/tiktok/oauth/start","POST");if(r.status!==303) throw new Error("CONNECTION_CHECK_FAILED");const location=new URL(r.headers.get("location")??"");if(location.origin!=="http://127.0.0.1:8765" || location.pathname!=="/_mock/tiktok/authorize") throw new Error("LOCAL_REDIRECT_REJECTED");await transport.completeMockRedirect(r);return {status:"SERVER_REDIRECT" as const};},
    async disconnect(){const r=await transport.request("/api/tiktok/disconnect","POST",JSON.stringify({confirm:true}));if(!r.ok || (await r.json()).status!=="DISCONNECTED") throw new Error("CONNECTION_CHECK_FAILED");return {status:"DISCONNECTED" as const};}
  });localApis.add(api);return api;
}
