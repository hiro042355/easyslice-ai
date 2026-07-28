import type {
  MultiCutReplayLifecycleInput,
} from "../multiCutReplayLifecycle/types";
import type {
  MultiCutReplayPostgresqlTransactionContext,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlAdapterRuntimeDependencies,
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook,
  MultiCutReplayPostgresqlAdapterRuntimeProjectionHook,
  MultiCutReplayPostgresqlAdapterRuntimeRequest,
  MultiCutReplayPostgresqlAdapterRuntimeResult,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import type {
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayLifecycleStatementOperation =
  | "renew"
  | "complete"
  | "fail"
  | "release";

type RequiredTransactionContext =
  MultiCutReplayPostgresqlTransactionContext & Readonly<{
    scope: "required";
  }>;

type WorkflowCompletionTransactionContext =
  MultiCutReplayPostgresqlTransactionContext & Readonly<{
    scope: "workflow-completion";
  }>;

export type MultiCutReplayLifecycleStatementAdapterRequest<
  Operation extends MultiCutReplayLifecycleStatementOperation =
    MultiCutReplayLifecycleStatementOperation,
> = Readonly<{
  requestVersion: "1.0";
  lifecycleInput: Extract<
    MultiCutReplayLifecycleInput,
    { readonly transition: Operation }
  >;
  transactionContext: Operation extends "complete"
    ? WorkflowCompletionTransactionContext
    : RequiredTransactionContext;
}>;

export type MultiCutReplayLifecycleAffectedRowBoundary = Readonly<{
  success: "exactly-one";
  absence: "zero";
  multipleRows: "invariant-violation";
}>;

type LifecycleStatementBindingBase<
  Operation extends MultiCutReplayLifecycleStatementOperation,
> = Readonly<{
  bindingVersion: "1.0";
  operation: Operation;
  statementId: MultiCutReplayPostgresqlStatementId;
  accessMode: "write";
  mutationClassification:
    | "reservation-refresh"
    | "terminal-transition";
  transactionRequirement:
    | "required"
    | "workflow-completion-transaction";
  commitUnknownFollowUp:
    | "reservation-reconciliation"
    | "workflow-completion-recovery"
    | "authoritative-lookup";
  reconciliationRequirement: "reservation-mutation" | "none";
  affectedRowBoundary: MultiCutReplayLifecycleAffectedRowBoundary;
  issuesNewFence: false;
}>;

export type MultiCutReplayLifecycleRenewStatementBinding = Readonly<
  LifecycleStatementBindingBase<"renew"> & {
    mutationClassification: "reservation-refresh";
    transactionRequirement: "required";
    commitUnknownFollowUp: "reservation-reconciliation";
    reconciliationRequirement: "reservation-mutation";
    preservationBoundary: Readonly<{
      replayIdentity: "preserved";
      reservationIdentity: "preserved";
      leaseIdentity: "preserved";
      fencingToken: "preserved";
      reservationAttempt: "preserved";
      revision: "advanced";
      leaseExpiry: "updated";
    }>;
  }
>;

export type MultiCutReplayLifecycleTerminalStatementBinding<
  Operation extends "complete" | "fail" | "release",
> = Readonly<
  LifecycleStatementBindingBase<Operation> & {
    mutationClassification: "terminal-transition";
    reconciliationRequirement: "none";
    returnsReservationEvidence: false;
    generatesResultReference: false;
  }
>;

export type MultiCutReplayLifecycleCompleteStatementBinding = Readonly<
  MultiCutReplayLifecycleTerminalStatementBinding<"complete"> & {
    transactionRequirement: "workflow-completion-transaction";
    commitUnknownFollowUp: "workflow-completion-recovery";
    participatesInWorkflowCompletionPersistenceTransaction: true;
    ownsStandaloneTransaction: false;
    generatesFinalResult: false;
    orchestratesWorkflow: false;
  }
>;

export type MultiCutReplayLifecycleFailStatementBinding =
  MultiCutReplayLifecycleTerminalStatementBinding<"fail"> &
    Readonly<{
      transactionRequirement: "required";
      commitUnknownFollowUp: "authoritative-lookup";
      returnsResultReference: false;
    }>;

export type MultiCutReplayLifecycleReleaseStatementBinding =
  MultiCutReplayLifecycleTerminalStatementBinding<"release"> &
    Readonly<{
      transactionRequirement: "required";
      commitUnknownFollowUp: "authoritative-lookup";
      returnsResultReference: false;
      rereservationOwner: "resolution";
    }>;

export type MultiCutReplayLifecycleStatementAdapterMetadata =
  | MultiCutReplayLifecycleRenewStatementBinding
  | MultiCutReplayLifecycleCompleteStatementBinding
  | MultiCutReplayLifecycleFailStatementBinding
  | MultiCutReplayLifecycleReleaseStatementBinding;

export type MultiCutReplayLifecycleStatementBindings = Readonly<{
  renew: MultiCutReplayLifecycleRenewStatementBinding;
  complete: MultiCutReplayLifecycleCompleteStatementBinding;
  fail: MultiCutReplayLifecycleFailStatementBinding;
  release: MultiCutReplayLifecycleReleaseStatementBinding;
}>;

export type MultiCutReplayLifecycleStatementProjectionHook<Projection> =
  MultiCutReplayPostgresqlAdapterRuntimeProjectionHook<Projection>;

export type MultiCutReplayLifecycleStatementFailureHook<FailureProjection> =
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook<FailureProjection>;

export type MultiCutReplayLifecycleStatementAdapterDependencies<
  Projection,
  FailureProjection,
> = MultiCutReplayPostgresqlAdapterRuntimeDependencies<
  Projection,
  FailureProjection
>;

export type MultiCutReplayLifecycleStatementAdapterResult<
  Projection,
  FailureProjection,
> = MultiCutReplayPostgresqlAdapterRuntimeResult<
  Projection,
  FailureProjection
>;

export type MultiCutReplayLifecycleStatementAdapter<
  Projection,
  FailureProjection,
> = Readonly<{
  dispatchRenew(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"renew">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  dispatchComplete(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"complete">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  dispatchFail(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"fail">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
  dispatchRelease(
    request: MultiCutReplayLifecycleStatementAdapterRequest<"release">,
  ): Promise<
    MultiCutReplayLifecycleStatementAdapterResult<
      Projection,
      FailureProjection
    >
  >;
}>;

export type MultiCutReplayLifecycleRuntimeRequestBuilder = Readonly<{
  build<Operation extends MultiCutReplayLifecycleStatementOperation>(
    binding: Extract<
      MultiCutReplayLifecycleStatementAdapterMetadata,
      { readonly operation: Operation }
    >,
    request: MultiCutReplayLifecycleStatementAdapterRequest<Operation>,
  ): MultiCutReplayPostgresqlAdapterRuntimeRequest;
}>;
