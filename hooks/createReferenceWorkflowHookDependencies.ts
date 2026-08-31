import { createReferenceWorkflowController } from "@/lib/workflowUi/referenceWorkflowController";
import type { WorkflowUiApiClient, WorkflowUiControllerDependencies, WorkflowUiOperation } from "@/lib/workflowUi/types";
import { createReferenceWorkflowControllerHolder } from "./referenceWorkflowControllerHolder";
import { createReferenceWorkflowHookFixture } from "./createReferenceWorkflowHookFixture";
import type { ReferenceWorkflowHookDependencies, ReferenceWorkflowHookFixtureConfig } from "./referenceWorkflowHookTypes";

type FetchInput = { mode: "fetch-reference"; operation: WorkflowUiOperation; apiClient: WorkflowUiApiClient; controllerDependencies: Omit<WorkflowUiControllerDependencies, "apiClient">; hookDependencies: Omit<ReferenceWorkflowHookDependencies, "controllerHolder"> };
type FixtureInput = { mode: "fixture"; config: ReferenceWorkflowHookFixtureConfig };
export type ReferenceWorkflowHookDependencyFactoryInput = FetchInput | FixtureInput;
export type ReferenceWorkflowHookDependencyFactoryResult = { status: "ready"; mode: "fixture" | "fetch-reference"; dependencies: ReferenceWorkflowHookDependencies } | { status: "invalid"; reason: "configuration-invalid" };
export function createReferenceWorkflowHookDependencies(input: ReferenceWorkflowHookDependencyFactoryInput): ReferenceWorkflowHookDependencyFactoryResult {
  if (input.mode === "fixture") return { status: "ready", mode: "fixture", dependencies: createReferenceWorkflowHookFixture(input.config).dependencies };
  const controllerHolder = createReferenceWorkflowControllerHolder({
    createController: () => createReferenceWorkflowController({ ...input.controllerDependencies, apiClient: input.apiClient }),
    environment: input.hookDependencies.environment,
  });
  return { status: "ready", mode: "fetch-reference", dependencies: Object.freeze({ ...input.hookDependencies, controllerHolder }) };
}
