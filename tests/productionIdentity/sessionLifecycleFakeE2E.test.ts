import assert from "node:assert/strict";
import test from "node:test";
import type { DecodedIdToken } from "firebase-admin/auth";
import { createSessionHandlers } from "../../lib/server/productionIdentity/sessionRouteCore";
import { createAuthenticatedRouteGuard, SESSION_COOKIE_NAME } from "../../lib/server/productionIdentity/routeGuardCore";
import { requireBetaAuthorization } from "../../lib/server/productionIdentity/betaAuthorization";
import { SESSION_MAX_AGE_SECONDS } from "../../lib/server/productionIdentity/sessionSecurity";
import { createProductionOwnerUidProofRoute } from "../../app/api/internal/production-owner-uid-proof/route";
import { restoreServerSession } from "../../lib/client/restoredServerSession";
import { establishGoogleIdentitySession } from "../../lib/client/googleIdentitySignIn";

const origin = "https://local.example";
function fixture(uid = "owner", allowed = "owner,beta") {
  let cookie = "";
  let revoked = false;
  const calls: string[] = [];
  const claims = { uid, sub: uid, aud: "fake-project", iss: "https://securetoken.google.com/fake-project", iat: 10, exp: 20, auth_time: 10, firebase: { identities: {}, sign_in_provider: "google.com" } } as DecodedIdToken;
  const auth = {
    async verifyIdToken(token: string, checkRevoked?: boolean) { calls.push("verify-id"); assert.equal(checkRevoked, true); if (token !== "fake-id" || revoked) throw new Error("rejected"); return claims; },
    async verifySessionCookie(value: string, checkRevoked?: boolean) { calls.push("verify-cookie"); assert.equal(checkRevoked, true); if (value !== "fake-session" || revoked) throw new Error("rejected"); return claims; },
    async createSessionCookie(token: string, options: { expiresIn: number }) { calls.push("create-cookie"); assert.equal(token, "fake-id"); assert.equal(options.expiresIn, SESSION_MAX_AGE_SECONDS * 1000); return "fake-session"; },
    async revokeRefreshTokens(subject: string) { assert.equal(subject, uid); revoked = true; },
  };
  const guard = createAuthenticatedRouteGuard(auth);
  const authenticate = async (request: Request) => requireBetaAuthorization(await guard(request), allowed);
  const handlers = createSessionHandlers({ authenticate, withAuth: operation => operation(auth) });
  const request = (method = "GET", headers: Record<string, string> = {}) => new Request(`${origin}/api/auth/session`, {
    method, headers: { ...(method !== "GET" ? { origin } : {}), ...(cookie ? { cookie } : {}), ...headers },
  });
  const exchange = async (idToken: string) => {
    const response = await handlers.POST(request("POST", { authorization: `Bearer ${idToken}` }));
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return response;
  };
  const dependencies = {
    checkSession: () => handlers.GET(request()),
    async restoredUser() { return { async getIdToken(force: boolean) { assert.equal(force, true); return "fake-id"; } }; },
    createSession: exchange,
  };
  const protectedOperation = createProductionOwnerUidProofRoute({ environment: { VERCEL_ENV: "production", NEXCUT_PRODUCTION_OWNER_UID: "owner" }, authenticate });
  return { calls, handlers, request, exchange, dependencies, protectedOperation, setCookie(value: string) { cookie = `${SESSION_COOKIE_NAME}=${value}`; }, revoke() { revoked = true; } };
}

test("fake E2E: restored Firebase -> real session handlers -> beta guard -> exact Owner boundary", async () => {
  const h = fixture();
  assert.equal((await h.protectedOperation(h.request("POST"))).status, 401);
  assert.equal(await restoreServerSession(h.dependencies), "authenticated");
  const accepted = await h.handlers.GET(h.request());
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.deepEqual(await accepted.json(), { success: true });
  assert.equal((await h.protectedOperation(h.request("POST"))).status, 200);
  h.setCookie("expired-session");
  assert.equal(await restoreServerSession(h.dependencies), "authenticated");
  assert.equal((await h.protectedOperation(h.request("POST"))).status, 200);
});
test("fake E2E: fresh popup regression uses the same POST and protected check", async () => {
  const h = fixture();
  assert.deepEqual(await establishGoogleIdentitySession({ openPopup: async () => ({ user: (await h.dependencies.restoredUser())! }), createSession: h.exchange }), { status: "authenticated" });
  assert.equal((await h.handlers.GET(h.request())).status, 200);
});
test("fake E2E: beta denial, non-Owner, revoked token and missing credentials fail closed", async () => {
  const denied = fixture("outsider");
  assert.equal(await restoreServerSession(denied.dependencies), "forbidden");
  assert.equal((await denied.protectedOperation(denied.request("POST"))).status, 404);
  const beta = fixture("beta");
  assert.equal(await restoreServerSession(beta.dependencies), "authenticated");
  assert.equal((await beta.protectedOperation(beta.request("POST"))).status, 404);
  const revoked = fixture();
  revoked.revoke();
  assert.equal(await restoreServerSession(revoked.dependencies), "unauthenticated");
  assert.equal((await revoked.protectedOperation(revoked.request("POST"))).status, 401);
  assert.equal(await restoreServerSession({ ...fixture().dependencies, restoredUser: async () => null }), "unauthenticated");
});
test("cookie attributes and response bodies preserve credential isolation", async () => {
  const h = fixture();
  const response = await h.exchange("fake-id");
  const cookie = response.headers.get("set-cookie")!;
  for (const expected of ["__Host-nexcut_session=", "HttpOnly", "Secure", "SameSite=lax", "Path=/", `Max-Age=${SESSION_MAX_AGE_SECONDS}`]) assert.ok(cookie.includes(expected));
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(h.calls[0], "verify-id");
  assert.equal(h.calls[1], "create-cookie");
  assert.equal((await h.exchange("invalid")).status, 401);
});
test("POST and DELETE reject absent, malformed and cross-origin origin before verification", async () => {
  for (const method of ["POST", "DELETE"] as const) for (const originValue of [null, "https://evil.example", "null", "bad origin", `${origin}:444`]) {
    const h = fixture();
    const request = new Request(`${origin}/api/auth/session`, { method, headers: { ...(originValue === null ? {} : { origin: originValue }), authorization: "Bearer fake-id", cookie: `${SESSION_COOKIE_NAME}=fake-session` } });
    assert.equal((await h.handlers[method](request)).status, 403);
    assert.deepEqual(h.calls, []);
  }
});
test("logout clears cookie, revokes credentials and prevents restoration with a revoked token", async () => {
  const h = fixture();
  await h.exchange("fake-id");
  const response = await h.handlers.DELETE(h.request("DELETE"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(await restoreServerSession(h.dependencies), "unauthenticated");
});
test("malformed cookies fail closed and a rejected cookie cannot fall back to bearer", async () => {
  const h = fixture();
  for (const cookie of [`${SESSION_COOKIE_NAME}=%ZZ`, `${SESSION_COOKIE_NAME}=expired-session`]) {
    const response = await h.handlers.GET(h.request("GET", { cookie, authorization: "Bearer fake-id" }));
    assert.equal(response.status, 401);
  }
  assert.equal(h.calls.includes("verify-id"), false);
  const response = await h.handlers.DELETE(h.request("DELETE", { cookie: `${SESSION_COOKIE_NAME}=%ZZ` }));
  assert.equal(response.status, 200);
});
