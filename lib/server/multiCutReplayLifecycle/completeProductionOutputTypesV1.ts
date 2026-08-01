import type {
  MultiCutReplayLifecycleCardinalityProjectionV1,
  MultiCutReplayLifecycleCompletedProjectionV1,
  MultiCutReplayLifecycleExecutionFailureProjectionV1,
  MultiCutReplayLifecycleZeroRowProjectionV1,
} from "./projectionTypesV1";

export type MultiCutReplayLifecycleCompleteProductionOutputVersionV1 = "1.0";

export type MultiCutReplayLifecycleCompleteProductionTransactionOwnershipV1 =
  Readonly<{
    ownershipVersion: "1.0";
    transactionOwner: "workflow-completion-transaction-owner";
    adapterOwnsTransaction: false;
    ownsStandaloneTransaction: false;
    adapterOwnsRetry: false;
    adapterOwnsRecovery: false;
    durableCompletionAuthority: "workflow-completion-transaction-owner";
  }>;

type OutputBase = Readonly<{
  schemaVersion: MultiCutReplayLifecycleCompleteProductionOutputVersionV1;
  contractVersion: MultiCutReplayLifecycleCompleteProductionOutputVersionV1;
  operationIdentity: "complete-replay-participation";
  transactionOwnership: MultiCutReplayLifecycleCompleteProductionTransactionOwnershipV1;
}>;

export type MultiCutReplayLifecycleCompleteProductionCompletedOutputV1 =
  Readonly<
    OutputBase & {
      status: "completed";
      durability: "pending-owner-commit";
      ownerAction: "continue-transaction";
      projection: MultiCutReplayLifecycleCompletedProjectionV1;
    }
  >;

export type MultiCutReplayLifecycleCompleteProductionNotAppliedOutputV1 =
  Readonly<
    OutputBase & {
      status: "not-applied";
      durability: "not-durable";
      ownerAction: "do-not-commit";
      projection: MultiCutReplayLifecycleZeroRowProjectionV1;
    }
  >;

export type MultiCutReplayLifecycleCompleteProductionInvariantOutputV1 =
  Readonly<
    OutputBase & {
      status: "internal-invariant-violation";
      durability: "not-durable";
      ownerAction: "rollback-required";
      projection: MultiCutReplayLifecycleCardinalityProjectionV1;
    }
  >;

export type MultiCutReplayLifecycleCompleteProductionExecutionFailureOutputV1 =
  Readonly<
    OutputBase & {
      status: "execution-failure";
      durability: "not-durable";
      ownerAction: "rollback-required";
      projection: MultiCutReplayLifecycleExecutionFailureProjectionV1;
    }
  >;

export type MultiCutReplayLifecycleCompleteProductionResultV1 =
  | MultiCutReplayLifecycleCompleteProductionCompletedOutputV1
  | MultiCutReplayLifecycleCompleteProductionNotAppliedOutputV1
  | MultiCutReplayLifecycleCompleteProductionInvariantOutputV1
  | MultiCutReplayLifecycleCompleteProductionExecutionFailureOutputV1;
