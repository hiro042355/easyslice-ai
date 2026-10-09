import {readTikTokApplicationFeatures} from "./configuration";
/** Server rendering hint only; authentication/installed ports/CSRF remain authoritative. */
export function sandboxUiRequested(){return readTikTokApplicationFeatures(process.env).uiEnabled&&process.env.NEXCUT_TIKTOK_APPLICATION_MODE==="sandbox"&&process.env.NEXCUT_TIKTOK_OAUTH_MODE==="sandbox";}
