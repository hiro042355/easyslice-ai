import "server-only";
import { validateTikTokServerEnvironment } from "./configCore";
export { toTikTokSafeConfig } from "./configCore";

export function loadTikTokServerConfig() {
  return validateTikTokServerEnvironment({
    NEXCUT_TIKTOK_CLIENT_KEY: process.env.NEXCUT_TIKTOK_CLIENT_KEY,
    NEXCUT_TIKTOK_CLIENT_SECRET: process.env.NEXCUT_TIKTOK_CLIENT_SECRET,
    NEXCUT_TIKTOK_REDIRECT_URI: process.env.NEXCUT_TIKTOK_REDIRECT_URI,
    NEXCUT_TIKTOK_OAUTH_MODE: process.env.NEXCUT_TIKTOK_OAUTH_MODE,
  });
}
