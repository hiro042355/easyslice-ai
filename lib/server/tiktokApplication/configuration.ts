import {validateTikTokServerEnvironment} from "../tiktokOAuth/configCore";
import type {TikTokServerConfig} from "../tiktokOAuth/contracts";
/** Flags describe configuration; they never grant runtime or network authority. */
export function validateSandboxApplicationEnvironment(env:Readonly<Record<string,string|undefined>>):TikTokServerConfig {
 if(env.NEXCUT_TIKTOK_APPLICATION_MODE!=="sandbox")throw new Error("APPLICATION_DISABLED");
 readTikTokApplicationFeatures(env);
 const config=validateTikTokServerEnvironment(env);
 if(config.authority.mode!=="sandbox")throw new Error("PRODUCTION_CONNECT_DISABLED");
 return config;
}

export function readTikTokApplicationFeatures(env:Readonly<Record<string,string|undefined>>){const ui=env.NEXCUT_TIKTOK_CONNECT_UI_ENABLED;if(ui!==undefined&&ui!=="false"&&ui!=="true")throw new Error("APPLICATION_FEATURE_INVALID");const logging=env.TIKTOK_LOG_LEVEL??"bounded",monitoring=env.TIKTOK_ERROR_MONITORING??"disabled";if(!["off","bounded"].includes(logging)||!["disabled","bounded"].includes(monitoring))throw new Error("APPLICATION_FEATURE_INVALID");return Object.freeze({uiEnabled:ui==="true",logging,monitoring});}
