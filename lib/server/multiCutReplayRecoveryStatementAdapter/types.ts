import type {
  MultiCutReplayRecoveryLookupInput,
  MultiCutReplayRecoveryTakeoverInput,
  MultiCutReplayReservationMutationReconciliationInput,
} from "../multiCutReplayLifecycle/types";
import type {
  MultiCutReplayPostgresqlAdapterRuntimeExecutor,
  MultiCutReplayPostgresqlAdapterRuntimeFailureContext,
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook,
  MultiCutReplayPostgresqlAdapterRuntimeProjectionHook,
  MultiCutReplayPostgresqlAdapterRuntimeRequest,
  MultiCutReplayPostgresqlAdapterRuntimeResult,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import type {
  MultiCutReplayPostgresqlTransactionContext,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayRecoveryStatementOperation =
  | "lookup"
  | "takeover";

type TakeoverReconciliationInput = Extract<
  MultiCutReplayReservationMutationReconciliationInput,
  { readonly mutation: "takeover" }
>;

export type MultiCutReplayRecoveryStatementAdapterRequest<
  Operation extends MultiCutReplayRecoveryStatementOperation =
    MultiCutReplayRecoveryStatementOperation,
> = Operation extends "lookup"
  ? Readonly<{
    requestVersion: "1.0";
    recoveryInput: MultiCutReplayRecoveryLookupInput;
    transactionContext: MultiCutReplayPostgresqlTransactionContext;
  }>
  : Readonly<{
    requestVersion: "1.0";
    recoveryInput: MultiCutReplayRecoveryTakeoverInput;
    reconciliationInput: TakeoverReconciliationInput;
    transactionContext:
      MultiCutReplayPostgresqlTransactionContext &
        Readonly<{ scope: "required" }>;
  }>;

export type MultiCutReplayRecoveryAffectedRowBoundary = Readonly<{
  success: "exactly-one";
  absence: "zero";
  multipleRows: "invariant-violation";
}>;

type RecoveryStatementBindingBase<
  Operation extends MultiCutReplayRecoveryStatementOperation,
> = Readonly<{
  bindingVersion: "1.0";
  operation: Operation;
  statementId: MultiCutReplayPostgresqlStatementId;
  capabilityOwner: "recovery";
  affectedRowBoundary: MultiCutReplayRecoveryAffectedRowBoundary;
}>;

export type MultiCutReplayRecoveryLookupStatementBinding = Readonly<
  RecoveryStatementBindingBase<"lookup"> & {
    accessMode: "read";
    mutationClassification: "none";
    transactionRequirement: "read-consistent";
    commitUnknownFollowUp: "not-applicable";
    reconciliationRequirement: "none";
    readBoundary: "authoritative-state";
    authoritativeStates: readonly [
      "processing",
      "completed",
      "failed",
      "released",
    ];
    exposesReservationEvidence: false;
    resultReferenceVisibility: "completed-only";
    issuesNewFence: false;
    updatesLease: false;
    updatesRevision: false;
  }
>;

export type MultiCutReplayRecoveryTakeoverStatementBinding = Readonly<
  RecoveryStatementBindingBase<"takeover"> & {
    accessMode: "write";
    mutationClassification: "ownership-takeover";
    transactionRequirement: "required";
    commitUnknownFollowUp: "reservation-reconciliation";
    reconciliationRequirement: "reservation-mutation";
    targetState: "stale-processing-only";
    issuesNewFence: true;
    advancesReservationAttempt: true;
    advancesRevision: true;
    updatesLeaseExpiry: true;
    comparesPreviousOwnership: true;
    requestedNextReservationIdentity: "retained";
    requestedNextLeaseIdentity: "retained";
    callerGeneratedFenceAllowed: false;
    callerGeneratedAuthoritativeLeaseExpiryAllowed: false;
    reconciliationBoundary: Readonly<{
      mutation: "takeover";
      previousReservationEvidence: "retained";
      authoritativeReservationEvidence: "projection-hook";
      algorithmOwner: "recovery-capability";
    }>;
  }
>;

export type MultiCutReplayRecoveryStatementAdapterMetadata =
  | MultiCutReplayRecoveryLookupStatementBinding
  | MultiCutReplayRecoveryTakeoverStatementBinding;

export type MultiCutReplayRecoveryStatementBindings = Readonly<{
  lookup: MultiCutReplayRecoveryLookupStatementBinding;
  takeover: MultiCutReplayRecoveryTakeoverStatementBinding;
}>;

export type MultiCutReplayRecoveryStatementProjectionHook<Projection> =
  MultiCutReplayPostgresqlAdapterRuntimeProjectionHook<Projection>;

export type MultiCutReplayRecoveryStatementFailureHook<FailureProjection> =
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook<FailureProjection>;

export type MultiCutReplayRecoveryStatementReconciliationContext =
  MultiCutReplayPostgresqlAdapterRuntimeFailureContext;

export type MultiCutReplayRecoveryStatementReconciliationHook<
  ReconciliationProjection,
> = Readonly<{
  projectReconciliation(
    context: MultiCutReplayRecoveryStatementReconciliationContext,
  ): ReconciliationProjection | Promise<ReconciliationProjection>;
}>;

export type MultiCutReplayRecoveryStatementAdapterDependencies<
  Projection,
  FailureProjection,
  ReconciliationProjection,
> = Readonly<{
  executor: MultiCutReplayPostgresqlAdapterRuntimeExecutor;
  projectionHook:
    MultiCutReplayRecoveryStatementProjectionHook<Projection>;
  failureHook:
    MultiCutReplayRecoveryStatementFailureHook<FailureProjection>;
  reconciliationHook:
    MultiCutReplayRecoveryStatementReconciliationHook<
      ReconciliationProjection
    >;
}>;

export type MultiCutReplayRecoveryStatementAdapterResult<
  Projection,
  FailureProjection,
  ReconciliationProjection,
> = MultiCutReplayPostgresqlAdapterRuntimeResult<
  Projection,
  FailureProjection | ReconciliationProjection
>;

export type MultiCutReplayRecoveryStatementAdapter<
  Projection,
  FailureProjection,
  ReconciliationProjection,
> = Readonly<{
  dispatchLookup(
    request: MultiCutReplayRecoveryStatementAdapterRequest<"lookup">,
  ): Promise<
    MultiCutReplayRecoveryStatementAdapterResult<
      Projection,
      FailureProjection,
      ReconciliationProjection
    >
  >;
  dispatchTakeover(
    request: MultiCutReplayRecoveryStatementAdapterRequest<"takeover">,
  ): Promise<
    MultiCutReplayRecoveryStatementAdapterResult<
      Projection,
      FailureProjection,
      ReconciliationProjection
    >
  >;
}>;

export type MultiCutReplayRecoveryRuntimeRequestBuilder = Readonly<{
  build<Operation extends MultiCutReplayRecoveryStatementOperation>(
    binding: Extract<
      MultiCutReplayRecoveryStatementAdapterMetadata,
      { readonly operation: Operation }
    >,
    request: MultiCutReplayRecoveryStatementAdapterRequest<Operation>,
  ): MultiCutReplayPostgresqlAdapterRuntimeRequest;
}>;
