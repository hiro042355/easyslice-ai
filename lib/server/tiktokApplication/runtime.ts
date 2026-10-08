import "server-only";
import {authorizeRuntime} from "../tiktokIntegration/runtimePolicy";
import {isComposedApplication,matchesApplicationConfiguration,type TikTokApplication} from "./composition";
import {validateSandboxApplicationEnvironment} from "./configuration";
let application:TikTokApplication|undefined;
/** Approved server bootstrap only; there is no HTTP registration endpoint. Each worker must install its own approved ports. */
export async function installAuthorizedSandboxApplication(candidate:TikTokApplication):Promise<void>{
 if(application||!isComposedApplication(candidate)||candidate.execution==="LOCAL_TEST"||candidate.mode!=="sandbox")throw new Error("APPLICATION_INSTALL_REJECTED");
 const config=validateSandboxApplicationEnvironment(process.env);
 // Revalidate configured binding without returning any private configuration.
 await authorizeRuntime(candidate.execution,"AUTHENTICATION");await authorizeRuntime(candidate.execution,"READ");
 if(application)throw new Error("APPLICATION_INSTALL_REJECTED");
 if(!matchesApplicationConfiguration(candidate,config))throw new Error("APPLICATION_INSTALL_REJECTED");
 application=candidate;
}
export function resolveSandboxApplication(){if(!application)return undefined;try{return matchesApplicationConfiguration(application,validateSandboxApplicationEnvironment(process.env))?application.routes:undefined;}catch{return undefined;}}
