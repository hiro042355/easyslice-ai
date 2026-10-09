import {createHash,randomUUID} from "node:crypto";
import type {TikTokServerConfig} from "../tiktokOAuth/contracts";
import {validateSandboxApplicationEnvironment} from "./configuration";
import {FirebaseHttpIntegration,createFirebaseHttpIntegrationRoutes,type TokenVaultPort} from "../tiktokIntegration/service";
import {IntegrationPgStore} from "../tiktokIntegration/store";
import {TikTokLoginAdapter} from "../tiktokHttp/adapter";
import type {TikTokHttpTransport} from "../tiktokHttp/transportRegistry";
import {identity,type RequestSessionVerifier,type Session} from "../localTikTok/security";
import type {RuntimeExecution} from "../tiktokIntegration/runtimePolicy";
import type {KeyProvider} from "../localTikTok/custody";
const applications=new WeakMap<object,string>();
const binding=(config:TikTokServerConfig)=>createHash("sha256").update(JSON.stringify([config.authority.mode,config.authority.clientKey,config.clientSecret,config.redirectUri])).digest("hex");
export type ApplicationRoutes=ReturnType<typeof createClientRoutes>;
export type TikTokApplication=Readonly<{routes:ApplicationRoutes;execution:RuntimeExecution;mode:"sandbox";toJSON():object}>;
/** The accepted service owns all state, exchange, custody and transaction logic. */
export function composeSandboxTikTokApplication(config:TikTokServerConfig,ports:Readonly<{
 store:IntegrationPgStore;keys:KeyProvider|TokenVaultPort;transport:TikTokHttpTransport;
 verifier:RequestSessionVerifier;execution:RuntimeExecution;csrf:(session:Session)=>string;clientEnabled?:boolean;
}>):TikTokApplication {
 const validated=validateSandboxApplicationEnvironment({NEXCUT_TIKTOK_APPLICATION_MODE:"sandbox",NEXCUT_TIKTOK_OAUTH_MODE:config.authority.mode,NEXCUT_TIKTOK_CLIENT_KEY:config.authority.clientKey,NEXCUT_TIKTOK_CLIENT_SECRET:config.clientSecret,NEXCUT_TIKTOK_REDIRECT_URI:config.redirectUri});
 if(ports.store.environment!=="staging"||ports.store.profile.app!==validated.authority.clientKey||ports.store.profile.redirect!==validated.redirectUri)throw new Error("APPLICATION_BINDING_REJECTED");
 const login=new TikTokLoginAdapter({clientKey:validated.authority.clientKey,clientSecret:validated.clientSecret,redirectUri:validated.redirectUri},ports.transport);
 const execution=ports.execution==="LOCAL_TEST"?ports.execution:Object.freeze({...ports.execution});
 const service=new FirebaseHttpIntegration(ports.store,ports.keys,login,ports.verifier,execution);
 const application=Object.freeze({routes:createClientRoutes(service,ports.csrf,execution,ports.clientEnabled===true),execution:service.execution,mode:"sandbox" as const,toJSON:()=>({mode:"sandbox",credentials:"[REDACTED]"})});
 applications.set(application,binding(validated));return application;
}
export function isComposedApplication(value:unknown):value is TikTokApplication {return typeof value==="object"&&value!==null&&applications.has(value);}

export function matchesApplicationConfiguration(application:TikTokApplication,config:TikTokServerConfig){return applications.get(application)===binding(config);}

function createClientRoutes(service:FirebaseHttpIntegration,csrf:(session:Session)=>string,execution:RuntimeExecution,enabled:boolean){
 const clientAllowed=()=>enabled&&(execution==="LOCAL_TEST"||process.env.NEXCUT_TIKTOK_CONNECT_UI_ENABLED==="true");
 const accepted=createFirebaseHttpIntegrationRoutes(service,csrf,execution),tickets=new Map<string,{uid:string;session:string;url:string;expires:number}>();
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 return Object.freeze({...accepted,
  async bootstrap(request:Request){try{if(!clientAllowed()||request.method!=="GET"||request.url!=="https://www.nexcutai.com/api/tiktok/bootstrap")throw new Error("CLIENT_DISABLED");const session=await service.session(request,false);return json({version:"1",mode:"sandbox",enabled:true,csrf:csrf(session)});}catch{return json({version:"1",status:"UNAVAILABLE"},503);}},
  async start(request:Request){if(request.headers.get("accept")==="application/json"&&!clientAllowed())return json({version:"1",status:"UNAVAILABLE"},503);const result=await accepted.start(request);if(result.status!==303||request.headers.get("accept")!=="application/json")return result;try{if(!clientAllowed())throw new Error("CLIENT_DISABLED");const session=identity(await service.session(request));for(const [key,ticket]of tickets)if(ticket.expires<=Date.now())tickets.delete(key);if(tickets.size>=128)throw new Error("CLIENT_BUSY");const url=result.headers.get("location")!,target=new URL(url);if(target.origin!=="https://www.tiktok.com"||target.pathname!=="/v2/auth/authorize/")throw new Error("REDIRECT_REJECTED");const key=randomUUID();tickets.set(key,{uid:session.uid,session:session.sessionId,url,expires:Math.min(Date.now()+30000,session.expiresAt)});return json({status:"SERVER_REDIRECT",navigationPath:"/api/tiktok/oauth/navigate?ticket="+key});}catch{return json({error:"REQUEST_REJECTED"},403);}},
  async navigate(request:Request){try{if(!clientAllowed())throw new Error("CLIENT_DISABLED");const url=new URL(request.url),key=url.searchParams.get("ticket");if(request.method!=="GET"||url.origin!=="https://www.nexcutai.com"||url.pathname!=="/api/tiktok/oauth/navigate"||[...url.searchParams.keys()].length!==1||!key||!/^[a-f0-9-]{36}$/.test(key))throw new Error("REQUEST_REJECTED");const session=identity(await service.session(request)),ticket=tickets.get(key);if(!ticket||ticket.expires<=Date.now()||ticket.uid!==session.uid||ticket.session!==session.sessionId)throw new Error("REQUEST_REJECTED");tickets.delete(key);return new Response(null,{status:303,headers:{Location:ticket.url,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});}catch{return json({error:"REQUEST_REJECTED"},400);}}
 });
}
