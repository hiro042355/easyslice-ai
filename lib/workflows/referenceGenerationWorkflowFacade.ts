import type {ReferenceWorkflowResult} from "./types";
import type {ReferenceWorkflowInput} from "./referenceWorkflowTypes";
import type {ReferenceWorkflowExecutionDependencies,ReferenceWorkflowLogicalAssetRequirement} from "@/lib/workflowEntry/types";
import {getReferenceIntegrationBinding} from "@/lib/server/workflowComposition/referenceIntegrationBindingCatalog";

export type ReferenceGenerationWorkflowFacadeStrategy<
  TInput extends ReferenceWorkflowInput,
  TRequest extends object,
> = Readonly<{
  build(input: TInput["adapterInput"]): Readonly<{
    status: string;
    request?: TRequest;
  }>;
  projectAssets(
    request: TRequest,
    input: TInput,
  ): readonly ReferenceWorkflowLogicalAssetRequirement[] | undefined;
}>;

const facadeFailure = (
  operation: ReferenceWorkflowInput["operation"],
  reasonCode: "configuration-invalid" | "request-invalid",
): ReferenceWorkflowResult => Object.freeze({
  resultVersion: "1.0",
  operation,
  status: "failed",
  failureStage: "workflow-orchestration",
  issues: Object.freeze([Object.freeze({
    stage: "workflow-orchestration",
    reasonCode,
    classification: reasonCode === "request-invalid" ? "invalid" : "internal",
    retryable: false,
  })]),
  audit: Object.freeze({
    auditVersion: "1.0",
    status: "failed",
    operation,
    finalStage: "workflow-orchestration",
    reasonCodes: Object.freeze([reasonCode]),
  }),
});

export async function runReferenceGenerationWorkflow<
  TInput extends ReferenceWorkflowInput,
  TRequest extends object,
>(
  input: TInput,
  strategy: ReferenceGenerationWorkflowFacadeStrategy<TInput, TRequest>,
  dependencies?: ReferenceWorkflowExecutionDependencies,
): Promise<ReferenceWorkflowResult> {
  if (input.contractVersion !== "1.0" || input.context.scenario !== "success") {
    return facadeFailure(input.operation, "request-invalid");
  }
  const binding = getReferenceIntegrationBinding(input.operation);
  if (!binding || binding.operation !== input.operation) {
    return facadeFailure(input.operation, "configuration-invalid");
  }
  const built = strategy.build(input.adapterInput);
  if ((built.status !== "ready" && built.status !== "degraded") || !built.request) {
    return facadeFailure(input.operation, "request-invalid");
  }
  const logicalAssets = strategy.projectAssets(built.request, input);
  if (!logicalAssets) return facadeFailure(input.operation, "request-invalid");
  if (!dependencies?.orchestration) {
    return facadeFailure(input.operation, "configuration-invalid");
  }
  return dependencies.orchestration.execute(Object.freeze({
    contractVersion: "1.0",
    scenario: "success",
    operation: input.operation,
    workflowInput: input,
    adapterRequest: built.request,
    logicalAssets: Object.freeze([...logicalAssets]),
    integrationBinding: binding,
  }));
}
