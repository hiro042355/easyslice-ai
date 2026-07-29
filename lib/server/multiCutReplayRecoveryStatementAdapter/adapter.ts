import {
  createMultiCutReplayPostgresqlAdapterRuntime,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayPostgresqlAdapterRuntimeFailureHook,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import type {
  MultiCutReplayRecoveryAffectedRowBoundary,
  MultiCutReplayRecoveryLookupStatementBinding,
  MultiCutReplayRecoveryRuntimeRequestBuilder,
  MultiCutReplayRecoveryStatementAdapter,
  MultiCutReplayRecoveryStatementAdapterDependencies,
  MultiCutReplayRecoveryStatementAdapterMetadata,
  MultiCutReplayRecoveryStatementAdapterRequest,
  MultiCutReplayRecoveryStatementBindings,
  MultiCutReplayRecoveryTakeoverStatementBinding,
} from "./types";

const [
  ,
  ,
  lookupStatementId,
  ,
  ,
  ,
  ,
  takeoverStatementId,
] = MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS;

const affectedRowBoundary: MultiCutReplayRecoveryAffectedRowBoundary =
  Object.freeze({
    success: "exactly-one",
    absence: "zero",
    multipleRows: "invariant-violation",
  });

const lookupCatalogEntry =
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[lookupStatementId];
const takeoverCatalogEntry =
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[takeoverStatementId];

const lookupBinding: MultiCutReplayRecoveryLookupStatementBinding =
  Object.freeze({
    bindingVersion: "1.0",
    operation: "lookup",
    statementId: lookupCatalogEntry.statementId,
    capabilityOwner: lookupCatalogEntry.capabilityOwner,
    accessMode: lookupCatalogEntry.accessMode,
    mutationClassification: lookupCatalogEntry.mutationClassification,
    transactionRequirement: lookupCatalogEntry.transactionRequirement,
    commitUnknownFollowUp: lookupCatalogEntry.commitUnknownStrategy,
    reconciliationRequirement: lookupCatalogEntry.reconciliationRequirement,
    affectedRowBoundary,
    readBoundary: "authoritative-state",
    authoritativeStates: Object.freeze([
      "processing",
      "completed",
      "failed",
      "released",
    ] as const),
    exposesReservationEvidence: false,
    resultReferenceVisibility: "completed-only",
    issuesNewFence: false,
    updatesLease: false,
    updatesRevision: false,
  });

const takeoverBinding: MultiCutReplayRecoveryTakeoverStatementBinding =
  Object.freeze({
    bindingVersion: "1.0",
    operation: "takeover",
    statementId: takeoverCatalogEntry.statementId,
    capabilityOwner: takeoverCatalogEntry.capabilityOwner,
    accessMode: takeoverCatalogEntry.accessMode,
    mutationClassification: takeoverCatalogEntry.mutationClassification,
    transactionRequirement: takeoverCatalogEntry.transactionRequirement,
    commitUnknownFollowUp: takeoverCatalogEntry.commitUnknownStrategy,
    reconciliationRequirement: takeoverCatalogEntry.reconciliationRequirement,
    affectedRowBoundary,
    targetState: "stale-processing-only",
    issuesNewFence: true,
    advancesReservationAttempt: true,
    advancesRevision: true,
    updatesLeaseExpiry: true,
    comparesPreviousOwnership: true,
    requestedNextReservationIdentity: "retained",
    requestedNextLeaseIdentity: "retained",
    callerGeneratedFenceAllowed: false,
    callerGeneratedAuthoritativeLeaseExpiryAllowed: false,
    reconciliationBoundary: Object.freeze({
      mutation: "takeover",
      previousReservationEvidence: "retained",
      authoritativeReservationEvidence: "projection-hook",
      algorithmOwner: "recovery-capability",
    }),
  });

export const MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS:
  MultiCutReplayRecoveryStatementBindings = Object.freeze({
    lookup: lookupBinding,
    takeover: takeoverBinding,
  });

export const MULTI_CUT_REPLAY_RECOVERY_RUNTIME_REQUEST_BUILDER:
  MultiCutReplayRecoveryRuntimeRequestBuilder = Object.freeze({
    build(binding, request) {
      return Object.freeze({
        requestVersion: "1.0",
        statementId: binding.statementId,
        parameters: Object.freeze(
          binding.operation === "takeover" &&
            "reconciliationInput" in request
            ? {
              recoveryInput: request.recoveryInput,
              reconciliationInput: request.reconciliationInput,
            }
            : {
              recoveryInput: request.recoveryInput,
            },
        ),
        transactionContext: request.transactionContext,
      });
    },
  });

const buildRuntimeRequest = <
  Operation extends MultiCutReplayRecoveryStatementAdapterMetadata["operation"],
>(
  binding: Extract<
    MultiCutReplayRecoveryStatementAdapterMetadata,
    { readonly operation: Operation }
  >,
  request: MultiCutReplayRecoveryStatementAdapterRequest<Operation>,
) =>
  MULTI_CUT_REPLAY_RECOVERY_RUNTIME_REQUEST_BUILDER.build(binding, request);

export const createMultiCutReplayRecoveryStatementAdapter = <
  Projection,
  FailureProjection,
  ReconciliationProjection,
>(
  dependencies: MultiCutReplayRecoveryStatementAdapterDependencies<
    Projection,
    FailureProjection,
    ReconciliationProjection
  >,
): MultiCutReplayRecoveryStatementAdapter<
  Projection,
  FailureProjection,
  ReconciliationProjection
> => {
  const lookupRuntime =
    createMultiCutReplayPostgresqlAdapterRuntime<
      Projection,
      FailureProjection | ReconciliationProjection
    >({
      executor: dependencies.executor,
      projectionHook: dependencies.projectionHook,
      failureHook: dependencies.failureHook,
    });
  const takeoverFailureHook:
    MultiCutReplayPostgresqlAdapterRuntimeFailureHook<
      FailureProjection | ReconciliationProjection
    > = Object.freeze({
      projectFailure(context) {
        return context.executionResult.status === "commit-unknown"
          ? dependencies.reconciliationHook.projectReconciliation(context)
          : dependencies.failureHook.projectFailure(context);
      },
    });
  const takeoverRuntime =
    createMultiCutReplayPostgresqlAdapterRuntime<
      Projection,
      FailureProjection | ReconciliationProjection
    >({
      executor: dependencies.executor,
      projectionHook: dependencies.projectionHook,
      failureHook: takeoverFailureHook,
    });

  return Object.freeze({
    dispatchLookup(request) {
      return lookupRuntime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.lookup,
          request,
        ),
      );
    },
    dispatchTakeover(request) {
      return takeoverRuntime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.takeover,
          request,
        ),
      );
    },
  });
};
