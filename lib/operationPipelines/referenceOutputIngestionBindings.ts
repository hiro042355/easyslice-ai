import { createReferenceProviderClient, REFERENCE_PROVIDER_TIMEOUT_POLICY } from "@/lib/providerClients/referenceProviderClient";
import type { ReferenceTransportScenario } from "@/lib/providerClients/types";
import { buildOutputIngestionPlan } from "@/lib/outputIngestion/outputIngestionPlan";
import { ReferenceContentInspector } from "@/lib/outputIngestion/referenceContentInspector";
import { ReferenceOutputFetcher } from "@/lib/outputIngestion/referenceOutputFetcher";
import { ReferenceOutputIngestionExecutor, type ReferenceOutputIngestionDependencies } from "@/lib/outputIngestion/referenceOutputIngestion";
import { ReferencePersistenceAssetStoreV2 } from "@/lib/outputIngestion/referencePersistenceAssetStoreV2";
import { ReferencePersistenceCleanupV2 } from "@/lib/outputIngestion/referencePersistenceCleanupV2";
import { ReferencePersistenceJournalV2 } from "@/lib/outputIngestion/referencePersistenceJournalV2";
import { ReferencePersistenceProvenanceV2 } from "@/lib/outputIngestion/referencePersistenceProvenanceV2";
import { ReferencePersistenceRegistryV2 } from "@/lib/outputIngestion/referencePersistenceRegistryV2";
import { ReferenceRegistry } from "@/lib/outputIngestion/referenceRegistry";
import { ReferenceSanitizer, ReferenceScanner } from "@/lib/outputIngestion/referenceScanner";
import type { NormalizedGenerationResult } from "@/lib/providers/types";
import type { OperationResumePipeline, OperationResumePipelineBinding, OperationResumePipelineInput, OperationResumePipelineResult } from "./referenceOperationResumeTypes";
import { audit, copy, issue, projectReadyAssetsToMaterializerResolution } from "./operationPipelineUtils";
import { projectExpectedOutput } from "./referenceExpectedOutputs";
import { referenceCredentialHandle } from "./referenceCredentialFixtures";
import { toReferenceProviderRequestBody } from "./referenceTransportBridges";
import { createReferenceGenerationFingerprint, createReferenceMaterializationFingerprint } from "./referenceMaterializationFingerprint";

export type OperationPipelineIdempotencyBoundary = {
  reserveMaterialization(key: string, fingerprint: string): Promise<{ status: "reserved" | "existing" | "conflict" }>;
  completeMaterialization(key: string, fingerprint: string, status: "materialized" | "reconciliation-required"): Promise<"updated" | "conflict">;
  reserveGeneration(key: string, fingerprint: string): Promise<{ status: "reserved" | "existing" | "conflict"; pipelineResult?: OperationResumePipelineResult }>;
  completeGeneration(key: string, fingerprint: string, status: "completed" | "accepted" | "acceptance-unknown" | "reconciliation-required", result: OperationResumePipelineResult): Promise<"updated" | "conflict">;
};

type Config = {
  scenario?: ReferenceTransportScenario;
  ingestionScenario?: "success" | "provenance-failure-after-register";
  idempotency?: OperationPipelineIdempotencyBoundary;
  ingestionDependencies?: ReferenceOutputIngestionDependencies;
  ingestionExecutorFactory?: (dependencies: ReferenceOutputIngestionDependencies) => Pick<ReferenceOutputIngestionExecutor, "execute">;
};

const createReferenceIngestionDependencies = (scenario: Config["ingestionScenario"]): ReferenceOutputIngestionDependencies => Object.freeze({
  fetcher: new ReferenceOutputFetcher(),
  inspector: new ReferenceContentInspector(),
  scanner: new ReferenceScanner(),
  sanitizer: new ReferenceSanitizer(),
  duplicateLookup: new ReferenceRegistry(),
  store: new ReferencePersistenceAssetStoreV2(),
  registry: new ReferencePersistenceRegistryV2(),
  journal: new ReferencePersistenceJournalV2(),
  provenance: new ReferencePersistenceProvenanceV2(scenario === "provenance-failure-after-register" ? "unavailable" : "normal"),
  cleanup: new ReferencePersistenceCleanupV2(),
});

export function createBoundOperationPipeline(binding: OperationResumePipelineBinding<any, any, any, any>, config: Config = {}): OperationResumePipeline {
  const client = createReferenceProviderClient({
    scenario: config.scenario ?? "sync-completed",
    referenceNowEpochSeconds: 1893456000,
    minimumAssetLifetimeSeconds: 120,
    credentialStates: { "credential-valid": "valid" },
  });
  const ingestionDependencies = config.ingestionDependencies ?? createReferenceIngestionDependencies(config.ingestionScenario ?? "success");
  const ingestion = config.ingestionExecutorFactory?.(ingestionDependencies) ?? new ReferenceOutputIngestionExecutor(ingestionDependencies);

  return { async execute(raw: OperationResumePipelineInput): Promise<OperationResumePipelineResult> {
    const x: any = raw, op = binding.operation;
    const fail = (reason: any, status: "failed" | "acceptance-unknown" = "failed"): OperationResumePipelineResult => ({
      status,
      issues: [issue(reason, status === "acceptance-unknown" ? "conflict" : "failed", status === "acceptance-unknown")],
      audit: audit(status, op, [reason, ...(status === "acceptance-unknown" ? ["reconciliation-required" as const] : [])]),
    });
    if (!x || x.contractVersion !== "1.0" || x.operation !== op || x.bindingId !== `reference-${op.replace("generate-", "")}-resume-pipeline-v1` || !x.context || !x.authorization || x.authorization.operation !== op || x.authorization.permission !== "execute-operation-resume-pipeline" || x.authorization.workflowOwnershipVerified !== true || x.authorization.deletionState !== "active") return fail("adapter-request-operation-mismatch");
    const restored = await binding.restoreAdapterRequest(x.restrictedPayloadRef, x);
    if (restored.status !== "resolved") {
      const reason = restored.status === "missing" ? "adapter-request-record-missing"
        : restored.status === "expired" ? "adapter-request-record-expired"
        : restored.status === "deleted" ? "adapter-request-record-deleted"
        : restored.status === "unauthorized" ? "adapter-request-unauthorized"
        : restored.status === "adapter-mismatch" ? "adapter-request-adapter-mismatch"
        : restored.status === "operation-mismatch" ? "adapter-request-operation-mismatch"
        : restored.status === "failed" ? "adapter-request-resolution-failed"
        : "adapter-request-schema-mismatch";
      return fail(reason);
    }
    const projected = projectReadyAssetsToMaterializerResolution({ projectionVersion: "1.0", operation: op, pollStatus: x.pollStatus, pollRevision: x.pollRevision, assets: x.readyAssets } as any);
    if (projected.status !== "projected") return fail("ready-asset-projection-failed");
    const mat = binding.materialize(restored.request, projected.resolution, x.context.baselineTime);
    if (mat.status !== "materialized" || mat.request.materialization.unresolvedAssetCount !== 0) return fail("materialization-failed");

    const materializationFingerprint = createReferenceMaterializationFingerprint({
      operation: op,
      adapterRequest: restored.request,
      readyAssets: x.readyAssets,
      materializedBody: mat.request.body,
      pollRevision: x.pollRevision,
      materializerBindingId: x.bindingId,
      materializerBindingVersion: binding.materializerVersion,
      providerId: binding.providerId,
      providerApiVersion: binding.providerApiVersion,
      baselineTime: x.context.baselineTime,
    });
    if (config.idempotency) {
      const reservation = await config.idempotency.reserveMaterialization(x.context.materializationIdempotencyKeyRef, materializationFingerprint);
      if (reservation.status === "conflict") return fail("materialization-failed");
      if (reservation.status === "reserved" && await config.idempotency.completeMaterialization(x.context.materializationIdempotencyKeyRef, materializationFingerprint, "materialized") !== "updated") return fail("reconciliation-required");
    }

    const bridged = binding.bridgeToClientBody(mat.request);
    if (bridged.status !== "bridged") return fail("transport-bridge-failed");
    const generationFingerprint = createReferenceGenerationFingerprint(materializationFingerprint, x.generationClientBindingId);
    if (config.idempotency) {
      const reservation = await config.idempotency.reserveGeneration(x.context.generationIdempotencyKeyRef, generationFingerprint);
      if (reservation.status === "conflict") return fail("provider-submit-failed");
      if (reservation.status === "existing") return reservation.pipelineResult ? copy(reservation.pipelineResult) : fail("generation-acceptance-unknown", "acceptance-unknown");
    }
    const finish = async (result: OperationResumePipelineResult) => {
      if (!config.idempotency) return result;
      const status = result.status === "accepted" ? "accepted" : result.status === "acceptance-unknown" ? "acceptance-unknown" : result.status === "failed" ? "reconciliation-required" : "completed";
      return await config.idempotency.completeGeneration(x.context.generationIdempotencyKeyRef, generationFingerprint, status, result) === "updated" ? result : fail("reconciliation-required");
    };

    const submitted = await client.submit({ contractVersion: "1.0", request: { ...mat.request, body: toReferenceProviderRequestBody(bridged.body as any) }, credentialHandle: referenceCredentialHandle, timeoutPolicy: REFERENCE_PROVIDER_TIMEOUT_POLICY, correlation: { operationId: x.context.operationRef, attempt: x.context.attempt }, idempotency: { keyRef: x.context.generationIdempotencyKeyRef } } as any);
    if (submitted.status === "accepted") return finish({ status: "accepted", job: copy(submitted.job) as any, audit: audit("accepted", op, [], { adapterRestoreStatus: "resolved", readyAssetProjectionStatus: "projected", materializerStatus: "materialized", transportBridgeStatus: "bridged", providerClientStatus: "accepted" }) });
    if (submitted.status !== "completed") return finish(submitted.transport.requestAccepted && submitted.error.category === "timeout" ? fail("generation-acceptance-unknown", "acceptance-unknown") : fail("provider-submit-failed"));
    let normalized: NormalizedGenerationResult;
    try { normalized = (binding as any).normalize(binding.bridgeResponse(submitted.data)); } catch { return finish(fail("provider-output-reference-invalid")); }
    if (!normalized || normalized.status === "failed" || normalized.outputs.length === 0) return finish(fail("response-normalization-failed"));
    const expected = projectExpectedOutput(op, restored.request as any);
    if (expected.status !== "projected") return finish(fail("expected-output-invalid"));
    const plan = buildOutputIngestionPlan({ contractVersion: "1.0", providerId: normalized.providerId, providerApiVersion: "reference-api-v1", operation: op, generationResult: normalized, expectedOutput: expected.expected, policy: expected.policy, context: { contextVersion: "1.0", operationRef: x.context.operationRef, baselineTime: x.context.baselineTime, attempt: x.context.attempt, cancellation: { stage: "none" } }, idempotency: { ingestionKeyRef: x.context.outputIngestionIdempotencyKeyRef } } as any);
    if (plan.status !== "planned") return finish(fail("output-ingestion-failed"));
    const result = await ingestion.execute(plan.plan, plan.references);
    if (result.status === "failed") return finish(fail("output-ingestion-failed"));
    if (result.status === "recovery-required") return finish(fail("reconciliation-required"));
    if (result.status === "partial") return finish({ status: "partial", assets: copy(result.assets) as any, issues: [issue("output-ingestion-partial", "failed")], audit: audit("partial", op, ["output-ingestion-partial"], { adapterRestoreStatus: "resolved", readyAssetProjectionStatus: "projected", materializerStatus: "materialized", transportBridgeStatus: "bridged", providerClientStatus: "completed", normalizationStatus: "completed", ingestionStatus: "partial" }) });
    const status = x.pollStatus === "degraded" || mat.audit.omittedCount > 0 ? "degraded" : "completed";
    return finish({ status, assets: copy(result.assets) as any, audit: audit(status, op, ["operation-pipeline-completed"], { adapterRestoreStatus: "resolved", readyAssetProjectionStatus: x.pollStatus === "degraded" ? "degraded" : "projected", materializerStatus: "materialized", transportBridgeStatus: "bridged", providerClientStatus: "completed", normalizationStatus: "completed", ingestionStatus: "completed" }) });
  } };
}
