import {
  createMultiCutReplayPostgresqlAdapterRuntime,
} from "../multiCutReplayPostgresqlAdapterRuntime";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayResolutionRuntimeRequestBuilder,
  MultiCutReplayResolutionStatementAdapter,
  MultiCutReplayResolutionStatementAdapterDependencies,
  MultiCutReplayResolutionStatementAdapterRequest,
  MultiCutReplayResolutionStatementBinding,
  MultiCutReplayResolutionStatementBindings,
} from "./types";

const [
  resolveNewReservationStatementId,
  resolveExistingReplayStatementId,
] = MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS;

const createBinding = (
  statementKind: MultiCutReplayResolutionStatementBinding["statementKind"],
  catalogEntry:
    (typeof MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG)[
      | typeof resolveNewReservationStatementId
      | typeof resolveExistingReplayStatementId
    ],
): MultiCutReplayResolutionStatementBinding => {
  return Object.freeze({
    bindingVersion: "1.0",
    statementKind,
    statementId: catalogEntry.statementId,
    affectedRowBoundary: Object.freeze({
      success: "exactly-one",
      absence: "zero",
      invariantFailure: "invariant-violation",
    }),
    commitUnknownFollowUp: catalogEntry.commitUnknownStrategy,
  });
};

export const MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS:
  MultiCutReplayResolutionStatementBindings = Object.freeze({
    newReservation: createBinding(
      "new-reservation",
      MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[
        resolveNewReservationStatementId
      ],
    ),
    existingReplay: createBinding(
      "existing-replay",
      MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[
        resolveExistingReplayStatementId
      ],
    ),
  });

export const MULTI_CUT_REPLAY_RESOLUTION_RUNTIME_REQUEST_BUILDER:
  MultiCutReplayResolutionRuntimeRequestBuilder = Object.freeze({
    build(statementId, request) {
      return Object.freeze({
        requestVersion: "1.0",
        statementId,
        parameters: Object.freeze({
          resolutionInput: request.resolutionInput,
        }),
        transactionContext: request.transactionContext,
      });
    },
  });

const buildRuntimeRequest = (
  binding: MultiCutReplayResolutionStatementBinding,
  request: MultiCutReplayResolutionStatementAdapterRequest,
) =>
  MULTI_CUT_REPLAY_RESOLUTION_RUNTIME_REQUEST_BUILDER.build(
    binding.statementId,
    request,
  );

export const createMultiCutReplayResolutionStatementAdapter = <
  Projection,
  FailureProjection,
>(
  dependencies: MultiCutReplayResolutionStatementAdapterDependencies<
    Projection,
    FailureProjection
  >,
): MultiCutReplayResolutionStatementAdapter<
  Projection,
  FailureProjection
> => {
  const runtime =
    createMultiCutReplayPostgresqlAdapterRuntime(dependencies);

  return Object.freeze({
    dispatchNewReservation(request) {
      return runtime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.newReservation,
          request,
        ),
      );
    },
    dispatchExistingReplay(request) {
      return runtime.dispatch(
        buildRuntimeRequest(
          MULTI_CUT_REPLAY_RESOLUTION_STATEMENT_BINDINGS.existingReplay,
          request,
        ),
      );
    },
  });
};
