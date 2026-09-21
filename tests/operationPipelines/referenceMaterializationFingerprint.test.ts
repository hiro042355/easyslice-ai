import assert from "node:assert/strict";
import test from "node:test";
import type { OperationAdapterRequest } from "../../lib/operationPipelines/referenceOperationResumeTypes";
import { createReferenceMaterializationFingerprint } from "../../lib/operationPipelines/referenceMaterializationFingerprint";
import { musicRequest, mvRequest, vocalRequest } from "../materializers/materializerTestFixtures";

const operationFor = (request: OperationAdapterRequest) =>
  "language" in request ? "generate-vocal" as const : "tempo" in request ? "generate-music" as const : "generate-mv" as const;

const fingerprint = (request: OperationAdapterRequest) => createReferenceMaterializationFingerprint({
  operation: operationFor(request),
  adapterRequest: request,
  readyAssets: [],
  materializedBody: { outputFormat: request.outputFormat },
  pollRevision: 1,
  materializerBindingId: `reference-${operationFor(request).replace("generate-", "")}-resume-pipeline-v1`,
  materializerBindingVersion: "reference-v1",
  providerId: "reference-provider",
  providerApiVersion: "reference-api-v1",
  baselineTime: "2030-01-01T00:00:00.000Z",
});

test("accepts each canonical operation adapter request", () => {
  const requests: readonly OperationAdapterRequest[] = [vocalRequest(), musicRequest(), mvRequest()];
  for (const request of requests) assert.match(fingerprint(request), /^materialization-v1:[0-9a-f]{64}$/);
});

test("is deterministic for structurally equivalent canonical input", () => {
  const original: OperationAdapterRequest = musicRequest();
  const equivalent: OperationAdapterRequest = structuredClone(original);
  assert.equal(fingerprint(original), fingerprint(equivalent));
});

test("changes when a canonical semantic request field changes", () => {
  const original = vocalRequest();
  const changed: OperationAdapterRequest = { ...original, durationSeconds: original.durationSeconds + 1 };
  assert.notEqual(fingerprint(original), fingerprint(changed));
});

test("excludes canonical MV scene assetIds and returns only a safe digest", () => {
  const original = mvRequest();
  const changed: OperationAdapterRequest = {
    ...original,
    scenes: original.scenes.map((scene, index) => index === 0 ? { ...scene, assetIds: ["private-asset-id"] } : scene),
  };
  const originalFingerprint = fingerprint(original);
  const changedFingerprint = fingerprint(changed);
  assert.equal(originalFingerprint, changedFingerprint);
  assert.match(changedFingerprint, /^materialization-v1:[0-9a-f]{64}$/);
  assert.doesNotMatch(changedFingerprint, /private-asset-id|credential|endpoint|https?:|token|handle|storage/i);
});
