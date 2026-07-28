import {
  createMultiCutReplayPostgresqlAdapterRuntime,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayLifecycleAffectedRowBoundary,
  MultiCutReplayLifecycleCompleteStatementBinding,
  MultiCutReplayLifecycleFailStatementBinding,
  MultiCutReplayLifecycleReleaseStatementBinding,
  MultiCutReplayLifecycleRenewStatementBinding,
  MultiCutReplayLifecycleRuntimeRequestBuilder,
  MultiCutReplayLifecycleStatementAdapter,
  MultiCutReplayLifecycleStatementAdapterDependencies,
  MultiCutReplayLifecycleStatementAdapterMetadata,
  MultiCutReplayLifecycleStatementAdapterRequest,
  MultiCutReplayLifecycleStatementBindings,
} from "./types";

const [
  ,
  ,
  ,
  renewStatementId,
  completeStatementId,
  failStatementId,
  releaseStatementId,
] = MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS;

const affectedRowBoundary: MultiCutReplayLifecycleAffectedRowBoundary =
  Object.freeze({
    success: "exactly-one",
    absence: "zero",
    multipleRows: "invariant-violation",
  });

const renewCatalogEntry =
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[renewStatementId];
const completeCatalogEntry =
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[completeStatementId];
const failCatalogEntry =
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[failStatementId];
const releaseCatalogEntry =
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[releaseStatementId];

const renewBinding: MultiCutReplayLifecycleRenewStatementBinding =
  Object.freeze({
    bindingVersion: "1.0",
    operation: "renew",
    statementId: renewCatalogEntry.statementId,
    accessMode: renewCatalogEntry.accessMode,
    mutationClassification: renewCatalogEntry.mutationClassification,
    transactionRequirement: renewCatalogEntry.transactionRequirement,
    commitUnknownFollowUp: renewCatalogEntry.commitUnknownStrategy,
    reconciliationRequirement: renewCatalogEntry.reconciliationRequirement,
    affectedRowBoundary,
    issuesNewFence: false,
    preservationBoundary: Object.freeze({
      replayIdentity: "preserved",
      reservationIdentity: "preserved",
      leaseIdentity: "preserved",
      fencingToken: "preserved",
      reservationAttempt: "preserved",
      revision: "advanced",
      leaseExpiry: "updated",
    }),
  });

const completeBinding: MultiCutReplayLifecycleCompleteStatementBinding =
  Object.freeze({
    bindingVersion: "1.0",
    operation: "complete",
    statementId: completeCatalogEntry.statementId,
    accessMode: completeCatalogEntry.accessMode,
    mutationClassification: completeCatalogEntry.mutationClassification,
    transactionRequirement: completeCatalogEntry.transactionRequirement,
    commitUnknownFollowUp: completeCatalogEntry.commitUnknownStrategy,
    reconciliationRequirement: completeCatalogEntry.reconciliationRequirement,
    affectedRowBoundary,
    issuesNewFence: false,
    returnsReservationEvidence: false,
    generatesResultReference: false,
    participatesInWorkflowCompletionPersistenceTransaction: true,
    ownsStandaloneTransaction: false,
    generatesFinalResult: false,
    orchestratesWorkflow: false,
  });

const failBinding: MultiCutReplayLifecycleFailStatementBinding =
  Object.freeze({
    bindingVersion: "1.0",
    operation: "fail",
    statementId: failCatalogEntry.statementId,
    accessMode: failCatalogEntry.accessMode,
    mutationClassification: failCatalogEntry.mutationClassification,
    transactionRequirement: failCatalogEntry.transactionRequirement,
    commitUnknownFollowUp: failCatalogEntry.commitUnknownStrategy,
    reconciliationRequirement: failCatalogEntry.reconciliationRequirement,
    affectedRowBoundary,
    issuesNewFence: false,
    returnsReservationEvidence: false,
    generatesResultReference: false,
    returnsResultReference: false,
  });

const releaseBinding: MultiCutReplayLifecycleReleaseStatementBinding =
  Object.freeze({
    bindingVersion: "1.0",
    operation: "release",
    statementId: releaseCatalogEntry.statementId,
    accessMode: releaseCatalogEntry.accessMode,
    mutationClassification: releaseCatalogEntry.mutationClassification,
    transactionRequirement: releaseCatalogEntry.transactionRequirement,
    commitUnknownFollowUp: releaseCatalogEntry.commitUnknownStrategy,
    reconciliationRequirement: releaseCatalogEntry.reconciliationRequirement,
    affectedRowBoundary,
    issuesNewFence: false,
    returnsReservationEvidence: false,
    generatesResultReference: false,
    returnsResultReference: false,
    rereservationOwner: "resolution",
  });

export const MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS:
  MultiCutReplayLifecycleStatementBindings = Object.freeze({
    renew: renewBinding,
    complete: completeBinding,
    fail: failBinding,
    release: releaseBinding,
  });

export const MULTI_CUT_REPLAY_LIFECYCLE_RUNTIME_REQUEST_BUILDER:
  MultiCutReplayLifecycleRuntimeRequestBuilder = Object.freeze({
    build(binding, request) {
      return Object.freeze({
        requestVersion: "1.0",
        statementId: binding.statementId,
        parameters: Object.freeze({
          lifecycleInput: request.lifecycleInput,
        }),
        transactionContext: request.transactionContext,
      });
    },
  });

const buildRuntimeRequest = <
  Operation extends MultiCutReplayLifecycleStatementAdapterMetadata["operation"],
>(
  binding: Extract<
    MultiCutReplayLifecycleStatementAdapterMetadata,
    { readonly operation: Operation }
  >,
  request: MultiCutReplayLifecycleStatementAdapterRequest<Operation>,
) =>
  MULTI_CUT_REPLAY_LIFECYCLE_RUNTIME_REQUEST_BUILDER.build(
    binding,
    request,
  );

export const createMultiCutReplayLifecycleStatementAdapter = <
  Projection,
  FailureProjection,
>(
  dependencies: MultiCutReplayLifecycleStatementAdapterDependencies<
    Projection,
    FailureProjection
  >,
): MultiCutReplayLifecycleStatementAdapter<
  Projection,
  FailureProjection
> => {
  const runtime =
    createMultiCutReplayPostgresqlAdapterRuntime(dependencies);

  return Object.freeze({
    dispatchRenew(request) {
      return runtime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.renew,
          request,
        ),
      );
    },
    dispatchComplete(request) {
      return runtime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.complete,
          request,
        ),
      );
    },
    dispatchFail(request) {
      return runtime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.fail,
          request,
        ),
      );
    },
    dispatchRelease(request) {
      return runtime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.release,
          request,
        ),
      );
    },
  });
};
