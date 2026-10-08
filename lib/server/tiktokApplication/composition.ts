import {createHash} from "node:crypto";
import type {TikTokServerConfig} from "../tiktokOAuth/contracts";
import {validateSandboxApplicationEnvironment} from "./configuration";
import {FirebaseHttpIntegration,createFirebaseHttpIntegrationRoutes,type TokenVaultPort} from "../tiktokIntegration/service";
import {IntegrationPgStore} from "../tiktokIntegration/store";
import {TikTokLoginAdapter} from "../tiktokHttp/adapter";
import type {TikTokHttpTransport} from "../tiktokHttp/transportRegistry";
import type {RequestSessionVerifier,Session} from "../localTikTok/security";
import type {RuntimeExecution} from "../tiktokIntegration/runtimePolicy";
import type {KeyProvider} from "../localTikTok/custody";
const applications=new WeakMap<object,string>();
const binding=(config:TikTokServerConfig)=>createHash("sha256").update(JSON.stringify([config.authority.mode,config.authority.clientKey,config.clientSecret,config.redirectUri])).digest("hex");
export type ApplicationRoutes=ReturnType<typeof createFirebaseHttpIntegrationRoutes>;
export type TikTokApplication=Readonly<{routes:ApplicationRoutes;execution:RuntimeExecution;mode:"sandbox";toJSON():object}>;
/** The accepted service owns all state, exchange, custody and transaction logic. */
export function composeSandboxTikTokApplication(config:TikTokServerConfig,ports:Readonly<{
 store:IntegrationPgStore;keys:KeyProvider|TokenVaultPort;transport:TikTokHttpTransport;
 verifier:RequestSessionVerifier;execution:RuntimeExecution;csrf:(session:Session)=>string;
}>):TikTokApplication {
 const validated=validateSandboxApplicationEnvironment({NEXCUT_TIKTOK_APPLICATION_MODE:"sandbox",NEXCUT_TIKTOK_OAUTH_MODE:config.authority.mode,NEXCUT_TIKTOK_CLIENT_KEY:config.authority.clientKey,NEXCUT_TIKTOK_CLIENT_SECRET:config.clientSecret,NEXCUT_TIKTOK_REDIRECT_URI:config.redirectUri});
 if(ports.store.environment!=="staging"||ports.store.profile.app!==validated.authority.clientKey||ports.store.profile.redirect!==validated.redirectUri)throw new Error("APPLICATION_BINDING_REJECTED");
 const login=new TikTokLoginAdapter({clientKey:validated.authority.clientKey,clientSecret:validated.clientSecret,redirectUri:validated.redirectUri},ports.transport);
 const execution=ports.execution==="LOCAL_TEST"?ports.execution:Object.freeze({...ports.execution});
 const service=new FirebaseHttpIntegration(ports.store,ports.keys,login,ports.verifier,execution);
 const application=Object.freeze({routes:createFirebaseHttpIntegrationRoutes(service,ports.csrf,execution),execution:service.execution,mode:"sandbox" as const,toJSON:()=>({mode:"sandbox",credentials:"[REDACTED]"})});
 applications.set(application,binding(validated));return application;
}
export function isComposedApplication(value:unknown):value is TikTokApplication {return typeof value==="object"&&value!==null&&applications.has(value);}

export function matchesApplicationConfiguration(application:TikTokApplication,config:TikTokServerConfig){return applications.get(application)===binding(config);}
