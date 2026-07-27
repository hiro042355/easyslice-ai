import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";
import type {
  createProductionWorkflowMaterializationEntryComposition,
} from "./productionWorkflowMaterializationEntryComposition";

type ProductionWorkflowMaterializationEntryComposition =
  ReturnType<
    typeof createProductionWorkflowMaterializationEntryComposition
  >;

type ProductionWorkflowMaterializationEntryExecutionDependencies =
  Readonly<{
    productionWorkflowMaterializationEntryComposition:
      Pick<ProductionWorkflowMaterializationEntryComposition, "integration">;
  }>;

export const createProductionWorkflowMaterializationEntryExecution = (
  dependencies:
    ProductionWorkflowMaterializationEntryExecutionDependencies,
) => Object.freeze({
  execute(
    input: WorkflowMaterializationEntryInput,
  ): Promise<WorkflowMaterializationEntryResult> {
    return dependencies.productionWorkflowMaterializationEntryComposition
      .integration.execute(input);
  },
});
