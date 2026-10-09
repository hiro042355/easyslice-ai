export type WorkerConfiguration=Readonly<{enabled:boolean;mode:"LOCAL_TEST";postingEnabled:boolean;maxJobs:number}>;
function flag(value:string|undefined){if(value===undefined||value==="false")return false;if(value==="true")return true;throw new Error("WORKER_CONFIG_INVALID");}
export function readTikTokWorkerConfiguration(env:Readonly<Record<string,string|undefined>>):WorkerConfiguration {
 const enabled=flag(env.TIKTOK_WORKER_ENABLED),postingEnabled=flag(env.TIKTOK_CONTENT_POSTING_ENABLED);
 if(enabled&&env.TIKTOK_WORKER_MODE!=="local-test")throw new Error("LIVE_WORKER_DISABLED");
 if(postingEnabled&&!enabled)throw new Error("WORKER_CONFIG_INVALID");
 return Object.freeze({enabled,mode:"LOCAL_TEST",postingEnabled,maxJobs:128});
}
