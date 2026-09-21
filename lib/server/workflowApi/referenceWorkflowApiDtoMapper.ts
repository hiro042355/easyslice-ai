// Server-only boundary. All API services in one lifecycle must share the injected reference vault.
import type { ReferenceWorkflowEntryResult } from "@/lib/workflowEntry/types";
import type { ReferenceWorkflowResult } from "@/lib/workflows/types";
import type { WorkflowApiOperation, WorkflowApiResultDTO, WorkflowApiServiceResult, WorkflowResultReferenceDTO } from "@/lib/workflowApi/types";
import { copy, validOpaque } from "@/lib/workflowApi/workflowApiUtils";
import { SAFE_WORKFLOW_API_HEADERS } from "./referenceWorkflowApiErrorMapper";
import type { WorkflowReferenceOwnership } from "./referenceWorkflowApiAuthProjector";
import type { ReferenceWorkflowApiReferenceVault } from "./referenceWorkflowApiReferenceVault";

export type ReferenceWorkflowApiMappableResult = ReferenceWorkflowResult | ReferenceWorkflowEntryResult;
export type ReferenceWorkflowApiDtoMapper = { mapResult(result: ReferenceWorkflowApiMappableResult, operation: WorkflowApiOperation, ownership: WorkflowReferenceOwnership, resultIdentity: string, acceptedIsNew?: boolean): { status: "mapped"; result: WorkflowApiServiceResult } | { status: "invalid" } };

export function createReferenceWorkflowApiDtoMapper(vault: ReferenceWorkflowApiReferenceVault): ReferenceWorkflowApiDtoMapper {
  const mapAssets = (input: readonly Record<string, unknown>[]) => {
    const seen = new Set<string>();
    const output = [];
    for (const asset of input) {
      if (!validOpaque(asset.assetId) || seen.has(asset.assetId as string) || !validOpaque(asset.mimeType, 128) || !validOpaque(asset.role, 64) || !validOpaque(asset.kind, 64)) return undefined;
      seen.add(asset.assetId as string);
      output.push({ assetVersion: "1.0" as const, assetId: asset.assetId, kind: asset.kind, role: asset.role, mimeType: asset.mimeType });
    }
    return output;
  };
  return { mapResult(result, operation, ownership, resultIdentity, acceptedIsNew = false) {
    let body: WorkflowApiResultDTO;
    const publicResult = "resultVersion" in result;
    if (result.status === "accepted" && result.acceptedKind === "provider-upload") {
      const reference = publicResult ? result.reference : vault.registerInternal("upload-pending", result.pending, ownership);
      if (reference.kind !== "upload-pending" || !validOpaque(reference.reference)) return { status: "invalid" };
      body = { responseVersion: "1.0", status: "pending-upload", operation, reference, retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "short" } };
    } else if (result.status === "accepted" && result.acceptedKind === "generation-job") {
      const reference = publicResult ? result.reference : vault.registerInternal("generation-job", result.job, ownership);
      if (reference.kind !== "generation-job" || !validOpaque(reference.reference)) return { status: "invalid" };
      body = { responseVersion: "1.0", status: "pending-generation", operation, reference, retryAdvice: { retryVersion: "1.0", retryable: true, retryAfterClass: "short" } };
    } else {
      const mappedAssets = result.status === "completed" || result.status === "degraded" || result.status === "partial" ? mapAssets(result.assets as readonly Record<string, unknown>[]) : undefined;
      if ((result.status === "completed" || result.status === "degraded" || result.status === "partial") && !mappedAssets) return { status: "invalid" };
      const existingReference = publicResult && "reference" in result ? result.reference : undefined;
      if (existingReference && (existingReference.kind !== "workflow-result" || !validOpaque(existingReference.reference))) return { status: "invalid" };
      const committed = existingReference ? { status: "existing" as const, reference: existingReference } : vault.commitTerminal(resultIdentity, ownership, resultReference => ({ responseVersion: "1.0", status: "failed", operation, error: { errorVersion: "1.0", code: "workflow-failed", message: "The workflow could not be completed.", retryable: false }, resultReference }));
      if (committed.status === "conflict") return { status: "invalid" };
      const resultReference = committed.reference as WorkflowResultReferenceDTO;
      if (result.status === "completed" || result.status === "degraded" || result.status === "partial") body = { responseVersion: "1.0", status: result.status, operation, assets: mappedAssets!, resultReference } as WorkflowApiResultDTO;
      else if (result.status === "cancelled") body = { responseVersion: "1.0", status: "cancelled", operation, resultReference };
      else body = { responseVersion: "1.0", status: "failed", operation, error: { errorVersion: "1.0", code: "workflow-failed", message: "The workflow could not be completed.", retryable: false }, resultReference };
    }
    return { status: "mapped", result: { status: "success", http: { statusCode: body.status.startsWith("pending-") ? (acceptedIsNew ? 202 : 200) : 200, headers: SAFE_WORKFLOW_API_HEADERS }, body: copy(body) } };
  } };
}
