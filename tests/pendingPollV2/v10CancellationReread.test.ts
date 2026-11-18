import test from "node:test";
import assert from "node:assert/strict";
import type { Sensitive } from "../../lib/assets/types";
import type { PendingUploadPollV2Input, PendingUploadPollV2StoreResult } from "../../lib/pendingPollV2/types";
import { validatePendingUploadPollStateV2 } from "../../lib/pendingPollV2/pendingPollStateV2";
import { ReferencePendingPollV2Store, ReferenceActivePollReferenceResolver } from "../../lib/pendingPollV2/referencePendingPollV2Store";
import { ReferencePendingPollV2IdempotencyStore } from "../../lib/pendingPollV2/referencePendingPollV2IdempotencyStore";
import { createReferencePendingPollV2Executor } from "../../lib/pendingPollV2/referencePendingPollV2Executor";

type FixtureData<T> = T extends Sensitive<string> ? string : T extends readonly (infer Item)[] ? readonly FixtureData<Item>[] : T extends object ? { [Key in keyof T as Key extends symbol ? never : Key]: FixtureData<T[Key]> } : T;
// Only synthetic confidentiality labels; never a production authority constructor.
const fixture = <T>(value: FixtureData<T>): T => structuredClone(value) as T;
for (const corruptReread of [false, true]) test("cancellation reread remains fail-closed: " + corruptReread, async () => {
  const expiresAt = "2031-01-01T00:00:00.000Z";
  const state: unknown = {
    stateVersion: "2.0", planFingerprint: "synthetic-plan", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal",
    items: [{ itemVersion: "2.0", itemIndex: 0, assetIndex: 0, usage: "guide-vocal", requirement: "required", status: "accepted",
      sourceSnapshot: { assetRef: { assetId: "synthetic-audio", kind: "audio", mimeType: "audio/wav" }, sizeBytes: 1024, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } },
      session: { sessionVersion: "1.0", sessionRef: "synthetic-session", providerId: "reference-provider", operation: "generate-vocal", mode: "single-request", expiresAt } }],
    omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" },
    attempt: 1, revision: 1, stateStatus: "pending", referenceExpiresAt: expiresAt, stateExpiresAt: expiresAt,
  };
  assert.ok(validatePendingUploadPollStateV2(state));
  const store = new ReferencePendingPollV2Store();
  const created = await store.create("synthetic-state", state);
  if (created.status !== "created") assert.fail("fixture not created");
  const input = fixture<PendingUploadPollV2Input>({
    contractVersion: "1.0", pendingReference: { referenceVersion: "1.0", kind: "provider-upload", pendingRef: "synthetic-reference" },
    context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, correlationRef: "synthetic-correlation", pollIdempotencyKeyRef: "synthetic-idempotency", cancellationRequested: true, operation: "generate-vocal" },
    authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "synthetic-tenant", region: "synthetic-region", operation: "generate-vocal", permission: "poll-provider-upload", workflowOwnershipVerified: true },
  });
  const resolver = new ReferenceActivePollReferenceResolver();
  resolver.register(input.pendingReference, { key: created.key, status: "active", expiresAt, tenantRef: input.authorization.tenantRef, region: input.authorization.region, operation: "generate-vocal" });
  const read = store.readByInternalKey.bind(store);
  let reads = 0, providerCalls = 0;
  store.readByInternalKey = async (key): Promise<PendingUploadPollV2StoreResult> => {
    const value = await read(key);
    reads++;
    return corruptReread && reads === 2 && value.status === "found" ? { ...value, state: { ...value.state, stateStatus: "pending" } } : value;
  };
  const executor = createReferencePendingPollV2Executor({
    resolver, store, idempotency: new ReferencePendingPollV2IdempotencyStore(), minimumHandleLifetimeSeconds: 120,
    checkResumeDependencies: () => "available",
    client: { poll: async (): Promise<never> => { providerCalls++; throw new Error("unexpected-provider-poll"); } },
  });
  const result = await executor.execute(input);
  assert.equal(result.status, corruptReread ? "failed" : "cancelled");
  assert.notEqual(result.status, "pending");
  assert.equal(providerCalls, 0);
  const persisted = await read(created.key);
  assert.equal(persisted.status, "found");
  if (persisted.status === "found") assert.equal(persisted.state.stateStatus, "cancelled");
});
