import type {
  AuthorityLocatorRuntimeBinding,
} from "../authorityLocatorRuntimeBinding/types";
import type {
  MaterializationRuntimeComposition,
} from "../inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  LocatorMaterializationHandoff,
} from "../locatorMaterializationHandoff/types";
import type {
  LocatorMaterializationRuntimeBindingCapability,
} from "../locatorMaterializationRuntimeBinding/types";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";

type WorkflowMaterializationEntryIntegrationDependencies = Readonly<{
  authorityLocatorBinding: AuthorityLocatorRuntimeBinding;
  handoff: LocatorMaterializationHandoff;
  materializationBinding: LocatorMaterializationRuntimeBindingCapability;
  materializationRuntimeComposition: MaterializationRuntimeComposition;
}>;

export const executeWorkflowMaterializationEntryIntegration = async (
  input: WorkflowMaterializationEntryInput,
  dependencies: WorkflowMaterializationEntryIntegrationDependencies,
): Promise<WorkflowMaterializationEntryResult> => {
  const authorityLocatorBindingResult =
    await dependencies.authorityLocatorBinding.execute(
      input.authorityLocatorBindingInput,
    );
  if (authorityLocatorBindingResult.status !== "completed") {
    return Object.freeze({
      workflowMaterializationEntryResultVersion: "1.0",
      authorityLocatorBindingResult,
    });
  }

  const handoffResult = dependencies.handoff.prepare({
    handoffVersion: "1.0",
    authorityLocatorBindingResult,
    workflowMaterializationRequest: input.materializationRequest,
    executionContext: input.materializationExecutionContext,
  });
  if (handoffResult.status !== "ready") {
    return Object.freeze({
      workflowMaterializationEntryResultVersion: "1.0",
      authorityLocatorBindingResult,
      handoffResult,
    });
  }

  const materializationRuntimeBindingResult =
    await dependencies.materializationBinding.bind({
      bindingInputVersion: "1.0",
      handoffResult,
      runtimeComposition:
        dependencies.materializationRuntimeComposition,
    });

  return Object.freeze({
    workflowMaterializationEntryResultVersion: "1.0",
    authorityLocatorBindingResult,
    handoffResult,
    materializationRuntimeBindingResult,
  });
};
