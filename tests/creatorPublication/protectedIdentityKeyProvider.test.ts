import assert from "node:assert/strict";
import test from "node:test";
import { createProtectedIdentityProjectorV1, CREATOR_PUBLICATION_IDENTITY_DOMAINS, equalCreatorPublicationProtectedIdentityV1, type ProtectedIdentityKeyReferenceV1 } from "../../lib/server/creatorPublicationIdentity";
import { createDeterministicTestKeyProviderV1 } from "../../lib/server/creatorPublicationIdentity/testing/deterministicTestKeyProvider";

const ref = (version: string): ProtectedIdentityKeyReferenceV1 => Object.freeze({ referenceVersion: "1.0", provider: "test-only", keyId: "creator-publication", keyVersion: version, algorithmVersion: 1 });
const oldRef = ref("2026-01"), activeRef = ref("2026-08");
const oldKey = new Uint8Array(32).fill(17), activeKey = new Uint8Array(32).fill(29);
const provider = createDeterministicTestKeyProviderV1(activeRef, [{ reference: oldRef, keyBytes: oldKey }, { reference: activeRef, keyBytes: activeKey }]);
const projector = createProtectedIdentityProjectorV1(provider);
const input = (domain: typeof CREATOR_PUBLICATION_IDENTITY_DOMAINS[number], keyReference?: ProtectedIdentityKeyReferenceV1) => Object.freeze({ inputVersion: "1.0" as const, domain, encodingVersion: "1.0" as const, algorithmVersion: 1 as const, canonicalBytes: new TextEncoder().encode("7:creator5:clip"), ...(keyReference === undefined ? {} : { keyReference }) });

test("active projection is deterministic, versioned, secret-free and domain separated", async () => {
  const first = await projector.project(input("generated-clip/v1"));
  const second = await projector.project(input("generated-clip/v1"));
  const other = await projector.project(input("prediction/v1"));
  assert.equal(first.status, "success"); assert.equal(second.status, "success"); assert.equal(other.status, "success");
  if (first.status !== "success" || second.status !== "success" || other.status !== "success") return;
  assert.equal(equalCreatorPublicationProtectedIdentityV1(first.identity, second.identity), true);
  assert.equal(equalCreatorPublicationProtectedIdentityV1(first.identity, other.identity), false);
  assert.equal(first.identity.keyReference.keyVersion, "2026-08");
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /creator5:clip|29,29,29|keyBytes|secret|credential/i);
});

test("historical reference remains exact after active rotation and is never substituted", async () => {
  const historical = await projector.project(input("publication-command/v1", oldRef));
  const active = await projector.project(input("publication-command/v1"));
  assert.equal(historical.status, "success"); assert.equal(active.status, "success");
  if (historical.status !== "success" || active.status !== "success") return;
  assert.equal(historical.identity.keyReference.keyVersion, "2026-01");
  assert.equal(active.identity.keyReference.keyVersion, "2026-08");
  assert.equal(equalCreatorPublicationProtectedIdentityV1(historical.identity, active.identity), false);
});

test("missing and unavailable historical references fail closed without fallback", async () => {
  const missing = await projector.project(input("principal/v1", Object.freeze({ ...oldRef, keyId: "missing" })));
  const unavailable = await projector.project(input("principal/v1", ref("2025-01")));
  assert.deepEqual(missing, { resultVersion: "1.0", status: "failure", code: "key-not-found", safeReason: "key-not-found", keyReference: { ...oldRef, keyId: "missing" } });
  assert.equal(unavailable.status, "failure");
  if (unavailable.status === "failure") assert.equal(unavailable.code, "key-version-unavailable");
});

test("projector calls provider exactly once and copy-isolates input and output", async () => {
  let calls = 0;
  const counting = Object.freeze({ providerVersion: "1.0" as const, project: async (value: Parameters<typeof provider.project>[0]) => { calls += 1; return provider.project(value); } });
  const bytes = new TextEncoder().encode("stable");
  const result = await createProtectedIdentityProjectorV1(counting).project(Object.freeze({ ...input("source-artifact/v1"), canonicalBytes: bytes }));
  bytes.fill(0);
  assert.equal(calls, 1); assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const before = new Uint8Array(result.identity.digest);
  result.identity.digest.fill(0);
  const again = await createProtectedIdentityProjectorV1(provider).project(Object.freeze({ ...input("source-artifact/v1"), canonicalBytes: new TextEncoder().encode("stable") }));
  assert.equal(again.status, "success");
  if (again.status === "success") assert.deepEqual(again.identity.digest, before);
});

test("unknown domain, unsupported version and non-test references are rejected", async () => {
  const badDomain = await projector.project({ ...input("principal/v1"), domain: "arbitrary/v1" as never });
  const badVersion = await projector.project({ ...input("principal/v1"), algorithmVersion: 2 as never });
  const badProvider = await projector.project(input("principal/v1", Object.freeze({ ...activeRef, provider: "production" })));
  assert.equal(badDomain.status, "failure"); assert.equal(badVersion.status, "failure"); assert.equal(badProvider.status, "failure");
});

test("test provider is isolated from Production exports and source has no environment access", async () => {
  const production = await import("../../lib/server/creatorPublicationIdentity");
  assert.equal("createDeterministicTestKeyProviderV1" in production, false);
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../../lib/server/creatorPublicationIdentity/projector.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /process\.env|keyBytes|createHmac|secret manager|KMS client/i);
});
