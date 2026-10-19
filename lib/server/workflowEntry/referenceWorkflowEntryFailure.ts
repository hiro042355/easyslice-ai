import type { ProviderOperation } from "@/lib/providerClients/types";
import type { ReferenceWorkflowEntryAudit, ReferenceWorkflowEntryIssue, ReferenceWorkflowEntryResult } from "@/lib/workflowEntry/types";
import { copy } from "@/lib/workflowEntry/workflowEntryUtils";

/** Typed projection only: this function performs no state mutation or provider effect. */
export function createReferenceWorkflowEntryFailure(input: {
  operation: ProviderOperation;
  stage: string;
  classification: "invalid" | "internal";
  cancelled?: boolean;
  finalPersistenceStatus: ReferenceWorkflowEntryAudit["finalPersistenceStatus"];
  generationJobStatus?: string;
}): ReferenceWorkflowEntryResult {
  const status = input.cancelled ? "cancelled" : "failed";
  const reasonCode = input.cancelled ? "workflow-cancelled" : "internal-contract-mismatch";
  const issues: readonly (ReferenceWorkflowEntryIssue & { stage: string })[] = [{
    stage: input.stage, reasonCode, classification: input.cancelled ? "cancelled" : input.classification, retryable: false,
  }];
  const audit = {
    auditVersion: "1.0" as const, status, operation: input.operation,
    finalStage: input.stage, inputAssetCount: 0, importedAssetCount: 0,
    requiredOutputsComplete: false, asyncIntegrationUsed: true,
    ...(input.generationJobStatus ? { generationJobStatus: input.generationJobStatus } : {}),
    finalPersistenceStatus: input.finalPersistenceStatus, reasonCodes: [reasonCode],
  } satisfies ReferenceWorkflowEntryAudit & { finalStage: string; inputAssetCount: number; importedAssetCount: number; requiredOutputsComplete: boolean };
  const base = { operation: input.operation, failureStage: input.stage, issues, audit };
  return input.cancelled ? copy({ ...base, status: "cancelled" as const }) : copy({ ...base, status: "failed" as const });
}
