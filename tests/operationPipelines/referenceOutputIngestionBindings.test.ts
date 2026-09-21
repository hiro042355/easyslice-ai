import assert from "node:assert/strict";
import test from "node:test";
import { projectReadyAssetsToMaterializerResolution } from "../../lib/operationPipelines/operationPipelineUtils";
import { createBoundOperationPipeline } from "../../lib/operationPipelines/referenceOutputIngestionBindings";
import { ReferenceContentInspector } from "../../lib/outputIngestion/referenceContentInspector";
import { ReferenceOutputFetcher } from "../../lib/outputIngestion/referenceOutputFetcher";
import { ReferenceOutputIngestionExecutor, type ReferenceOutputIngestionDependencies } from "../../lib/outputIngestion/referenceOutputIngestion";
import { ReferencePersistenceAssetStoreV2 } from "../../lib/outputIngestion/referencePersistenceAssetStoreV2";
import { ReferencePersistenceCleanupV2 } from "../../lib/outputIngestion/referencePersistenceCleanupV2";
import { ReferencePersistenceJournalV2 } from "../../lib/outputIngestion/referencePersistenceJournalV2";
import { ReferencePersistenceProvenanceV2 } from "../../lib/outputIngestion/referencePersistenceProvenanceV2";
import { ReferencePersistenceRegistryV2 } from "../../lib/outputIngestion/referencePersistenceRegistryV2";
import { ReferenceRegistry } from "../../lib/outputIngestion/referenceRegistry";
import { ReferenceSanitizer, ReferenceScanner } from "../../lib/outputIngestion/referenceScanner";
import type { AssetStoreWriterV2 } from "../../lib/outputIngestion/types";

const asset = { assetRef: { assetId: "asset-1", kind: "audio" }, usage: "audio-conditioning", requirement: "required", access: { mode: "provider-native-asset", handle: "opaque-handle" }, sizeBytes: 10, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, sizeVerified: true } };

test("projects authoritative ready assets without fabricating omission data", () => {
  const result = projectReadyAssetsToMaterializerResolution({ projectionVersion: "1.0", operation: "generate-music", pollStatus: "ready", pollRevision: 1, assets: [asset] } as never);
  assert.equal(result.status, "projected");
  if (result.status !== "projected") return;
  assert.equal(result.resolution.status, "resolved");
  assert.equal(result.resolution.audit.omittedCount, 0);
  assert.equal(result.resolution.assets[0]?.assetRef.assetId, "asset-1");
});

test("fails closed for degraded projection without omission guesses", () => {
  const result = projectReadyAssetsToMaterializerResolution({ projectionVersion: "1.0", operation: "generate-music", pollStatus: "degraded", pollRevision: 1, assets: [asset] } as never);
  assert.equal(result.status, "unsupported-degraded");
  assert.equal("resolution" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /omittedCount|asset-1|opaque-handle/);
});

const binding = {
  bindingVersion: "1.0",
  operation: "generate-music",
  adapterId: "reference-music-v1",
  adapterVersion: "1.0.0",
  materializerId: "reference-music-materializer-v1",
  materializerVersion: "reference-v1",
  providerClientId: "reference-provider-client-v1",
  providerClientVersion: "1.0.0",
  providerId: "reference-provider",
  providerApiVersion: "reference-api-v1",
  normalizerId: "reference-music-v1",
  normalizerVersion: "1.0.0",
  outputIngestionId: "reference-output-ingestion-v1",
  restoreAdapterRequest: async () => ({
    status: "resolved",
    request: { requestSchemaVersion: "1.0", durationSeconds: 20, outputFormat: "mp3" },
  }),
  materialize: () => ({
    status: "materialized",
    request: {
      requestVersion: "1.0",
      providerId: "reference-provider",
      providerApiVersion: "reference-api-v1",
      operation: "generate-music",
      body: { durationSeconds: 20, outputFormat: "mp3" },
      assetAccessCount: 0,
      materialization: { status: "complete", unresolvedAssetCount: 0 },
    },
    audit: { omittedCount: 0 },
  }),
  bridgeToClientBody: (request: { body: unknown }) => ({
    status: "bridged",
    body: {
      bodyVersion: "1.0",
      operation: "generate-music",
      materializedRequest: request.body,
      transportSummary: {
        operationPayloadVersion: "1.0",
        payloadKind: "music",
        inputAssetCount: 0,
        outputFormat: "mp3",
        durationClass: "medium",
        timelineCount: 0,
        sceneCount: 0,
      },
    },
  }),
  bridgeResponse: (response: unknown) => response,
  normalize: () => ({
    resultSchemaVersion: "1.0",
    status: "completed",
    providerId: "reference-music",
    adapterId: "reference-music-v1",
    adapterVersion: "1.0.0",
    outputs: [{ assetId: "ref-music", kind: "audio", role: "primary" }],
    warnings: [],
  }),
} as const;

const pipelineInput = {
  contractVersion: "1.0",
  operation: "generate-music",
  restrictedPayloadRef: "restricted-request",
  readyAssets: [],
  pollStatus: "ready",
  pollRevision: 1,
  bindingId: "reference-music-resume-pipeline-v1",
  generationClientBindingId: "reference-provider-client-v1",
  context: {
    contextVersion: "1.0",
    baselineTime: "2030-01-01T00:00:00.000Z",
    attempt: 1,
    operationRef: "operation-ref",
    materializationIdempotencyKeyRef: "materialization-key",
    generationIdempotencyKeyRef: "generation-key",
    outputIngestionIdempotencyKeyRef: "ingestion-key",
  },
  authorization: {
    authorizationVersion: "1.0",
    actorType: "internal-workflow-service",
    tenantRef: "tenant",
    region: "reference-region",
    operation: "generate-music",
    permission: "execute-operation-resume-pipeline",
    workflowOwnershipVerified: true,
    deletionState: "active",
    legalHold: false,
  },
} as const;

const dependencies = (provenance: ReferenceOutputIngestionDependencies["provenance"]): ReferenceOutputIngestionDependencies => ({
  fetcher: new ReferenceOutputFetcher(),
  inspector: new ReferenceContentInspector(),
  scanner: new ReferenceScanner(),
  sanitizer: new ReferenceSanitizer(),
  duplicateLookup: new ReferenceRegistry(),
  store: new ReferencePersistenceAssetStoreV2(),
  registry: new ReferencePersistenceRegistryV2(),
  journal: new ReferencePersistenceJournalV2(),
  provenance,
  cleanup: new ReferencePersistenceCleanupV2(),
});

const executeWith = async (ingestionDependencies: ReferenceOutputIngestionDependencies) => {
  let executionCount = 0;
  const pipeline = createBoundOperationPipeline(binding as never, {
    ingestionDependencies,
    ingestionExecutorFactory: (value) => {
      const executor = new ReferenceOutputIngestionExecutor(value);
      return {
        async execute(plan, references) {
          executionCount += 1;
          return executor.execute(plan, references);
        },
      };
    },
  } as never);
  const result = await pipeline.execute(pipelineInput as never);
  return { result, executionCount };
};

test("maps an authoritative partial ingestion result through the executable bound pipeline", async () => {
  const { result, executionCount } = await executeWith(dependencies(new ReferencePersistenceProvenanceV2("unavailable")));
  assert.equal(executionCount, 1);
  assert.equal(result.status, "partial");
  if (result.status !== "partial") return;
  assert.equal(result.issues.some((value) => value.reasonCode === "output-ingestion-partial"), true);
  assert.equal(result.assets.length, 1);
  assert.equal(result.audit.ingestionStatus, "partial");
});

test("does not fabricate partial status for authoritative completed ingestion", async () => {
  const { result, executionCount } = await executeWith(dependencies(new ReferencePersistenceProvenanceV2()));
  assert.equal(executionCount, 1);
  assert.equal(result.status, "completed");
  assert.equal("issues" in result && result.issues.some((value) => value.reasonCode === "output-ingestion-partial"), false);
  assert.equal(result.audit.reasonCodes.includes("output-ingestion-partial"), false);
  assert.equal(result.audit.ingestionStatus, "completed");
});

test("maps real executor recovery-required without retrying or exposing assets", async () => {
  let storeWriteCount = 0;
  let authoritativeLookupCount = 0;
  const baseStore = new ReferencePersistenceAssetStoreV2("outcome-unknown-committed");
  const store: AssetStoreWriterV2 = {
    async write(value) {
      storeWriteCount += 1;
      return baseStore.write(value);
    },
    async lookupAuthoritative() {
      authoritativeLookupCount += 1;
      return { status: "unavailable", retryable: true };
    },
  };
  const { result, executionCount } = await executeWith({
    ...dependencies(new ReferencePersistenceProvenanceV2()),
    store,
  });

  assert.equal(executionCount, 1);
  assert.equal(storeWriteCount, 1);
  assert.equal(authoritativeLookupCount, 1);
  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.deepEqual(result.issues, [{ reasonCode: "reconciliation-required", classification: "failed", retryable: false }]);
  assert.equal("assets" in result, false);
  assert.equal(result.audit.reasonCodes.includes("output-ingestion-partial"), false);
  assert.equal(result.audit.reasonCodes.includes("operation-pipeline-completed"), false);
});
