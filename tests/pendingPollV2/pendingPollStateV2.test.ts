import assert from "node:assert/strict";
import test from "node:test";
import { omitProperties } from "../../lib/omitProperties";
import type { ResolvedAsset, Sensitive } from "../../lib/assets/types";
import { projectPendingUploadReadyAssetsV2, validatePendingUploadPollStateV2 } from "../../lib/pendingPollV2/pendingPollStateV2";

const completedState = (status: "ready" | "degraded"): unknown => ({
  stateVersion: "2.0",
  planFingerprint: `projection-${status}-plan`,
  providerId: "reference-provider",
  providerApiVersion: "reference-api-v1",
  operation: "generate-vocal",
  items: [
    {
      itemVersion: "2.0",
      itemIndex: 0,
      assetIndex: 0,
      usage: "guide-vocal",
      requirement: "required",
      status: "completed",
      sourceSnapshot: {
        assetRef: { assetId: "ready-asset", kind: "audio", mimeType: "audio/wav" },
        sizeBytes: 1024,
        metadata: { type: "audio", durationPresent: true, dimensionsPresent: false },
        integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true },
      },
      completedAsset: {
        assetRef: { assetId: "ready-asset", kind: "audio", mimeType: "audio/wav" },
        usage: "guide-vocal",
        requirement: "required",
        access: { mode: "provider-native-asset", handle: "ready-handle" },
        sizeBytes: 1024,
        metadata: { type: "audio", durationPresent: true, dimensionsPresent: false },
        integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true },
      },
    },
    ...(status === "degraded" ? [{ itemVersion: "2.0", itemIndex: 1, assetIndex: 1, usage: "guide-melody", requirement: "optional", status: "omitted", sourceSnapshot: { assetRef: { assetId: "omitted-asset", kind: "melody", mimeType: "audio/wav" }, sizeBytes: 512, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } } }] : []),
  ],
  omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" },
  attempt: 1,
  revision: 1,
  stateStatus: status,
  referenceExpiresAt: "2030-01-02T00:00:00.000Z",
  stateExpiresAt: "2030-01-02T00:00:00.000Z",
});

const projectValidated = (raw: unknown) => {
  assert.equal(validatePendingUploadPollStateV2(raw), true);
  if (!validatePendingUploadPollStateV2(raw)) assert.fail("expected valid pending-poll state");
  return projectPendingUploadReadyAssetsV2(raw);
};

test("unknown poll data rejects incomplete nested snapshots and completed access", () => {
  const raw = completedState("ready");
  if (!validatePendingUploadPollStateV2(raw)) assert.fail("invalid canonical fixture");
  const item = raw.items[0];
  if (item.status !== "completed") assert.fail("expected completed fixture");
  const corruptions = [
    { ...item, sourceSnapshot: { ...item.sourceSnapshot, metadata: { type: "audio" } } },
    { ...item, sourceSnapshot: { ...item.sourceSnapshot, integrity: {} } },
    { ...item, sourceSnapshot: { ...item.sourceSnapshot, assetRef: { kind: "audio" } } },
    { ...item, completedAsset: { ...item.completedAsset, access: { mode: "provider-native-asset" } } },
    { ...item, completedAsset: { ...item.completedAsset, metadata: {} } },
  ];
  for (const broken of corruptions) assert.equal(validatePendingUploadPollStateV2({ ...raw, items: [broken] }), false);
  assert.equal(validatePendingUploadPollStateV2(raw), true);
});

test("unknown accepted sessions require the actual session reference and upload mode contract", () => {
  const raw = completedState("ready");
  if (!validatePendingUploadPollStateV2(raw)) assert.fail("invalid canonical fixture");
  const item = raw.items[0];
  const session = { sessionVersion: "1.0", sessionRef: "synthetic-session", providerId: raw.providerId, operation: raw.operation, mode: "single-request", expiresAt: raw.stateExpiresAt };
  const pending = { ...raw, stateStatus: "pending", items: [{ ...omitProperties(item, ["completedAsset"]), status: "accepted", session }] };
  assert.equal(validatePendingUploadPollStateV2(pending), true);
  for (const broken of [{ ...session, sessionRef: undefined }, { ...session, mode: "invented-mode" }, { ...session, expiresAt: "invalid" }]) {
    assert.equal(validatePendingUploadPollStateV2({ ...pending, items: [{ ...pending.items[0], session: broken }] }), false);
  }
});

test("malformed accessor exceptions are rejected without escaping the validation boundary", () => {
  const raw = completedState("ready");
  Object.defineProperty(raw, "items", { get() { throw new Error("synthetic-malformed-accessor"); } });
  assert.doesNotThrow(() => assert.equal(validatePendingUploadPollStateV2(raw), false));
});

test("projects a ready state's completed assets as a Sensitive collection without mutating the state", () => {
  const raw = completedState("ready");
  const before = structuredClone(raw);
  const result = projectValidated(raw);
  assert.equal(result.status, "projected");
  if (result.status !== "projected") assert.fail("expected projected assets");
  const staticallySensitive: Sensitive<readonly ResolvedAsset[]> = result.assets;
  assert.deepEqual(staticallySensitive, [{ assetRef: { assetId: "ready-asset", kind: "audio", mimeType: "audio/wav" }, usage: "guide-vocal", requirement: "required", access: { mode: "provider-native-asset", handle: "ready-handle" }, sizeBytes: 1024, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } }]);
  assert.deepEqual(raw, before);
});

test("preserves degraded projection behavior while returning only completed assets", () => {
  const raw = completedState("degraded");
  const before = structuredClone(raw);
  const result = projectValidated(raw);
  assert.equal(result.status, "projected");
  if (result.status !== "projected") assert.fail("expected degraded projection");
  const staticallySensitive: Sensitive<readonly ResolvedAsset[]> = result.assets;
  assert.equal(staticallySensitive.length, 1);
  assert.deepEqual(raw, before);
});

test("rejects a non-ready state without exposing projected assets", () => {
  const raw = completedState("ready");
  assert.equal(validatePendingUploadPollStateV2(raw), true);
  if (!validatePendingUploadPollStateV2(raw)) assert.fail("expected valid pending-poll state");
  const nonReady = { ...raw, stateStatus: "pending" as const };
  const result = projectPendingUploadReadyAssetsV2(nonReady);
  assert.equal(result.status, "invalid");
  assert.equal("assets" in result, false);
});
