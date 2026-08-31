import type { ReferenceWorkflowStartFixtureBootstrapClientResult } from "@/lib/workflowFetchClient/referenceWorkflowStartFixtureBootstrapClient";
import type { WorkflowUiControllerInput, WorkflowUiProjector } from "@/lib/workflowUi/types";
import { copyWorkflowUi } from "@/lib/workflowUi/workflowUiUtils";
type Ready = Extract<ReferenceWorkflowStartFixtureBootstrapClientResult, { status: "ready" }>;
export const referenceWorkflowBootstrapStartProjector: WorkflowUiProjector<ReferenceWorkflowStartFixtureBootstrapClientResult, WorkflowUiControllerInput> = Object.freeze({ project(input) { if (input.status !== "ready" || input.operation !== input.request.operation) return { status: "invalid", reason: "input-invalid" }; const request: WorkflowUiControllerInput = { operation: input.operation, request: copyWorkflowUi(input.request) }; return { status: "projected", request }; } });
export function copyReferenceWorkflowBootstrapReadyResult(input: Ready): Ready { return copyWorkflowUi(input); }
