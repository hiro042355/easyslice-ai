// Server-only directory boundary. Reconciles a known provider outcome without materializing or submitting again.
import type { ReferenceGenerationAcceptanceUnknownRecovery } from "@/lib/workflowIntegration/types";
import { bridgeMusicResponse, bridgeMVResponse, bridgeVocalResponse } from "@/lib/operationPipelines/referenceTransportBridges";
import { projectExpectedOutput } from "@/lib/operationPipelines/referenceExpectedOutputs";
import { normalizeReferenceMusicResponse } from "@/lib/providers/referenceMusicAdapter";
import { normalizeReferenceMVResponse } from "@/lib/providers/referenceMVAdapter";
import { normalizeReferenceVocalResponse } from "@/lib/providers/referenceVocalAdapter";
import { buildOutputIngestionPlan } from "@/lib/outputIngestion/outputIngestionPlan";
import type { ReferenceOutputIngestionExecutor } from "@/lib/outputIngestion/referenceOutputIngestion";
import { copy } from "@/lib/workflowEntry/workflowEntryUtils";

export function createReferenceWorkflowEntryReconciliation(args: {
  ingestion: Pick<ReferenceOutputIngestionExecutor, "execute">;
}): ReferenceGenerationAcceptanceUnknownRecovery {
  return { async recover({ lookup, workflowInput }) {
    if (lookup.status === "found-pending") return { status: "accepted", job: copy(lookup.job) };
    if (lookup.status !== "found-completed") return lookup.status === "found-failed" ? { status: "failed", stage: "generation" } : { status: "acceptance-unknown" };
    try {
      const op = workflowInput.operation;
      const normalized = op === "generate-vocal"
        ? normalizeReferenceVocalResponse(bridgeVocalResponse(lookup.response))
        : op === "generate-music"
          ? normalizeReferenceMusicResponse(bridgeMusicResponse(lookup.response))
          : normalizeReferenceMVResponse(bridgeMVResponse(lookup.response));
      if (normalized.status === "failed" || normalized.outputs.length === 0) return { status: "failed", stage: "generation" };
      const expected = projectExpectedOutput(op, workflowInput.restrictedAdapterRequest as never);
      if (expected.status !== "projected") return { status: "failed", stage: "ingestion" };
      const planned = buildOutputIngestionPlan({ contractVersion: "1.0", providerId: normalized.providerId, providerApiVersion: "reference-api-v1", operation: op, generationResult: normalized, expectedOutput: expected.expected, policy: expected.policy, context: { contextVersion: "1.0", operationRef: workflowInput.context.operationRef, baselineTime: workflowInput.context.baselineTime, attempt: workflowInput.context.attempt, cancellation: { stage: "none" } }, idempotency: { ingestionKeyRef: workflowInput.context.ingestionKeyRef } });
      if (planned.status !== "planned") return { status: "failed", stage: "ingestion" };
      const result = await args.ingestion.execute(planned.plan, planned.references);
      if (result.status === "failed") return { status: "failed", stage: "ingestion" };
      if (result.status === "recovery-required") {
        return {
          status: "failed",
          stage: "ingestion",
        };
      }
      return result.status === "partial" ? { status: "partial", assets: copy(result.assets) } : { status: "completed", assets: copy(result.assets) };
    } catch { return { status: "failed", stage: "generation" }; }
  } };
}
