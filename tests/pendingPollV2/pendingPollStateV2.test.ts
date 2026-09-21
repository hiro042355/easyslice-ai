import assert from "node:assert/strict";
import test from "node:test";
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
