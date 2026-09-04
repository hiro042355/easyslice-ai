import assert from "node:assert/strict";
import test from "node:test";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FirebaseAuthenticationAdapter, projectVerifiedIdentity, type FirebaseCredentialVerifier } from "../../lib/server/productionIdentity/firebaseIdentityAdapter";
import { createAuthenticatedRouteGuard, SESSION_COOKIE_NAME } from "../../lib/server/productionIdentity/routeGuardCore";
import { ownsResource, type JobId, type UserId } from "../../lib/server/productionIdentity/types";
import { validateSameOriginMutation } from "../../lib/server/productionIdentity/sessionSecurity";

const decoded = (overrides: Partial<DecodedIdToken> = {}): DecodedIdToken => ({
  uid: "firebase-user-1", sub: "firebase-user-1", aud: "nexcut-prod-jp-2026",
  iss: "https://securetoken.google.com/nexcut-prod-jp-2026", iat: 10, exp: 20,
  auth_time: 10, firebase: { identities: {}, sign_in_provider: "google.com" }, ...overrides,
});

const verifier = (result: DecodedIdToken | Error): FirebaseCredentialVerifier => ({
  async verifyIdToken() { if (result instanceof Error) throw result; return result; },
  async verifySessionCookie() { if (result instanceof Error) throw result; return result; },
});

test("canonical Firebase uid is projected without trusting client userId", async () => {
  const adapter = new FirebaseAuthenticationAdapter(verifier(decoded()));
  const result = await adapter.authenticate({ inputVersion: "1.0", requestIdentity: "request-1", credentials: [{
    projectionVersion: "1.0", credentialKind: "bearer-reference", presence: "present", opaqueCredentialReference: "opaque-token",
    sourceClassification: "authorization-boundary", issuerClassification: "trusted-external",
  }] });
  assert.equal(result.status, "authenticated");
  if (result.status === "authenticated") assert.equal(result.subject.subjectReference, "firebase-user-1");
  assert.equal(JSON.stringify(result).includes("opaque-token"), false);
});

for (const reason of ["expired", "malformed", "wrong-audience", "wrong-issuer", "revoked"] as const) {
  test(`${reason} credential is safely rejected`, async () => {
    const adapter = new FirebaseAuthenticationAdapter(verifier(new Error(reason)));
    const result = await adapter.authenticate({ inputVersion: "1.0", requestIdentity: "request-1", credentials: [{
      projectionVersion: "1.0", credentialKind: "session-reference", presence: "present", opaqueCredentialReference: "secret",
      sourceClassification: "cookie-boundary", issuerClassification: "trusted-external",
    }] });
    assert.equal(result.status, "rejected");
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });
}

test("route guard rejects anonymous and accepts a verified session", async () => {
  const guard = createAuthenticatedRouteGuard(verifier(decoded()));
  const anonymous = await guard(new Request("https://app.example/api/cut"));
  assert.equal(anonymous.ok, false);
  if (!anonymous.ok) assert.equal(anonymous.response.status, 401);
  const accepted = await guard(new Request("https://app.example/api/cut", { headers: { cookie: `${SESSION_COOKIE_NAME}=opaque` } }));
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.context.identity.userId, "firebase-user-1");
});

test("identity copies are deterministic and isolated from the credential", () => {
  const identity = projectVerifiedIdentity(decoded(), "opaque-token");
  assert.equal(identity.userId, "firebase-user-1");
  assert.equal(identity.sessionId.length, 64);
  assert.equal(identity.issuedAt, 10_000);
  assert.equal(identity.expiresAt, 20_000);
  assert.equal(JSON.stringify(identity).includes("opaque-token"), false);
  assert.equal(Object.isFrozen(identity), true);
});

test("identity timestamps deterministically normalize Firebase epoch seconds once", () => {
  const identity = projectVerifiedIdentity(decoded({ iat: 1_725_000_001, exp: 1_725_003_601 }), "opaque-token");
  assert.equal(identity.issuedAt, 1_725_000_001_000);
  assert.equal(identity.expiresAt, 1_725_003_601_000);
  assert.equal(identity.sessionId, projectVerifiedIdentity(decoded({ iat: 10, exp: 20 }), "opaque-token").sessionId);
});

for (const timestamps of [
  { iat: Number.NaN, exp: 20 },
  { iat: 10.5, exp: 20 },
  { iat: 10, exp: Number.MAX_SAFE_INTEGER },
  { iat: 20, exp: 20 },
  { iat: 21, exp: 20 },
] as const) {
  test(`identity rejects invalid timestamp material ${String(timestamps.iat)}:${String(timestamps.exp)}`, () => {
    assert.throws(() => projectVerifiedIdentity(decoded(timestamps), "opaque-token"), /invalid-identity-timestamp/u);
  });
}

test("route guard fails closed when verified Firebase timestamps are invalid", async () => {
  const guard = createAuthenticatedRouteGuard(verifier(decoded({ iat: 20, exp: 20 })));
  const result = await guard(new Request("https://app.example/api/cut", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=opaque` },
  }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 401);
});

test("ownership requires the verified canonical user", () => {
  const owner = "firebase-user-1" as UserId;
  const resource = Object.freeze({ ownershipVersion: "1.0" as const, userId: owner, jobId: "job-1" as JobId });
  assert.equal(ownsResource(owner, resource), true);
  assert.equal(ownsResource("firebase-user-2" as UserId, resource), false);
});

test("session mutation requires exact same origin", () => {
  assert.equal(validateSameOriginMutation(new Request("https://app.example/api/auth/session", { headers: { origin: "https://app.example" } })), true);
  assert.equal(validateSameOriginMutation(new Request("https://app.example/api/auth/session", { headers: { origin: "https://evil.example" } })), false);
});
