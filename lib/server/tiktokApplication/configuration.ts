import {validateTikTokServerEnvironment} from "../tiktokOAuth/configCore";
import type {TikTokServerConfig} from "../tiktokOAuth/contracts";
/** Flags describe configuration; they never grant runtime or network authority. */
export function validateSandboxApplicationEnvironment(env:Readonly<Record<string,string|undefined>>):TikTokServerConfig {
 if(env.NEXCUT_TIKTOK_APPLICATION_MODE!=="sandbox")throw new Error("APPLICATION_DISABLED");
 const config=validateTikTokServerEnvironment(env);
 if(config.authority.mode!=="sandbox")throw new Error("PRODUCTION_CONNECT_DISABLED");
 return config;
}
