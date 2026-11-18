import type { ProviderOperation } from "@/lib/providerClients/types";
import type { ReferenceAsyncWorkflowResult } from "@/lib/workflowIntegration/types";
import type { ReferenceWorkflowEntryAudit, ReferenceWorkflowEntryReasonCode, ReferenceWorkflowEntryResult } from "@/lib/workflowEntry/types";
import { copy } from "@/lib/workflowEntry/workflowEntryUtils";

const invalidProjection = (operation: ProviderOperation): ReferenceWorkflowEntryResult => ({
  status: "failed", operation, failureStage: "result-projection",
  issues: [{ reasonCode: "configuration-invalid", classification: "internal", retryable: false }],
  audit: { auditVersion: "1.0", status: "failed", operation, asyncIntegrationUsed: true, finalPersistenceStatus: "not-run", reasonCodes: ["configuration-invalid"] },
});

/** This boundary never guesses a missing persistence outcome or grants operation authority. */
export function mapIntegrationResult(
  result: ReferenceAsyncWorkflowResult,
  operation: ProviderOperation,
  inputAssetCount = 0,
): ReferenceWorkflowEntryResult {
  const persistence = result.audit.finalPersistenceStatus;
  if (result.audit.operation !== operation ||
      persistence !== "not-run" && persistence !== "committed" && persistence !== "failed") {
    // "not-run" describes this rejected projection, not the unknown upstream transaction.
    return invalidProjection(operation);
  }
  const reasonCodes: readonly ReferenceWorkflowEntryReasonCode[] = result.status === "accepted"
    ? [result.acceptedKind === "provider-upload" ? "upload-accepted-persisted" : "generation-job-accepted"]
    : result.status === "completed" || result.status === "degraded" ? ["workflow-completed"]
    : result.status === "partial" ? ["output-ingestion-partial"]
    : [result.status === "cancelled" ? "workflow-cancelled" : "internal-contract-mismatch"];
  const base = {
    auditVersion: "1.0" as const, status: result.status, operation,
    finalStage: result.status === "accepted" ? result.acceptedKind === "provider-upload" ? "provider-upload-gate" : "provider-submit"
      : result.status === "completed" || result.status === "degraded" || result.status === "partial" ? "completed" : "provider-upload-gate",
    inputAssetCount, importedAssetCount: "assets" in result ? result.assets.length : 0,
    requiredOutputsComplete: "requiredOutputsComplete" in result ? result.requiredOutputsComplete : false,
    asyncIntegrationUsed: true,
    acceptedKind: result.status === "accepted" ? result.acceptedKind : undefined,
    pollStatus: result.audit.pollStatus, resumeStatus: result.audit.resumeClaimStatus,
    generationJobStatus: result.audit.generationStatus, finalPersistenceStatus: persistence, reasonCodes,
  } satisfies ReferenceWorkflowEntryAudit & { finalStage: string; inputAssetCount: number; importedAssetCount: number; requiredOutputsComplete: boolean };
  const audit = copy(base);
  if (result.status === "accepted") {
    if (result.acceptedKind === "provider-upload") return copy({ status: "accepted" as const, operation, acceptedKind: "provider-upload" as const, pending: result.pending, audit });
    return copy({ status: "accepted" as const, operation, acceptedKind: "generation-job" as const, job: result.job, audit });
  }
  if (result.status === "completed" || result.status === "degraded") return copy({ status: result.status, operation, assets: result.assets, requiredOutputsComplete: true as const, audit });
  if (result.status === "partial") return copy({
    status: "partial" as const, operation, assets: result.assets, requiredOutputsComplete: result.requiredOutputsComplete,
    issues: [{ reasonCode: "output-ingestion-partial" as const, classification: "failed" as const, retryable: false }], audit,
  });
  if (result.status === "cancelled") return copy({
    status: "cancelled" as const, operation, failureStage: base.finalStage,
    issues: [{ reasonCode: "workflow-cancelled" as const, classification: "cancelled" as const, retryable: false }], audit,
  });
  return copy({
    status: "failed" as const, operation, failureStage: base.finalStage,
    issues: [{ reasonCode: "configuration-invalid" as const, classification: "internal" as const, retryable: false }], audit,
  });
}
