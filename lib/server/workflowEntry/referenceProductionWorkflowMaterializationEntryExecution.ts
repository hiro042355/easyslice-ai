import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";
import {
  createProductionWorkflowMaterializationEntryExecution,
} from "./productionWorkflowMaterializationEntryExecution";

export const createReferenceProductionWorkflowMaterializationEntryExecution =
  (
    configuredResult: WorkflowMaterializationEntryResult,
    configuredError?: Error,
  ) => {
    const receivedInputs: WorkflowMaterializationEntryInput[] = [];
    const order: string[] = [];
    let invocations = 0;
    const productionWorkflowMaterializationEntryComposition =
      Object.freeze({
        integration: Object.freeze({
          async execute(
            input: WorkflowMaterializationEntryInput,
          ): Promise<WorkflowMaterializationEntryResult> {
            invocations += 1;
            order.push("workflow-materialization-entry-integration");
            receivedInputs.push(input);
            if (configuredError) throw configuredError;
            return configuredResult;
          },
        }),
      });

    return Object.freeze({
      execution:
        createProductionWorkflowMaterializationEntryExecution({
          productionWorkflowMaterializationEntryComposition,
        }),
      productionWorkflowMaterializationEntryComposition,
      invocationCount: () => invocations,
      invocationOrder: () => Object.freeze([...order]),
      receivedInputs: () => Object.freeze([...receivedInputs]),
    });
  };
