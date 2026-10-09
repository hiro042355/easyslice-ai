import {readTikTokWorkerConfiguration} from "../../lib/server/tiktokWorker/configuration";
import {MockTikTokWorker} from "../../lib/server/tiktokWorker/core";
import type {FirebasePublisherBridge} from "../../lib/server/tiktokIntegration/publisher";
/** Explicit entrypoint. No startup on module import, cloud adapters or automatic job consumption. */
export function bootstrapTikTokWorker(env:Readonly<Record<string,string|undefined>>,bridge?:FirebasePublisherBridge){
 const configuration=readTikTokWorkerConfiguration(env);
 if(!configuration.enabled)return Object.freeze({status:"DISABLED" as const,worker:undefined,shutdown:async()=>{}});
 if(!bridge)throw new Error("WORKER_DEPENDENCIES_REQUIRED");
 const worker=new MockTikTokWorker(bridge,configuration);
 return Object.freeze({status:"READY_SYNTHETIC" as const,worker,shutdown:()=>worker.shutdown()});
}
