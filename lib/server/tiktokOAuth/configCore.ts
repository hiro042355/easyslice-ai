import { CAPABILITY_SCOPES, TIKTOK_CALLBACK_PATH, TIKTOK_REDIRECT_URI,
  type TikTokServerConfig, type TikTokSafeConfig } from "./contracts";

// Pure validation seam. Never accepts a Request, query, body, or UI options.
// Production consumers must use config.ts, which reads server environment only.
export function validateTikTokServerEnvironment(env: Readonly<Record<string, string | undefined>>): TikTokServerConfig {
  const key = env.NEXCUT_TIKTOK_CLIENT_KEY;
  const secret = env.NEXCUT_TIKTOK_CLIENT_SECRET;
  const redirect = env.NEXCUT_TIKTOK_REDIRECT_URI;
  const mode = env.NEXCUT_TIKTOK_OAUTH_MODE;
  if (!key || key.trim() !== key || /\s/.test(key)) throw new Error("tiktok-client-key-invalid");
  if (!secret || secret.trim() !== secret || /\s/.test(secret)) throw new Error("tiktok-client-secret-invalid");
  if (mode !== "production" && mode !== "sandbox") throw new Error("tiktok-oauth-mode-invalid");
  if (!redirect) throw new Error("tiktok-redirect-uri-invalid");
  let url: URL;
  try { url = new URL(redirect); } catch { throw new Error("tiktok-redirect-uri-invalid"); }
  if (url.protocol !== "https:" || url.pathname !== TIKTOK_CALLBACK_PATH ||
      url.username || url.password || url.search || url.hash || redirect !== TIKTOK_REDIRECT_URI) {
    throw new Error("tiktok-redirect-uri-invalid");
  }
  return Object.freeze({
    authority: Object.freeze({ mode, clientKey: key }),
    clientSecret: secret,
    redirectUri: TIKTOK_REDIRECT_URI,
    callbackPath: TIKTOK_CALLBACK_PATH,
    requestedScopes: Object.freeze([...CAPABILITY_SCOPES["basic-identity"], ...CAPABILITY_SCOPES["direct-post"]]),
  });
}

export function toTikTokSafeConfig(config: TikTokServerConfig): TikTokSafeConfig {
  // Explicit allowlist: never spread the server configuration into public data.
  return Object.freeze({ authority: Object.freeze({ ...config.authority }),
    redirectUri: config.redirectUri, callbackPath: config.callbackPath,
    requestedScopes: Object.freeze([...config.requestedScopes]) });
}
