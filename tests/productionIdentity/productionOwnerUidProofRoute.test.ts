import assert from "node:assert/strict";
import test from "node:test";
import { createProductionOwnerUidProofRoute } from "../../app/api/internal/production-owner-uid-proof/route";
import { isProductionOwner, parseProductionOwnerUid } from "../../lib/server/productionIdentity/productionOwnerAuthority";
import type { UserId } from "../../lib/server/productionIdentity/types";

const ownerUid = "firebase-owner-uid" as UserId;
const otherUid = "firebase-beta-uid" as UserId;

const identity = (userId: UserId) => Object.freeze({
  ok: true as const,
  context: Object.freeze({
    contextVersion: "1.0" as const,
    requestId: "request-id",
    identity: Object.freeze({
      identityVersion: "1.0" as const,
      userId,
      providerSubject: userId,
      sessionId: "session-id" as never,
      issuedAt: 1,
      expiresAt: 2,
    }),
  }),
  credentialKind: "session-cookie" as const,
});

const request = (input: Readonly<{
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}> = {}) => new Request("https://nexcut.example/api/internal/production-owner-uid-proof", {
  method: input.method ?? "POST",
  headers: { origin: "https://nexcut.example", ...input.headers },
  ...(input.method === "GET" || input.body === undefined ? {} : { body: input.body }),
  ...(input.body instanceof ReadableStream ? { duplex: "half" } as RequestInit : {}),
});

const harness = (input: Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  authentication?: ReturnType<typeof identity> | Readonly<{ ok: false; response: Response }>;
}> = {}) => {
  let authenticationCalls = 0;
  const execute = createProductionOwnerUidProofRoute({
    environment: input.environment ?? { VERCEL_ENV: "production", NEXCUT_PRODUCTION_OWNER_UID: ownerUid },
    async authenticate() {
      authenticationCalls += 1;
      return input.authentication ?? identity(ownerUid);
    },
  });
  return { execute, authenticationCalls: () => authenticationCalls };
};

const payload = (response: Response): Promise<Record<string, unknown>> => response.json();
const assertNoStore = (response: Response) => assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");

test("canonical Owner UID parsing accepts one bounded Firebase UID and fails closed otherwise", () => {
  assert.equal(parseProductionOwnerUid(ownerUid), ownerUid);
  assert.equal(isProductionOwner(ownerUid, ownerUid), true);
  assert.equal(isProductionOwner(otherUid, ownerUid), false);
  for (const value of [undefined, "", " ", " owner", "owner ", "owner,other", "x".repeat(129)]) {
    assert.equal(parseProductionOwnerUid(value), undefined);
  }
  assert.equal(parseProductionOwnerUid("x".repeat(128)), "x".repeat(128));
});

test("method, fixed body, chunked body, origin, and production gates precede authentication", async () => {
  const chunked = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("x")); controller.close(); } });
  const cases = [
    request({ method: "GET" }),
    request({ body: "x", headers: { "content-length": "1" } }),
    request({ body: chunked }),
    request({ headers: { origin: "https://other.example" } }),
    new Request("https://nexcut.example/api/internal/production-owner-uid-proof", { method: "POST" }),
  ];
  for (const candidate of cases) {
    const fixture = harness();
    const response = await fixture.execute(candidate);
    assert.ok([400, 403, 405].includes(response.status));
    assertNoStore(response);
    assert.equal(fixture.authenticationCalls(), 0);
  }
  const fixture = harness({ environment: { VERCEL_ENV: "preview", NEXCUT_PRODUCTION_OWNER_UID: ownerUid } });
  assert.equal((await fixture.execute(request())).status, 404);
  assert.equal(fixture.authenticationCalls(), 0);
});

test("authentication, beta denial, non-Owner, and invalid authority fail closed without membership disclosure", async () => {
  const unauthenticated = harness({ authentication: { ok: false, response: new Response(null, { status: 401 }) } });
  const unauthenticatedResponse = await unauthenticated.execute(request());
  assert.equal(unauthenticatedResponse.status, 401);
  assert.deepEqual(await payload(unauthenticatedResponse), { status: "rejected", errorCode: "authentication-required" });

  const closedPayloads: Record<string, unknown>[] = [];
  for (const fixture of [
    harness({ authentication: { ok: false, response: new Response(null, { status: 403 }) } }),
    harness({ authentication: identity(otherUid) }),
    harness({ environment: { VERCEL_ENV: "production" } }),
    harness({ environment: { VERCEL_ENV: "production", NEXCUT_PRODUCTION_OWNER_UID: "owner,other" } }),
  ]) {
    const response = await fixture.execute(request());
    assert.equal(response.status, 404);
    assertNoStore(response);
    closedPayloads.push(await payload(response));
  }
  for (const value of closedPayloads) {
    assert.deepEqual(value, { status: "rejected", errorCode: "owner-proof-unavailable" });
  }
});

test("only the exact verified Owner receives a closed no-store proof", async () => {
  const fixture = harness();
  const response = await fixture.execute(request({
    headers: { "x-user-id": otherUid, "x-user-email": "other@example.com", "x-user-claim": "owner" },
  }));
  assert.equal(response.status, 200);
  assertNoStore(response);
  assert.deepEqual(await payload(response), { proofVersion: "1.0", status: "verified", uid: ownerUid });
  assert.equal(fixture.authenticationCalls(), 1);
});

test("proof surface has no Worker, provider, GCS, validation, or sensitive projection capability", async () => {
  const response = await harness().execute(request());
  const serialized = JSON.stringify(await payload(response));
  assert.doesNotMatch(serialized, /email|display|claim|token|cookie|authorization|allowlist|credential|secret/i);
  const keys = Object.keys(JSON.parse(serialized) as Record<string, unknown>).sort();
  assert.deepEqual(keys, ["proofVersion", "status", "uid"]);
});
