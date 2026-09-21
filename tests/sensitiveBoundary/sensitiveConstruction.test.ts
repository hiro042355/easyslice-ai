import assert from "node:assert/strict";
import test from "node:test";
import {
  createSensitiveCanonicalMusicWorkflowInput,
  createSensitiveCanonicalMVWorkflowInput,
  createSensitiveReadyAssetsCollection,
  createSensitiveCanonicalVocalWorkflowInput,
} from "@/lib/sensitiveBoundary/createSensitiveWorkflowFixtureInput";
import type { ResolvedAsset, Sensitive } from "@/lib/assets/types";
import { validatePendingUploadPollStateV2 } from "@/lib/pendingPollV2/pendingPollStateV2";
import { musicInput, mvInput, vocalInput } from "./fixture";

test("operation-specific factories validate, copy, and mark all workflow inputs", () => {
  const cases = [
    [vocalInput(), createSensitiveCanonicalVocalWorkflowInput],
    [musicInput(), createSensitiveCanonicalMusicWorkflowInput],
    [mvInput(), createSensitiveCanonicalMVWorkflowInput],
  ] as const;
  for (const [input, factory] of cases) {
    const before = structuredClone(input);
    const result = Reflect.apply(factory, undefined, [input]);
    assert.equal(result.status, "created");
    assert.deepEqual(input, before);
    if (result.status === "created") {
      assert.deepEqual(result.value, input);
      assert.notEqual(result.value, input);
      assert.equal(Object.getOwnPropertySymbols(result.value).length, 0);
    }
  }
});

test("200,001 distinct operation reference boundary assertions", () => {
  const input = vocalInput();
  for (let length = 0; length <= 200_000; length += 1) {
    input.context.operationRef = length <= 128
      ? "x".repeat(length)
      : `${length}:`.padEnd(129 + String(length).length, "x");
    const result = createSensitiveCanonicalVocalWorkflowInput(input);
    assert.equal(result.status, length >= 1 && length <= 128 ? "created" : "invalid");
  }
});

const validatedReadyAsset = (): Sensitive<ResolvedAsset> => {
  const state: unknown = {
    stateVersion: "2.0", planFingerprint: "sensitive-ready-assets", providerId: "reference-provider",
    providerApiVersion: "reference-api-v1", operation: "generate-vocal",
    items: [{ itemVersion: "2.0", itemIndex: 0, assetIndex: 0, usage: "guide-vocal", requirement: "required", status: "completed",
      sourceSnapshot: { assetRef: { assetId: "ready-asset", kind: "audio", mimeType: "audio/wav" }, sizeBytes: 1024, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } },
      completedAsset: { assetRef: { assetId: "ready-asset", kind: "audio", mimeType: "audio/wav" }, usage: "guide-vocal", requirement: "required", access: { mode: "provider-native-asset", handle: "ready-handle" }, sizeBytes: 1024, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } } }],
    omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" },
    attempt: 1, revision: 1, stateStatus: "ready", referenceExpiresAt: "2030-01-02T00:00:00.000Z", stateExpiresAt: "2030-01-02T00:00:00.000Z",
  };
  assert.equal(validatePendingUploadPollStateV2(state), true);
  if (!validatePendingUploadPollStateV2(state)) assert.fail("expected valid pending-poll state");
  const item = state.items[0];
  if (item.status !== "completed") assert.fail("expected completed item");
  return item.completedAsset;
};

test("ready-assets factory validates and shallow-copies the collection while preserving elements", () => {
  const asset = validatedReadyAsset();
  const input: readonly Sensitive<ResolvedAsset>[] = [asset];
  const result = createSensitiveReadyAssetsCollection(input);
  assert.equal(result.status, "created");
  if (result.status !== "created") assert.fail("expected created ready-assets collection");
  const staticallySensitive: Sensitive<readonly ResolvedAsset[]> = result.value;
  assert.notEqual(staticallySensitive, input);
  assert.equal(staticallySensitive[0], asset);
  assert.deepEqual(staticallySensitive, input);
});

test("ready-assets factory rejects malformed runtime input without exposing it", () => {
  const malformed = { secret: "must-not-escape" };
  const result = Reflect.apply(createSensitiveReadyAssetsCollection, undefined, [[malformed]]);
  assert.deepEqual(result, { status: "invalid", issues: [{ reasonCode: "sensitive-construction-invalid" }] });
  assert.doesNotMatch(JSON.stringify(result), /must-not-escape/);
});

const validReadyAssetRuntimeValue = () => ({
  assetRef: { assetId: "runtime-ready-asset", kind: "audio", mimeType: "audio/wav" },
  usage: "guide-vocal",
  requirement: "required",
  access: { mode: "provider-native-asset", handle: "runtime-ready-handle" },
  sizeBytes: 1024,
  metadata: { type: "audio", durationPresent: true, dimensionsPresent: false },
  integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true },
});

const expectInvalidReadyAssets = (candidates: readonly unknown[]) => {
  for (const candidate of candidates) {
    const result = Reflect.apply(createSensitiveReadyAssetsCollection, undefined, [[candidate]]);
    assert.deepEqual(result, { status: "invalid", issues: [{ reasonCode: "sensitive-construction-invalid" }] });
  }
};

test("ready-assets factory rejects invalid AssetReference kind and optional field types", () => {
  const valid = validReadyAssetRuntimeValue();
  expectInvalidReadyAssets([
    { ...valid, assetRef: { ...valid.assetRef, kind: "document" } },
    { ...valid, assetRef: { ...valid.assetRef, mimeType: 42 } },
  ]);
});

test("ready-assets factory rejects unsupported AssetUsage values", () => {
  expectInvalidReadyAssets([{ ...validReadyAssetRuntimeValue(), usage: "unsupported-usage" }]);
});

test("ready-assets factory rejects malformed ResolvedAssetAccess variants", () => {
  const valid = validReadyAssetRuntimeValue();
  expectInvalidReadyAssets([
    { ...valid, access: { mode: "unsupported" } },
    { ...valid, access: { mode: "signed-url", expiresAt: "2030-01-01T00:00:00.000Z" } },
    { ...valid, access: { mode: "internal-stream", streamToken: 42, expiresAt: "2030-01-01T00:00:00.000Z" } },
    { ...valid, access: { mode: "provider-native-asset", handle: "handle", expiresAt: 42 } },
  ]);
});

test("ready-assets factory rejects malformed ResolvedAssetMetadata", () => {
  const valid = validReadyAssetRuntimeValue();
  expectInvalidReadyAssets([
    { ...valid, metadata: { ...valid.metadata, type: "document" } },
    { ...valid, metadata: { ...valid.metadata, durationPresent: "yes" } },
    { ...valid, metadata: { ...valid.metadata, dimensionsPresent: 1 } },
  ]);
});

test("ready-assets factory rejects malformed ResolvedAssetIntegrity", () => {
  const valid = validReadyAssetRuntimeValue();
  expectInvalidReadyAssets([
    { ...valid, integrity: { ...valid.integrity, checksumVerified: "yes" } },
    { ...valid, integrity: { ...valid.integrity, checksumAlgorithm: "md5" } },
    { ...valid, integrity: { ...valid.integrity, sizeVerified: 1 } },
  ]);
});
