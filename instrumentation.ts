import {readTikTokApplicationFeatures,validateSandboxApplicationEnvironment} from "./lib/server/tiktokApplication/configuration";
import {readTikTokWorkerConfiguration} from "./lib/server/tiktokWorker/configuration";
/** Next startup hook. No provider creation, automatic queue consumption or live publishing. */
export async function register(){
 const features=readTikTokApplicationFeatures(process.env),configuration=readTikTokWorkerConfiguration(process.env);
 if(process.env.NEXT_RUNTIME==="nodejs"){
  if(features.uiEnabled){validateSandboxApplicationEnvironment(process.env);const application=await import("./lib/server/tiktokApplication/runtime");if(!application.resolveSandboxApplication())throw new Error("APPLICATION_DEPENDENCIES_REQUIRED");}
  if(configuration.enabled){const runtime=await import("./worker/tiktok/runtime");await runtime.startRegisteredTikTokWorker();}
 }else if(configuration.enabled)throw new Error("WORKER_RUNTIME_REJECTED");
}
