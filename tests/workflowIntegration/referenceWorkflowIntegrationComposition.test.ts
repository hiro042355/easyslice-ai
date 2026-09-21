import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedAsset, Sensitive } from "../../lib/assets/types";
import type { ImportedAssetReference, OutputIngestionPlan } from "../../lib/outputIngestion/types";
import type { ReferenceOutputIngestionExecutionResult } from "../../lib/outputIngestion/referenceOutputIngestion";
import type { OperationAdapterRequest, RestrictedAdapterRequestRecord, RestrictedAdapterRequestResolver } from "../../lib/operationPipelines/referenceOperationResumeTypes";
import { createReferenceAsyncWorkflowCoordinator } from "../../lib/workflowIntegration/referenceAsyncWorkflowCoordinator";
import { createReferenceWorkflowIntegrationDependencies } from "../../lib/workflowIntegration/referenceWorkflowIntegrationDependencies";
import { projectPendingUploadReadyAssetsV2, validatePendingUploadPollStateV2 } from "../../lib/pendingPollV2/pendingPollStateV2";
import { createReferenceGenerationJobEntryPoint } from "../../lib/server/workflowEntry/referenceGenerationJobEntryPoint";
import { ReferenceGenerationJobIdempotencyStore } from "../../lib/server/workflowEntry/referenceGenerationJobIdempotencyStore";
import { ReferenceGenerationJobRecordStore } from "../../lib/server/workflowEntry/referenceGenerationJobStore";
import { createReferenceWorkflowEntryReconciliation } from "../../lib/server/workflowEntry/referenceWorkflowEntryReconciliation";
import type { ReferenceAsyncWorkflowInput, ReferenceGenerationAcceptanceUnknownRecovery, ReferenceResumePipelineInput } from "../../lib/workflowIntegration/types";
import type { ReferenceGenerationJobRecord, ReferenceWorkflowGenerationPollInput } from "../../lib/workflowEntry/types";
import { vocalRequest } from "../materializers/materializerTestFixtures";

test("reconciliation forwards completed provider output through the injected ingestion capability", async () => {
  let executeCallCount = 0;
  let capturedPlan: OutputIngestionPlan | undefined;
  let capturedReferences: unknown;
  const expectedAsset: ImportedAssetReference = { assetId: "reference-reconciled-asset-1", kind: "voice", role: "primary", mimeType: "audio/wav", sizeBytes: 1024, checksum: "sha256:reference-reconciled", availability: "available" };
  const executeResult: ReferenceOutputIngestionExecutionResult = {
    status: "completed",
    requiredOutputsComplete: true,
    assets: [expectedAsset],
    audit: { status: "completed", expectedCount: 1, receivedCount: 1, fetchedCount: 1, validatedCount: 1, importedCount: 1, reusedCount: 0, failedCount: 0, roles: ["primary"], mimeClasses: ["audio"], reasonCodes: [] },
  };
  const reconciliation = createReferenceWorkflowEntryReconciliation({
    ingestion: { async execute(plan, references) { executeCallCount += 1; capturedPlan = plan; capturedReferences = references; return executeResult; } },
  });
  const result = await reconciliation.recover({
    lookup: { status: "found-completed", response: { responseVersion: "1.0", operation: "generate-vocal", outcome: "completed", providerOutputReferences: ["ref-vocal"], safeMetadata: { outputCount: 1 } }, audit: { auditVersion: "1.0", status: "found-completed", reasonCodes: ["generation-response-found"] } },
    workflowInput: {
      contractVersion: "1.0",
      operation: "generate-vocal",
      acceptedStateProjection: {
        contractVersion: "1.0",
        state: { stateVersion: "2.0", planFingerprint: "reconciliation-plan", providerId: "reference-vocal", providerApiVersion: "reference-api-v1", operation: "generate-vocal", items: [], attempt: 1 },
        referenceExpiresAt: "2030-01-02T00:00:00.000Z",
        stateExpiresAt: "2030-01-02T00:00:00.000Z",
        omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" },
        initialRevision: 1,
      },
      context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "reconciliation-operation", acceptanceKeyRef: "reconciliation-acceptance", pollKeyRef: "reconciliation-poll", resumeClaimKeyRef: "reconciliation-claim", materializationKeyRef: "reconciliation-materialization", generationKeyRef: "reconciliation-generation", ingestionKeyRef: "reconciliation-ingestion", finalResultKeyRef: "reconciliation-final", cancellationRequested: false },
      authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "reference-region", operation: "generate-vocal", permission: "run-reference-async-workflow", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
      workflowSchemaVersion: "1.0",
      workflowEngineVersion: "reference-v1",
      bindings: { materializerBindingId: "reference-vocal-resume-pipeline-v1", generationClientBindingId: "reference-vocal-client-v1", outputIngestionBindingId: "reference-output-ingestion-v1" },
      restrictedAdapterRequest: vocalRequest(),
      restrictedRecords: { originalInputRecordRef: "reconciliation-original", adapterRequestRecordRef: "reconciliation-adapter", schemaFingerprint: "reconciliation-schema", expiresAt: "2030-01-02T00:00:00.000Z" },
    },
  } as Parameters<ReferenceGenerationAcceptanceUnknownRecovery["recover"]>[0]);
  const expectedPlan: OutputIngestionPlan = {
    planVersion: "1.0",
    executorVersion: "reference-v1",
    providerId: "reference-vocal",
    providerApiVersion: "reference-api-v1",
    operation: "generate-vocal",
    items: [{ slotIndex: 0, role: "primary", requirement: "required", expectedKind: "voice", allowedMimeTypes: ["audio/wav"], allowedCodecs: ["pcm"], allowedContainers: ["wav"], maximumSizeBytes: 1000000, expectedDuration: { targetSeconds: 30, toleranceSeconds: 0 }, requireChecksum: true, requireDurationMetadata: true, requireDimensions: false }],
    policy: { policyVersion: "1.0", externalFetchAllowed: true, maximumDownloadBytes: 1000000, requireHttps: true, redirectPolicy: "none", retentionClass: "project", sensitivityClass: "standard", scanRequired: true, metadataStrippingRequired: true, destinationRegion: "reference-region", deletionPending: false },
    context: { contextVersion: "1.0", operationRef: "reconciliation-operation", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, cancellation: { stage: "none" } },
    idempotency: { ingestionKeyRef: "reconciliation-ingestion" },
    warnings: [],
  };
  assert.equal(executeCallCount, 1);
  assert.deepEqual(capturedPlan, expectedPlan);
  assert.deepEqual(capturedReferences, { bundleVersion: "1.0", providerId: "reference-vocal", providerApiVersion: "reference-api-v1", operation: "generate-vocal", items: [{ slotIndex: 0, role: "primary", providerOutputReference: "ref-vocal" }] });
  assert.deepEqual(result, { status: "completed", assets: [expectedAsset] });
});

test("recovery-required reconciliation ingestion fails safely without accessing assets", async () => {
  let executeCallCount = 0;
  const reconciliation = createReferenceWorkflowEntryReconciliation({
    ingestion: {
      async execute() {
        executeCallCount += 1;
        return { status: "recovery-required", recoveryVersion: "2.0", stage: "store", reason: "outcome-unknown", retryable: false };
      },
    },
  });
  const result = await reconciliation.recover({
    lookup: { status: "found-completed", response: { responseVersion: "1.0", operation: "generate-vocal", outcome: "completed", providerOutputReferences: ["ref-vocal"], safeMetadata: { outputCount: 1 } }, audit: { auditVersion: "1.0", status: "found-completed", reasonCodes: ["generation-response-found"] } },
    workflowInput: {
      contractVersion: "1.0",
      operation: "generate-vocal",
      acceptedStateProjection: {
        contractVersion: "1.0",
        state: { stateVersion: "2.0", planFingerprint: "reconciliation-recovery-plan", providerId: "reference-vocal", providerApiVersion: "reference-api-v1", operation: "generate-vocal", items: [], attempt: 1 },
        referenceExpiresAt: "2030-01-02T00:00:00.000Z",
        stateExpiresAt: "2030-01-02T00:00:00.000Z",
        omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" },
        initialRevision: 1,
      },
      context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "reconciliation-recovery-operation", acceptanceKeyRef: "reconciliation-recovery-acceptance", pollKeyRef: "reconciliation-recovery-poll", resumeClaimKeyRef: "reconciliation-recovery-claim", materializationKeyRef: "reconciliation-recovery-materialization", generationKeyRef: "reconciliation-recovery-generation", ingestionKeyRef: "reconciliation-recovery-ingestion", finalResultKeyRef: "reconciliation-recovery-final", cancellationRequested: false },
      authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "reference-region", operation: "generate-vocal", permission: "run-reference-async-workflow", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
      workflowSchemaVersion: "1.0",
      workflowEngineVersion: "reference-v1",
      bindings: { materializerBindingId: "reference-vocal-resume-pipeline-v1", generationClientBindingId: "reference-vocal-client-v1", outputIngestionBindingId: "reference-output-ingestion-v1" },
      restrictedAdapterRequest: vocalRequest(),
      restrictedRecords: { originalInputRecordRef: "reconciliation-recovery-original", adapterRequestRecordRef: "reconciliation-recovery-adapter", schemaFingerprint: "reconciliation-recovery-schema", expiresAt: "2030-01-02T00:00:00.000Z" },
    },
  } as Parameters<ReferenceGenerationAcceptanceUnknownRecovery["recover"]>[0]);
  assert.equal(executeCallCount, 1);
  assert.deepEqual(result, { status: "failed", stage: "ingestion" });
});

test("composes a Reference-only executable runtime registry for exactly three operations", () => {
  const dependencies = createReferenceWorkflowIntegrationDependencies();
  assert.deepEqual(dependencies.operationPipelineRuntimeRegistry.listBindings(), [
    { operation: "generate-vocal", bindingId: "reference-vocal-resume-pipeline-v1" },
    { operation: "generate-music", bindingId: "reference-music-resume-pipeline-v1" },
    { operation: "generate-mv", bindingId: "reference-mv-resume-pipeline-v1" },
  ]);
  assert.ok(dependencies.operationPipelineRuntimeRegistry.get("generate-music", "reference-music-resume-pipeline-v1"));
  assert.equal(dependencies.operationPipelineRuntimeRegistry.get("generate-music", "caller-runtime"), undefined);
});

test("keeps restricted resolution and idempotency outside the runtime registry", () => {
  const dependencies = createReferenceWorkflowIntegrationDependencies();
  const registry = dependencies.operationPipelineRuntimeRegistry as unknown as Record<string, unknown>;
  assert.equal(dependencies.operationPipelineRegistry.resolver, dependencies.restrictedAdapterRequestResolver);
  assert.notEqual(dependencies.generationIdempotencyStore, registry);
  assert.notEqual(dependencies.materializationIdempotencyStore, registry);
  for (const authority of ["resolver", "credential", "idempotency", "persistence", "providerEndpoint", "assetUrl"]) {
    assert.equal(authority in registry, false);
  }
});

test("routes server-owned integration bindings through the runtime registry", async () => {
  const dependencies = createReferenceWorkflowIntegrationDependencies();
  const rawState: unknown = {
    stateVersion: "2.0", planFingerprint: "pipeline-ready-plan", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal",
    items: [{ itemVersion: "2.0", itemIndex: 0, assetIndex: 0, usage: "guide-vocal", requirement: "required", status: "completed", sourceSnapshot: { assetRef: { assetId: "pipeline-ready-asset", kind: "audio", mimeType: "audio/wav" }, sizeBytes: 1024, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } }, completedAsset: { assetRef: { assetId: "pipeline-ready-asset", kind: "audio", mimeType: "audio/wav" }, usage: "guide-vocal", requirement: "required", access: { mode: "provider-native-asset", handle: "pipeline-ready-handle" }, sizeBytes: 1024, metadata: { type: "audio", durationPresent: true, dimensionsPresent: false }, integrity: { checksumVerified: true, checksumAlgorithm: "sha256", sizeVerified: true } } }],
    omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" }, attempt: 1, revision: 1, stateStatus: "ready", referenceExpiresAt: "2030-01-02T00:00:00.000Z", stateExpiresAt: "2030-01-02T00:00:00.000Z",
  };
  assert.equal(validatePendingUploadPollStateV2(rawState), true);
  if (!validatePendingUploadPollStateV2(rawState)) assert.fail("expected canonical ready state");
  const projected = projectPendingUploadReadyAssetsV2(rawState);
  assert.equal(projected.status, "projected");
  if (projected.status !== "projected") assert.fail("expected projected ready assets");
  const requireSensitiveAssets = (assets: ReferenceResumePipelineInput["assets"]): Sensitive<readonly ResolvedAsset[]> => assets;
  const readyAssets = requireSensitiveAssets(projected.assets);
  const result = await dependencies.resumePipeline.execute({
    operation: "generate-vocal", assets: readyAssets, pollStatus: "ready", pollRevision: 1, claimIdentity: "claim",
    bindings: { materializerBindingId: "caller-runtime", generationClientBindingId: "caller-provider", outputIngestionBindingId: "caller-ingestion" },
    restrictedPayloadRef: "payload", authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "region", operation: "generate-vocal", permission: "run-reference-async-workflow", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
    context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "operation", acceptanceKeyRef: "acceptance", pollKeyRef: "poll", resumeClaimKeyRef: "claim", materializationKeyRef: "materialize", generationKeyRef: "generate", ingestionKeyRef: "ingest", finalResultKeyRef: "final", cancellationRequested: false },
  } as never);
  assert.deepEqual(result, { status: "failed", stage: "materialization" });
  const coordinator = createReferenceAsyncWorkflowCoordinator(dependencies);
  assert.deepEqual(Object.keys(coordinator).sort(), ["poll", "resume", "start"]);
});

test("coordinator start registers the canonical restricted adapter request record", async () => {
  const registeredRecords: RestrictedAdapterRequestRecord[] = [];
  const resolver: RestrictedAdapterRequestResolver = {
    register(record) {
      registeredRecords.push(structuredClone(record));
      return { status: "registered" };
    },
    async resolve() {
      return { status: "missing" };
    },
  };
  const dependencies = createReferenceWorkflowIntegrationDependencies();
  const coordinator = createReferenceAsyncWorkflowCoordinator({
    ...dependencies,
    operationPipelineRegistry: Object.freeze({ resolver }),
  });
  const input: ReferenceAsyncWorkflowInput = {
    contractVersion: "1.0",
    operation: "generate-vocal",
    acceptedStateProjection: {
      contractVersion: "1.0",
      state: {
        stateVersion: "2.0",
        planFingerprint: "coordinator-plan",
        providerId: "reference-vocal",
        providerApiVersion: "reference-api-v1",
        operation: "generate-vocal",
        items: [
          {
            itemVersion: "2.0",
            status: "accepted",
            itemIndex: 0,
            assetIndex: 0,
            usage: "guide-vocal",
            requirement: "required",
            sourceSnapshot: {
              assetRef: {
                assetId: "coordinator-source-asset",
                kind: "audio",
                mimeType: "audio/wav",
                durationSeconds: 30,
                checksum: "sha256:coordinator-source",
              },
              sizeBytes: 1024,
              metadata: {
                type: "audio",
                durationPresent: true,
                dimensionsPresent: false,
              },
              integrity: {
                checksumVerified: true,
                checksumAlgorithm: "sha256",
                sizeVerified: true,
              },
            },
            session: {
              sessionVersion: "1.0",
              sessionRef: "coordinator-upload-session",
              providerId: "reference-vocal",
              operation: "generate-vocal",
              mode: "provider-fetch",
              expiresAt: "2030-01-02T00:00:00.000Z",
            },
          },
        ],
        attempt: 1,
      },
      referenceExpiresAt: "2030-01-02T00:00:00.000Z",
      stateExpiresAt: "2030-01-02T00:00:00.000Z",
      omissionPolicy: { policyVersion: "1.0", optionalFailureAction: "omit", optionalCancellationAction: "omit", optionalExpiryAction: "omit" },
      initialRevision: 1,
    },
    context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "coordinator-operation", acceptanceKeyRef: "coordinator-acceptance", pollKeyRef: "coordinator-poll", resumeClaimKeyRef: "coordinator-claim", materializationKeyRef: "coordinator-materialization", generationKeyRef: "coordinator-generation", ingestionKeyRef: "coordinator-ingestion", finalResultKeyRef: "coordinator-final", cancellationRequested: false },
    authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "reference-region", operation: "generate-vocal", permission: "run-reference-async-workflow", workflowOwnershipVerified: true, deletionState: "active", legalHold: false },
    workflowSchemaVersion: "1.0",
    workflowEngineVersion: "reference-v1",
    bindings: { materializerBindingId: "reference-vocal-resume-pipeline-v1", generationClientBindingId: "reference-vocal-client-v1", outputIngestionBindingId: "reference-output-ingestion-v1" },
    restrictedAdapterRequest: vocalRequest(),
    restrictedRecords: { originalInputRecordRef: "coordinator-original", adapterRequestRecordRef: "coordinator-adapter", schemaFingerprint: "coordinator-schema", expiresAt: "2030-01-02T00:00:00.000Z" },
  };
  const result = await coordinator.start(input);
  assert.equal(registeredRecords.length, 1);
  assert.deepEqual(registeredRecords[0], {
    recordVersion: "1.0",
    operation: "generate-vocal",
    adapterId: "reference-vocal-v1",
    adapterVersion: "1.0.0",
    requestSchemaVersion: "1.0",
    fingerprint: "coordinator-schema",
    tenantRef: "tenant",
    region: "reference-region",
    expiresAt: "2030-01-02T00:00:00.000Z",
    deletionState: "active",
    legalHold: false,
    payloadRef: "coordinator-adapter",
  });
  assert.deepEqual(result, {
    status: "accepted",
    acceptedKind: "provider-upload",
    pending: {
      referenceVersion: "1.0",
      pendingRef: "[reference-accepted-pending-1]",
      kind: "provider-upload",
    },
    audit: {
      auditVersion: "1.0",
      status: "accepted",
      operation: "generate-vocal",
      resumed: false,
      uploadGateStatus: "accepted",
      pollStatus: "pending",
      resumeClaimStatus: "not-run",
      materializerStatus: "not-run",
      generationStatus: "not-run",
      ingestionStatus: "not-run",
      finalPersistenceStatus: "committed",
      reasonCodes: ["upload-accepted-persisted"],
    },
  });
});

test("completed generation-job flow forwards the canonical plan and references through the injected ingestion capability", async () => {
  const dependencies = createReferenceWorkflowIntegrationDependencies();
  const store = new ReferenceGenerationJobRecordStore();
  const jobReference = { providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", clientVersion: "1.0.0", jobReference: "opaque-completed-job" } as const;
  const finalResultIdentity = "final-generation-job-result";
  assert.deepEqual(dependencies.restrictedAdapterRequestResolver.register({ recordVersion: "1.0", operation: "generate-vocal", adapterId: "reference-vocal-v1", adapterVersion: "1.0.0", requestSchemaVersion: "1.0", fingerprint: "safe", tenantRef: "tenant", region: "region", expiresAt: "2031-01-01T00:00:00.000Z", deletionState: "active", legalHold: false, payloadRef: "generation-job-payload" }, vocalRequest() as never), { status: "registered" });
  assert.equal((await store.createIfAbsent("generation-job-identity", { recordVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", clientBindingId: "1.0.0", normalizerBindingId: "reference-vocal-v1", ingestionBindingId: "reference-output-ingestion-v1", originalInputRecordRef: "original-input", adapterRequestRecordRef: "generation-job-payload", generationIdentity: "generation-job-identity", jobReference, finalResultIdentity, baselineTime: "2030-01-01T00:00:00.000Z", tenantRef: "tenant", region: "region", revision: 1, status: "pending", lifecycle: "generation-pending", expiresAt: "2031-01-01T00:00:00.000Z" } as never)).status, "created");
  assert.equal((await dependencies.finalResultStore.createIfAbsent(finalResultIdentity, { recordVersion: "1.0", workflowSchemaVersion: "1.0", workflowEngineVersion: "1.0", operation: "generate-vocal", lifecycle: "generation-pending", revision: 1, expiresAt: "2031-01-01T00:00:00.000Z", result: { status: "accepted", acceptedKind: "generation-job", job: jobReference, audit: { auditVersion: "1.0", status: "accepted", operation: "generate-vocal", resumed: true, generationStatus: "accepted", finalPersistenceStatus: "committed", reasonCodes: ["generation-job-accepted"] } } } as never)).status, "created");
  let forwarded: readonly [unknown, unknown] | undefined;
  const entryPoint = createReferenceGenerationJobEntryPoint({ dependencies, store, idempotency: new ReferenceGenerationJobIdempotencyStore(), scenario: "completed", ingestion: { async execute(plan, references) { forwarded = [plan, references]; return { status: "completed", assets: [] } as never; } } });
  const result = await entryPoint.poll({ entryVersion: "1.0", jobReference, context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "generation-job-operation", idempotencyKeyRef: "generation-job-poll", cancellationRequested: false }, authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "region", operation: "generate-vocal", workflowOwnershipVerified: true, deletionState: "active", legalHold: false } } as never);
  assert.ok(forwarded);
  assert.equal((forwarded[0] as { operation: string }).operation, "generate-vocal");
  assert.deepEqual(forwarded[1], { bundleVersion: "1.0", providerId: "reference-vocal", providerApiVersion: "reference-api-v1", operation: "generate-vocal", items: [{ slotIndex: 0, role: "primary", providerOutputReference: "ref-vocal" }] });
  assert.equal(result.status, "completed");
  if (result.status === "completed") assert.deepEqual({ assets: result.assets, requiredOutputsComplete: result.requiredOutputsComplete }, { assets: [], requiredOutputsComplete: true });
});

test("recovery-required generation-job ingestion preserves reconciliation semantics without accessing assets", async () => {
  const dependencies = createReferenceWorkflowIntegrationDependencies();
  const store = new ReferenceGenerationJobRecordStore();
  const jobReference = { providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", clientVersion: "1.0.0", jobReference: "opaque-recovery-job" } as const;
  const finalResultIdentity = "final-recovery-generation-job-result";
  assert.deepEqual(dependencies.restrictedAdapterRequestResolver.register({ recordVersion: "1.0", operation: "generate-vocal", adapterId: "reference-vocal-v1", adapterVersion: "1.0.0", requestSchemaVersion: "1.0", fingerprint: "safe-recovery", tenantRef: "tenant", region: "region", expiresAt: "2031-01-01T00:00:00.000Z", deletionState: "active", legalHold: false, payloadRef: "recovery-generation-job-payload" }, vocalRequest() as Sensitive<OperationAdapterRequest>), { status: "registered" });
  assert.equal((await store.createIfAbsent("recovery-generation-job-identity", { recordVersion: "1.0", providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", clientBindingId: "1.0.0", normalizerBindingId: "reference-vocal-v1", ingestionBindingId: "reference-output-ingestion-v1", originalInputRecordRef: "original-input", adapterRequestRecordRef: "recovery-generation-job-payload", generationIdentity: "recovery-generation-job-identity", jobReference, finalResultIdentity, baselineTime: "2030-01-01T00:00:00.000Z", tenantRef: "tenant", region: "region", revision: 1, status: "pending", lifecycle: "generation-pending", expiresAt: "2031-01-01T00:00:00.000Z" } as ReferenceGenerationJobRecord)).status, "created");
  let finalResultReadCount = 0;
  let finalResultWriteCount = 0;
  const originalFinalResultRead = dependencies.finalResultStore.read.bind(dependencies.finalResultStore);
  const originalFinalResultCompareAndSet = dependencies.finalResultStore.compareAndSet.bind(dependencies.finalResultStore);
  dependencies.finalResultStore.read = async (...args) => {
    finalResultReadCount += 1;
    return originalFinalResultRead(...args);
  };
  dependencies.finalResultStore.compareAndSet = async (...args) => {
    finalResultWriteCount += 1;
    return originalFinalResultCompareAndSet(...args);
  };
  let ingestionCallCount = 0;
  let forwardedPlan: OutputIngestionPlan | undefined;
  let forwardedReferences: unknown;
  const entryPoint = createReferenceGenerationJobEntryPoint({ dependencies, store, idempotency: new ReferenceGenerationJobIdempotencyStore(), scenario: "completed", ingestion: { async execute(plan, references) { ingestionCallCount += 1; forwardedPlan = plan; forwardedReferences = references; return { status: "recovery-required", recoveryVersion: "2.0", stage: "store", reason: "authoritative-lookup-unavailable", retryable: false }; } } });
  const result = await entryPoint.poll({ entryVersion: "1.0", jobReference, context: { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", attempt: 1, operationRef: "recovery-generation-job-operation", idempotencyKeyRef: "recovery-generation-job-poll", cancellationRequested: false }, authorization: { authorizationVersion: "1.0", actorType: "internal-workflow-service", tenantRef: "tenant", region: "region", operation: "generate-vocal", workflowOwnershipVerified: true, deletionState: "active", legalHold: false } } as ReferenceWorkflowGenerationPollInput);
  const expectedPlan: OutputIngestionPlan = {
    planVersion: "1.0",
    executorVersion: "reference-v1",
    providerId: "reference-vocal",
    providerApiVersion: "reference-api-v1",
    operation: "generate-vocal",
    items: [{
      slotIndex: 0,
      role: "primary",
      requirement: "required",
      expectedKind: "voice",
      allowedMimeTypes: ["audio/wav"],
      allowedCodecs: ["pcm"],
      allowedContainers: ["wav"],
      maximumSizeBytes: 1000000,
      expectedDuration: { targetSeconds: 30, toleranceSeconds: 0 },
      requireChecksum: true,
      requireDurationMetadata: true,
      requireDimensions: false,
    }],
    policy: {
      policyVersion: "1.0",
      externalFetchAllowed: true,
      maximumDownloadBytes: 1000000,
      requireHttps: true,
      redirectPolicy: "none",
      retentionClass: "project",
      sensitivityClass: "standard",
      scanRequired: true,
      metadataStrippingRequired: true,
      destinationRegion: "reference-region",
      deletionPending: false,
    },
    context: {
      contextVersion: "1.0",
      operationRef: "recovery-generation-job-operation",
      baselineTime: "2030-01-01T00:00:00.000Z",
      attempt: 1,
      cancellation: { stage: "none" },
    },
    idempotency: { ingestionKeyRef: "job-ingestion-recovery-generation-job-identity" },
    warnings: [],
  };
  assert.equal(ingestionCallCount, 1);
  assert.deepEqual(forwardedPlan, expectedPlan);
  assert.deepEqual(forwardedReferences, { bundleVersion: "1.0", providerId: "reference-vocal", providerApiVersion: "reference-api-v1", operation: "generate-vocal", items: [{ slotIndex: 0, role: "primary", providerOutputReference: "ref-vocal" }] });
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.failureStage, "output-ingestion-store");
    assert.deepEqual(result.issues, [{ reasonCode: "reconciliation-required", classification: "conflict", retryable: false }]);
    assert.deepEqual(result.audit.reasonCodes, ["reconciliation-required"]);
  }
  assert.equal(finalResultReadCount, 0);
  assert.equal(finalResultWriteCount, 0);
  const generationJob = await store.read(jobReference, "2030-01-01T00:00:00.000Z");
  assert.equal(generationJob.status, "found");
  if (generationJob.status === "found") assert.equal(generationJob.record.status, "pending");
});
