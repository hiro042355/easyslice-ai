import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { validateTikTokServerEnvironment, toTikTokSafeConfig } from "../../lib/server/tiktokOAuth/configCore";
import { CAPABILITY_SCOPES, TIKTOK_REDIRECT_URI } from "../../lib/server/tiktokOAuth/contracts";
import { GET } from "../../app/api/tiktok/oauth/callback/route";

const fixture = () => ({ NEXCUT_TIKTOK_CLIENT_KEY: "synthetic-key",
  NEXCUT_TIKTOK_CLIENT_SECRET: "synthetic-secret", NEXCUT_TIKTOK_REDIRECT_URI: TIKTOK_REDIRECT_URI,
  NEXCUT_TIKTOK_OAUTH_MODE: "production" });
test("valid Production contract uses exact registered candidate and callback path", () => {
  const config = validateTikTokServerEnvironment(fixture());
  assert.equal(config.redirectUri, TIKTOK_REDIRECT_URI);
  assert.equal(config.callbackPath, "/api/tiktok/oauth/callback");
  assert.equal(config.authority.mode, "production");
});
for (const name of ["NEXCUT_TIKTOK_CLIENT_KEY", "NEXCUT_TIKTOK_CLIENT_SECRET", "NEXCUT_TIKTOK_REDIRECT_URI", "NEXCUT_TIKTOK_OAUTH_MODE"]) {
  test(`missing ${name} fails closed without secret in error`, () => {
    const env: Record<string, string | undefined> = fixture();
    delete env[name];
    assert.throws(() => validateTikTokServerEnvironment(env), /^Error: tiktok-[a-z-]+-invalid$/);
  });
}
for (const uri of ["not-a-url", "http://www.nexcutai.com/api/tiktok/oauth/callback",
  "https://www.nexcutai.com/other", "https://evil.example/api/tiktok/oauth/callback",
  TIKTOK_REDIRECT_URI + "?override=1", TIKTOK_REDIRECT_URI + "#fragment",
  TIKTOK_REDIRECT_URI + "/", "https://user:pass@www.nexcutai.com/api/tiktok/oauth/callback"]) {
  test(`invalid redirect rejected: ${uri}`, () => {
    assert.throws(() => validateTikTokServerEnvironment({ ...fixture(), NEXCUT_TIKTOK_REDIRECT_URI: uri }), /tiktok-redirect-uri-invalid/);
  });
}
test("browser-like overrides and NEXT_PUBLIC values cannot select authority", () => {
  const config = validateTikTokServerEnvironment({ ...fixture(), redirectUri: "https://evil.example",
    mode: "sandbox", clientKey: "attacker", NEXT_PUBLIC_NEXCUT_TIKTOK_CLIENT_KEY: "attacker" });
  assert.equal(config.redirectUri, TIKTOK_REDIRECT_URI);
  assert.equal(config.authority.mode, "production");
  assert.equal(config.authority.clientKey, "synthetic-key");
  const guard = readFileSync("lib/server/tiktokOAuth/config.ts", "utf8");
  assert.match(guard, /import "server-only"/);
  assert.match(guard, /function loadTikTokServerConfig\(\)/);
  assert.doesNotMatch(guard, /NEXT_PUBLIC/);
});
test("safe config has no secret and does not alias internal arrays/authority", () => {
  const config = validateTikTokServerEnvironment(fixture());
  const safe = toTikTokSafeConfig(config);
  assert.deepEqual(Object.keys(safe).sort(), ["authority", "callbackPath", "redirectUri", "requestedScopes"]);
  assert.ok(!JSON.stringify(safe).includes("synthetic-secret"));
  assert.notEqual(safe.authority, config.authority);
  assert.notEqual(safe.requestedScopes, config.requestedScopes);
});
test("FILE_UPLOAD Direct Post does not request inbox scope", () => {
  assert.deepEqual(CAPABILITY_SCOPES["direct-post"], ["video.publish"]);
  assert.deepEqual(CAPABILITY_SCOPES["inbox-upload"], ["video.upload"]);
  assert.deepEqual(validateTikTokServerEnvironment(fixture()).requestedScopes, ["user.info.basic", "video.publish"]);
});
test("Sandbox and Production remain distinct; unknown mode rejected", () => {
  const sandbox = validateTikTokServerEnvironment({ ...fixture(), NEXCUT_TIKTOK_OAUTH_MODE: "sandbox" });
  assert.equal(sandbox.authority.mode, "sandbox");
  assert.notDeepEqual(sandbox.authority, validateTikTokServerEnvironment(fixture()).authority);
  assert.throws(() => validateTikTokServerEnvironment({ ...fixture(), NEXCUT_TIKTOK_OAUTH_MODE: "preview" }), /mode-invalid/);
});
test("callback is explicit 501 with no query echo, cookies, redirect or network", async () => {
  const response = GET();
  assert.equal(response.status, 501);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.deepEqual(await response.json(), { success: false, error: "tiktok-oauth-not-implemented" });
});
