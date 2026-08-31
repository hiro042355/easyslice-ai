import type { StartWorkflowRequest } from "@/lib/workflowApi/types";
import { copy, validateRequest } from "@/lib/workflowApi/workflowApiUtils";
import type { CanonicalWorkflowFixtureResult } from "@/lib/workflowFixtures/types";

export type CanonicalWorkflowStartRequest = Omit<StartWorkflowRequest, "idempotencyKey">;
export type CanonicalWorkflowApiProjectionIssue = { reasonCode: "canonical-api-projection-invalid" };
export type CanonicalWorkflowApiProjectionResult =
  | { status: "projected"; operation: CanonicalWorkflowStartRequest["operation"]; request: CanonicalWorkflowStartRequest }
  | { status: "invalid"; issues: readonly CanonicalWorkflowApiProjectionIssue[] };

const invalid = (): CanonicalWorkflowApiProjectionResult => ({ status: "invalid", issues: [{ reasonCode: "canonical-api-projection-invalid" }] });

export function projectCanonicalWorkflowStartRequest(fixture: CanonicalWorkflowFixtureResult): CanonicalWorkflowApiProjectionResult {
  if (fixture.status !== "ready") return invalid();
  let request: CanonicalWorkflowStartRequest;
  if (fixture.operation === "generate-vocal") {
    const input = fixture.input;
    const adapterInput = {
      contractVersion: input.adapterInput.contractVersion,
      projection: structuredClone(input.adapterInput.projection),
      assets: structuredClone(input.adapterInput.assets),
      constraints: structuredClone(input.adapterInput.constraints),
    };
    request = { requestVersion: "1.0", operation: "generate-vocal", workflowInput: { contractVersion: input.contractVersion, operation: "generate-vocal", durationSeconds: input.durationSeconds, assets: structuredClone(input.assets), adapterInput: structuredClone(adapterInput) } };
  } else if (fixture.operation === "generate-music") {
    const input = fixture.input;
    const publicAssets = {
      ...(input.adapterInput.assets.lyrics === undefined ? {} : { lyrics: input.adapterInput.assets.lyrics }),
      ...(input.adapterInput.assets.theme === undefined ? {} : { theme: input.adapterInput.assets.theme }),
      ...(input.adapterInput.assets.referenceAudioAsset === undefined
        ? {}
        : { referenceAudioAsset: structuredClone(input.adapterInput.assets.referenceAudioAsset) }),
    };
    const adapterInput = {
      contractVersion: input.adapterInput.contractVersion,
      projection: structuredClone(input.adapterInput.projection),
      constraints: structuredClone(input.adapterInput.constraints),
    };
    request = { requestVersion: "1.0", operation: "generate-music", workflowInput: { contractVersion: input.contractVersion, operation: "generate-music", durationSeconds: input.durationSeconds, assets: structuredClone(input.assets), adapterInput: { ...structuredClone(adapterInput), assets: structuredClone(publicAssets) } } };
  } else {
    const input = fixture.input;
    const adapterInput = {
      contractVersion: input.adapterInput.contractVersion,
      projection: structuredClone(input.adapterInput.projection),
      scenePlan: structuredClone(input.adapterInput.scenePlan),
      gate: structuredClone(input.adapterInput.gate),
      assets: structuredClone(input.adapterInput.assets),
      constraints: structuredClone(input.adapterInput.constraints),
    };
    request = { requestVersion: "1.0", operation: "generate-mv", workflowInput: { contractVersion: input.contractVersion, operation: "generate-mv", durationSeconds: input.durationSeconds, assets: structuredClone(input.assets), adapterInput: structuredClone(adapterInput) } };
  }
  const publicRequest = copy(request);
  const validated = validateRequest({ ...publicRequest, idempotencyKey: "canonical-projector-validation" });
  return validated.status === "valid" ? { status: "projected", operation: publicRequest.operation, request: copy(publicRequest) } : invalid();
}
