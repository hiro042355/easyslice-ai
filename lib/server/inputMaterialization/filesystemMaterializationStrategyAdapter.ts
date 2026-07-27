import {
  copyMaterializationRuntimeProviderInput,
} from "./materializationRuntimeProviderValidation";
import {
  copyInputMaterializationDecision,
} from "./productionMaterializationProvider";
import type {
  FilesystemMaterializationStrategyAdapter,
  FilesystemMaterializationStrategyAdapterDependencies,
} from "./filesystemMaterializationStrategyAdapterTypes";

export const createFilesystemMaterializationStrategyAdapter = (
  dependencies: FilesystemMaterializationStrategyAdapterDependencies,
): FilesystemMaterializationStrategyAdapter => Object.freeze({
  async materialize(input) {
    const copiedInput = copyMaterializationRuntimeProviderInput(input);
    const decision = await dependencies.filesystemAdapter.materialize(
      copiedInput.handoffResult.workflowMaterializationRequest
        .materializationRequest,
      copiedInput.handoffResult.executionContext,
    );
    return copyInputMaterializationDecision(decision);
  },
});
