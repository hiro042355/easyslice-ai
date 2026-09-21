import { createReferenceAcceptedPersistenceCoordinator } from "@/lib/acceptedPersistence/referenceAcceptedPersistenceCoordinator";
import { ReferencePendingPollV2IdempotencyStore } from "@/lib/pendingPollV2/referencePendingPollV2IdempotencyStore";
import { createReferencePendingPollV2Client } from "@/lib/pendingPollV2/referencePendingPollV2Client";
import { createReferencePendingPollV2Executor } from "@/lib/pendingPollV2/referencePendingPollV2Executor";
import { ReferenceActivePollReferenceResolver, ReferencePendingPollV2Store } from "@/lib/pendingPollV2/referencePendingPollV2Store";
import { createReferenceOperationPipelineRuntimeRegistry, type ReferenceOperationPipelineRuntimeBinding } from "@/lib/operationPipelines/referenceOperationPipelineRuntimeRegistry";
import { ReferenceRestrictedAdapterRequestResolver } from "@/lib/operationPipelines/referenceRestrictedAdapterRequestResolver";
import { createReferenceVocalResumePipeline, REFERENCE_VOCAL_RESUME_PIPELINE_ID } from "@/lib/operationPipelines/referenceVocalResumePipeline";
import { createReferenceMusicResumePipeline, REFERENCE_MUSIC_RESUME_PIPELINE_ID } from "@/lib/operationPipelines/referenceMusicResumePipeline";
import { createReferenceMVResumePipeline, REFERENCE_MV_RESUME_PIPELINE_ID } from "@/lib/operationPipelines/referenceMVResumePipeline";
import { ReferenceGenerationIdempotencyStore } from "./referenceGenerationIdempotencyStore";
import { ReferenceGenerationJobLookup } from "./referenceGenerationJobLookup";
import { ReferenceIntegrationReconciliationStore } from "./referenceIntegrationReconciliation";
import { ReferenceMaterializationIdempotencyStore } from "./referenceMaterializationIdempotencyStore";
import { ReferenceRestrictedRecordResolver } from "./referenceRestrictedRecordResolver";
import { ReferenceWorkflowResultStore } from "./referenceWorkflowResultStore";
import type { ReferenceWorkflowIntegrationDependencies } from "./types";

type InternalConfig = {
  pollScenario?: Parameters<typeof createReferencePendingPollV2Client>[0];
  operationPipelines?: Parameters<typeof createReferenceVocalResumePipeline>[1];
  generationAcceptedPersistence?: import("./types").ReferenceGenerationAcceptedPersistence;
  generationAcceptanceUnknownRecovery?: import("./types").ReferenceGenerationAcceptanceUnknownRecovery;
  generationJobLookup?: Pick<ReferenceWorkflowIntegrationDependencies["generationJobLookup"], "lookup">;
};

export function createReferenceWorkflowIntegrationDependencies(raw?: unknown): ReferenceWorkflowIntegrationDependencies {
  const config = (raw && typeof raw === "object" ? raw : {}) as InternalConfig;
  const pollStore = new ReferencePendingPollV2Store();
  const pollResolver = new ReferenceActivePollReferenceResolver();
  const pollIdempotency = new ReferencePendingPollV2IdempotencyStore();
  const pollExecutor = createReferencePendingPollV2Executor({
    resolver: pollResolver,
    store: pollStore,
    client: createReferencePendingPollV2Client(config.pollScenario ?? "still-pending"),
    idempotency: pollIdempotency,
    minimumHandleLifetimeSeconds: 120,
    checkResumeDependencies: () => "available",
  });
  const finalResultStore = new ReferenceWorkflowResultStore();
  const generationIdempotencyStore = new ReferenceGenerationIdempotencyStore();
  const generationJobLookup = config.generationJobLookup ?? new ReferenceGenerationJobLookup();
  const materializationIdempotencyStore = new ReferenceMaterializationIdempotencyStore();
  const reconciliationStore = new ReferenceIntegrationReconciliationStore();
  const internal = new ReferenceRestrictedRecordResolver();
  const restrictedAdapterRequestResolver = new ReferenceRestrictedAdapterRequestResolver();
  const idempotency = {
    reserveMaterialization: (key: string, fingerprint: string) => materializationIdempotencyStore.reserve(key, fingerprint),
    completeMaterialization: (key: string, fingerprint: string, status: "materialized" | "reconciliation-required") => materializationIdempotencyStore.complete(key, fingerprint, status),
    reserveGeneration: async (key: string, fingerprint: string) => {
      const value = await generationIdempotencyStore.reserve(key, fingerprint);
      return { status: value.status, ...(value.record?.pipelineResult ? { pipelineResult: value.record.pipelineResult } : {}) };
    },
    completeGeneration: (key: string, fingerprint: string, status: "completed" | "accepted" | "acceptance-unknown" | "reconciliation-required", result: import("@/lib/operationPipelines/referenceOperationResumeTypes").OperationResumePipelineResult) => generationIdempotencyStore.completePipeline(key, fingerprint, status, result),
  };
  const pipelineConfig = { ...config.operationPipelines, idempotency };
  const bindings: readonly ReferenceOperationPipelineRuntimeBinding[] = [
    { operation: "generate-vocal", bindingId: REFERENCE_VOCAL_RESUME_PIPELINE_ID, pipeline: createReferenceVocalResumePipeline(restrictedAdapterRequestResolver, pipelineConfig) },
    { operation: "generate-music", bindingId: REFERENCE_MUSIC_RESUME_PIPELINE_ID, pipeline: createReferenceMusicResumePipeline(restrictedAdapterRequestResolver, pipelineConfig) },
    { operation: "generate-mv", bindingId: REFERENCE_MV_RESUME_PIPELINE_ID, pipeline: createReferenceMVResumePipeline(restrictedAdapterRequestResolver, pipelineConfig) },
  ];
  const operationPipelineRuntimeRegistry = createReferenceOperationPipelineRuntimeRegistry(bindings);
  const resumePipeline = {
    async execute(input: import("./types").ReferenceResumePipelineInput): Promise<import("./types").ReferenceResumePipelineResult> {
      const pipeline = operationPipelineRuntimeRegistry.get(input.operation, input.bindings.materializerBindingId);
      if (!pipeline) return { status: "failed", stage: "materialization" };
      const result = await pipeline.execute({
        contractVersion: "1.0",
        operation: input.operation,
        restrictedPayloadRef: input.restrictedPayloadRef,
        readyAssets: input.assets,
        pollStatus: input.pollStatus,
        pollRevision: input.pollRevision,
        bindingId: input.bindings.materializerBindingId,
        generationClientBindingId: input.bindings.generationClientBindingId,
        context: {
          contextVersion: "1.0", baselineTime: input.context.baselineTime, attempt: input.context.attempt,
          operationRef: input.context.operationRef, materializationIdempotencyKeyRef: input.context.materializationKeyRef,
          generationIdempotencyKeyRef: input.context.generationKeyRef, outputIngestionIdempotencyKeyRef: input.context.ingestionKeyRef,
        },
        authorization: {
          authorizationVersion: "1.0", actorType: input.authorization.actorType, tenantRef: input.authorization.tenantRef,
          region: input.authorization.region, operation: input.operation, permission: "execute-operation-resume-pipeline",
          workflowOwnershipVerified: true, deletionState: input.authorization.deletionState, legalHold: input.authorization.legalHold,
        },
      });
      if (result.status === "completed" || result.status === "degraded" || result.status === "partial") return { status: result.status, assets: result.assets };
      if (result.status === "accepted") return { status: "accepted", job: result.job };
      if (result.status === "acceptance-unknown") return { status: "acceptance-unknown" };
      return { status: "failed", stage: result.audit.materializerStatus === "failed" ? "materialization" : result.audit.ingestionStatus === "failed" ? "ingestion" : "generation" };
    },
  };

  return {
    acceptedPersistenceCoordinator: createReferenceAcceptedPersistenceCoordinator(),
    ...(config.generationAcceptedPersistence ? { generationAcceptedPersistence: config.generationAcceptedPersistence } : {}),
    ...(config.generationAcceptanceUnknownRecovery ? { generationAcceptanceUnknownRecovery: config.generationAcceptanceUnknownRecovery } : {}),
    operationPipelineRuntimeRegistry,
    restrictedAdapterRequestResolver,
    operationPipelineRegistry: Object.freeze({ resolver: restrictedAdapterRequestResolver }),
    resumePipeline,
    pollStore,
    pollResolver,
    pollExecutor,
    finalResultStore,
    materializationIdempotencyStore,
    reconciliationStore,
    generationIdempotencyStore,
    generationJobLookup,
    internal,
  };
}
