import assert from "node:assert/strict";
import test from "node:test";
import { asset, musicRequest, mvRequest, vocalRequest } from "../materializers/materializerTestFixtures";
import { ReferenceRestrictedAdapterRequestResolver } from "../../lib/operationPipelines/referenceRestrictedAdapterRequestResolver";
import { createReferenceVocalResumePipeline } from "../../lib/operationPipelines/referenceVocalResumePipeline";
import { createReferenceMusicResumePipeline } from "../../lib/operationPipelines/referenceMusicResumePipeline";
import { createReferenceMVResumePipeline } from "../../lib/operationPipelines/referenceMVResumePipeline";

const BASELINE = "2030-01-01T00:00:00.000Z";
const operations = [
  { operation: "generate-vocal", bindingId: "reference-vocal-resume-pipeline-v1", adapterId: "reference-vocal-v1", request: { ...vocalRequest(), durationSeconds: 10, timeline: [{ ...vocalRequest().timeline[0], endSeconds: 10 }] }, create: createReferenceVocalResumePipeline, assets: [] },
  { operation: "generate-music", bindingId: "reference-music-resume-pipeline-v1", adapterId: "reference-music-v1", request: { ...musicRequest(), durationSeconds: 20, outputFormat: "mp3", timeline: [{ ...musicRequest().timeline[0], endSeconds: 20 }] }, create: createReferenceMusicResumePipeline, assets: [] },
  { operation: "generate-mv", bindingId: "reference-mv-resume-pipeline-v1", adapterId: "reference-mv-v1", request: mvRequest(), create: createReferenceMVResumePipeline, assets: [asset("audio-1", "audio-conditioning", "audio", { mode: "provider-native-asset", handle: "opaque-audio" }, "required")] },
] as const;

const input = (entry: typeof operations[number], pollStatus: "ready" | "degraded" = "ready") => ({
  contractVersion: "1.0", operation: entry.operation, restrictedPayloadRef: `payload-${entry.operation}`,
  readyAssets: entry.assets, pollStatus, pollRevision: 1, bindingId: entry.bindingId,
  generationClientBindingId: "reference-provider-client-v1",
  context: { contextVersion: "1.0", baselineTime: BASELINE, attempt: 1, operationRef: `operation-${entry.operation}`, materializationIdempotencyKeyRef: `materialize-${entry.operation}`, generationIdempotencyKeyRef: `generate-${entry.operation}`, outputIngestionIdempotencyKeyRef: `ingest-${entry.operation}` },
  authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "region", operation: entry.operation, permission: "execute-operation-resume-pipeline", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
} as const);

const configured = (entry: typeof operations[number]) => {
  const resolver = new ReferenceRestrictedAdapterRequestResolver();
  assert.deepEqual(resolver.register({ recordVersion: "1.0", operation: entry.operation, adapterId: entry.adapterId, adapterVersion: "1.0.0", requestSchemaVersion: "1.0", fingerprint: "safe", tenantRef: "tenant", region: "region", expiresAt: "2031-01-01T00:00:00.000Z", deletionState: "active", legalHold: false, payloadRef: `payload-${entry.operation}` }, entry.request as never), { status: "registered" });
  return entry.create(resolver);
};

test("executes ready Reference resume pipelines for vocal, music, and mv", async () => {
  for (const entry of operations) {
    const result = await configured(entry).execute(input(entry) as never);
    assert.equal(result.status, "completed", entry.operation);
    if (result.status === "completed") assert.equal(result.assets.length, 1);
    assert.equal("cancelled" in result, false);
  }
});

test("degraded input fails closed without fabricated omission data", async () => {
  const entry = operations[1];
  const result = await configured(entry).execute(input(entry, "degraded") as never);
  assert.equal(result.status, "failed");
  assert.match(JSON.stringify(result), /ready-asset-projection-failed/);
  assert.doesNotMatch(JSON.stringify(result), /omittedCount|missingAsset|assetUrl|storageKey/);
});

test("preserves resolver lifecycle and authorization distinctions", async () => {
  const entry = operations[1];
  const statuses = ["missing", "expired", "unauthorized", "deleted", "schema-mismatch", "adapter-mismatch", "operation-mismatch", "failed"] as const;
  for (const status of statuses) {
    const pipeline = entry.create({ register: () => ({ status: "registered" }), resolve: async () => ({ status }) } as never);
    const result = await pipeline.execute(input(entry) as never);
    assert.equal(result.status, "failed");
    assert.equal(result.audit.reasonCodes.length, 1);
  }
});

test("rejects caller-selected operation and binding mismatches before provider execution", async () => {
  const entry = operations[0];
  const pipeline = configured(entry);
  const result = await pipeline.execute({ ...input(entry), bindingId: "caller-runtime" } as never);
  assert.equal(result.status, "failed");
  assert.match(JSON.stringify(result), /adapter-request-operation-mismatch/);
});
