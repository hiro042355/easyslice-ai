import {
  projectMultiCutReplayCompleteParticipationResultToLifecycleV1,
} from "./projectionContractV1";
import type { MultiCutReplayLifecycleProjectionResultV1 } from "./projectionTypesV1";
import type {
  MultiCutReplayLifecycleCompleteProductionResultV1,
  MultiCutReplayLifecycleCompleteProductionTransactionOwnershipV1,
} from "./completeProductionOutputTypesV1";

export const MULTI_CUT_REPLAY_LIFECYCLE_COMPLETE_PRODUCTION_TRANSACTION_OWNERSHIP_V1:
  MultiCutReplayLifecycleCompleteProductionTransactionOwnershipV1 =
  Object.freeze({
    ownershipVersion: "1.0",
    transactionOwner: "workflow-completion-transaction-owner",
    adapterOwnsTransaction: false,
    ownsStandaloneTransaction: false,
    adapterOwnsRetry: false,
    adapterOwnsRecovery: false,
    durableCompletionAuthority: "workflow-completion-transaction-owner",
  });

const base = () => Object.freeze({
  schemaVersion: "1.0" as const,
  contractVersion: "1.0" as const,
  operationIdentity: "complete-replay-participation" as const,
  transactionOwnership:
    MULTI_CUT_REPLAY_LIFECYCLE_COMPLETE_PRODUCTION_TRANSACTION_OWNERSHIP_V1,
});

export const createMultiCutReplayLifecycleCompleteProductionOutputV1 = (
  input: MultiCutReplayLifecycleProjectionResultV1,
): MultiCutReplayLifecycleCompleteProductionResultV1 => {
  const projection =
    projectMultiCutReplayCompleteParticipationResultToLifecycleV1(
      input.participationEvidence,
    );
  switch (projection.status) {
    case "completed-candidate":
      return Object.freeze({
        ...base(),
        status: "completed",
        durability: "pending-owner-commit",
        ownerAction: "continue-transaction",
        projection,
      });
    case "not-applied":
      return Object.freeze({
        ...base(),
        status: "not-applied",
        durability: "not-durable",
        ownerAction: "do-not-commit",
        projection,
      });
    case "internal-invariant-violation":
      return Object.freeze({
        ...base(),
        status: "internal-invariant-violation",
        durability: "not-durable",
        ownerAction: "rollback-required",
        projection,
      });
    case "unavailable":
      return Object.freeze({
        ...base(),
        status: "execution-failure",
        durability: "not-durable",
        ownerAction: "rollback-required",
        projection,
      });
  }
  const unreachable: never = projection;
  return unreachable;
};
