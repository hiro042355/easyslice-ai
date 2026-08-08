import type { WorkflowCompletionTransitionRequestV1 } from "../workflowCompletionState";
import type { DurableWorkflowSameSessionQueryCapabilityV2 } from "../productionWorkflowRuntime/durableTransaction/sameSessionQueryTypes";
import { executeWorkflowCompletionStateTransitionV2 } from "./executorV2";
import type { WorkflowCompletionStatePostgresqlExecutorResultV2 } from "./typesV2";

export type WorkflowCompletionStateSameSessionParticipantV1 = Readonly<{
  participantVersion: "1.0";
  transactionOwnership: "workflow-owner";
  ownsTransactionLifecycle: false;
  transition(
    request: WorkflowCompletionTransitionRequestV1,
  ): Promise<WorkflowCompletionStatePostgresqlExecutorResultV2>;
}>;

export type WorkflowCompletionStateSameSessionParticipantFactoryInputV1 =
  Readonly<{
    factoryVersion: "1.0";
    sameSessionQuery: DurableWorkflowSameSessionQueryCapabilityV2;
  }>;

export function createWorkflowCompletionStateSameSessionParticipantV1(
  input: WorkflowCompletionStateSameSessionParticipantFactoryInputV1,
): WorkflowCompletionStateSameSessionParticipantV1 {
  const query = input.sameSessionQuery;
  return Object.freeze({
    participantVersion: "1.0",
    transactionOwnership: "workflow-owner",
    ownsTransactionLifecycle: false,
    transition(request) {
      return executeWorkflowCompletionStateTransitionV2(Object.freeze({
        inputVersion: "2.0",
        query,
        transitionRequest: request,
      }));
    },
  });
}
