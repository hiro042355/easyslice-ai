import assert from "node:assert/strict";
import test from "node:test";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  authorizeBetaUid,
  parseBetaAllowedUids,
  requireBetaAuthorization,
} from "../../lib/server/productionIdentity/betaAuthorization";
import {
  createAuthenticatedRouteGuard,
  SESSION_COOKIE_NAME,
} from "../../lib/server/productionIdentity/routeGuardCore";
import type { UserId } from "../../lib/server/productionIdentity/types";

const ownerUid = "firebase-owner-uid" as UserId;
const otherUid = "firebase-other-uid" as UserId;

test("missing and empty allowlists deny", () => {
  assert.equal(authorizeBetaUid(ownerUid, undefined), "denied");
  assert.equal(authorizeBetaUid(ownerUid, ""), "denied");
  assert.equal(authorizeBetaUid(ownerUid, "firebase-owner-uid,"), "denied");
});

test("canonical UID comparison is exact", () => {
  assert.equal(authorizeBetaUid(ownerUid, "firebase-owner-uid"), "allowed");
  assert.equal(authorizeBetaUid(otherUid, "firebase-owner-uid"), "denied");
  assert.equal(authorizeBetaUid(ownerUid, "FIREBASE-OWNER-UID"), "denied");
});

test("whitespace normalization and multiple approved UIDs are supported", () => {
  const parsed = parseBetaAllowedUids(" firebase-owner-uid, firebase-other-uid ");
  assert.deepEqual([...parsed], ["firebase-owner-uid", "firebase-other-uid"]);
  assert.equal(authorizeBetaUid(otherUid, " firebase-owner-uid, firebase-other-uid "), "allowed");
});

const decoded = (uid: string): DecodedIdToken => ({
  uid,
  sub: uid,
  aud: "nexcut-prod-jp-2026",
  iss: "https://securetoken.google.com/nexcut-prod-jp-2026",
  iat: 10,
  exp: 20,
  auth_time: 10,
  firebase: { identities: {}, sign_in_provider: "google.com" },
});

test("authenticated but unauthorized Cut request is rejected", async () => {
  const guard = createAuthenticatedRouteGuard({
    async verifyIdToken() { return decoded(ownerUid); },
    async verifySessionCookie() { return decoded(ownerUid); },
  });
  const authenticated = await guard(new Request("https://www.nexcutai.com/api/cut", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=opaque` },
  }));
  const result = requireBetaAuthorization(authenticated, "firebase-other-uid");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 403);
});

test("authorized canonical UID admits Cut request", async () => {
  const guard = createAuthenticatedRouteGuard({
    async verifyIdToken() { return decoded(ownerUid); },
    async verifySessionCookie() { return decoded(ownerUid); },
  });
  const authenticated = await guard(new Request("https://www.nexcutai.com/api/cut", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=opaque`, "x-user-id": otherUid },
  }));
  const result = requireBetaAuthorization(authenticated, ownerUid);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.context.identity.userId, ownerUid);
});

test("client-supplied userId cannot bypass canonical UID authorization", async () => {
  const guard = createAuthenticatedRouteGuard({
    async verifyIdToken() { return decoded(otherUid); },
    async verifySessionCookie() { return decoded(otherUid); },
  });
  const authenticated = await guard(new Request("https://www.nexcutai.com/api/cut?userId=firebase-owner-uid", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=opaque`, "x-user-id": ownerUid },
  }));
  const result = requireBetaAuthorization(authenticated, ownerUid);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 403);
});
