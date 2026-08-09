import type {
  MultiCutReplayCompleteLifecycleInputV4,
  MultiCutReplayCompleteParameterInputVersionAuthorityV1,
} from "../multiCutReplayPersistenceParameters";
import type {
  MultiCutReplayLifecycleCompleteAdapterResultV1,
  MultiCutReplayLifecycleCompleteProductionAdapter,
} from "../multiCutReplayLifecycle";
import type { MultiCutReplayAuthoritativeIdentity } from "../multiCutReplayShared/types";
import type { DurableWorkflowTransactionContextV3 } from "../productionWorkflowRuntime/durableTransaction";
import type { DurableWorkflowTransactionContextV4 } from "../productionWorkflowRuntime/durableTransaction";
import type {
  MultiCutReplayLifecycleCompleteProductionAdapterV2,
  MultiCutReplayLifecycleCompleteResultV2,
} from "../multiCutReplayLifecycle";

export type WorkflowCompletionReplayBindingVersionV1 = "1.0";

export type WorkflowCompletionReplayAuthorityV1 = Readonly<{
  authorityVersion: "1.0";
  authoritativeReplayIdentity: MultiCutReplayAuthoritativeIdentity;
  completionTimestamp: string;
  parameterVersionAuthority: MultiCutReplayCompleteParameterInputVersionAuthorityV1;
}>;

export type WorkflowCompletionReplayBindingInputV1 = Readonly<{
  inputVersion: WorkflowCompletionReplayBindingVersionV1;
  transactionContext: DurableWorkflowTransactionContextV3;
  lifecycleInput: MultiCutReplayCompleteLifecycleInputV4;
  authority: WorkflowCompletionReplayAuthorityV1;
}>;

export type WorkflowCompletionReplayBindingDependenciesV1 = Readonly<{
  lifecycleCompleteAdapter: MultiCutReplayLifecycleCompleteProductionAdapter;
}>;

export type WorkflowCompletionReplayBindingV1 = Readonly<{
  bindingVersion: WorkflowCompletionReplayBindingVersionV1;
  executeReplayCompletion(
    input: WorkflowCompletionReplayBindingInputV1,
  ): Promise<MultiCutReplayLifecycleCompleteAdapterResultV1>;
}>;

export type WorkflowCompletionReplayBindingInputV2 = Readonly<{
  inputVersion: "2.0";
  transactionContext: DurableWorkflowTransactionContextV4;
  lifecycleInput: MultiCutReplayCompleteLifecycleInputV4;
  authority: WorkflowCompletionReplayAuthorityV1;
}>;

export type WorkflowCompletionReplayBindingDependenciesV2 = Readonly<{
  lifecycleCompleteAdapter: MultiCutReplayLifecycleCompleteProductionAdapterV2;
}>;

export type WorkflowCompletionReplayBindingV2 = Readonly<{
  bindingVersion: "2.0";
  executeReplayCompletion(
    input: WorkflowCompletionReplayBindingInputV2,
  ): Promise<MultiCutReplayLifecycleCompleteResultV2>;
}>;
