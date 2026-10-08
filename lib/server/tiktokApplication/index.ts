import "server-only";
import type {Pool} from "pg";
import type {ManagedTokenVault} from "../tiktokKeys/managedVault";
import {NativeHttpTransport} from "../tiktokHttp/nativeTransport";
import {createCanonicalTikTokFirebaseVerifier} from "../tiktokFirebase";
import {IntegrationPgStore} from "../tiktokIntegration/store";
import type {ServerRuntimeExecution} from "../tiktokIntegration/runtimePolicy";
import {validateSandboxApplicationEnvironment} from "./configuration";
import {composeSandboxTikTokApplication} from "./composition";
export {installAuthorizedSandboxApplication} from "./runtime";
/** Inert bootstrap factory. Caller supplies separately approved Sandbox DB/KMS/runtime/network authority. */
export function createAuthorizedSandboxApplication(ports:Readonly<{pool:Pool;vault:ManagedTokenVault;execution:ServerRuntimeExecution;releaseAuthorization:()=>Promise<void>}>) {
 const config=validateSandboxApplicationEnvironment(process.env);
 const execution=Object.freeze({...ports.execution});
 const verifier=createCanonicalTikTokFirebaseVerifier();
 const store=new IntegrationPgStore(ports.pool,execution,{app:config.authority.clientKey,redirect:config.redirectUri,environment:"staging"});
 const transport=new NativeHttpTransport({execution:"AUTHORIZED_NATIVE",releaseAuthorization:ports.releaseAuthorization});
 return composeSandboxTikTokApplication(config,{store,keys:ports.vault,transport,verifier,execution,csrf:session=>verifier.csrf(session)});
}
