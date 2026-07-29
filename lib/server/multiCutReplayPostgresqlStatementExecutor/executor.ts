import type {
  MultiCutReplayPostgresqlPreparedStatement,
} from "../multiCutReplayPostgresqlClient";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayPostgresqlStatementId,
} from "../multiCutReplayPostgresqlStatementCatalog/types";
import type {
  MultiCutReplayPostgresqlStatementExecutor,
  MultiCutReplayPostgresqlStatementExecutorBinding,
  MultiCutReplayPostgresqlStatementExecutorBindings,
  MultiCutReplayPostgresqlStatementExecutorDependencies,
  MultiCutReplayPostgresqlStatementExecutorRequest,
} from "./types";

const createBinding = <StatementId extends MultiCutReplayPostgresqlStatementId>(
  statementIdentifier: StatementId,
  dependencies: MultiCutReplayPostgresqlStatementExecutorDependencies,
): MultiCutReplayPostgresqlStatementExecutorBinding<StatementId> => {
  const catalogEntry =
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[statementIdentifier];
  const hooks = dependencies.hooks[statementIdentifier];

  return Object.freeze({
    statementIdentifier,
    accessMode: catalogEntry.accessMode,
    mutationKind: catalogEntry.mutationClassification,
    transactionRequirement: catalogEntry.transactionRequirement,
    expectedResult: Object.freeze({ ...hooks.expectedResult }),
    parameterProjection: hooks.parameterProjection,
    resultProjection: hooks.resultProjection,
    failureClassification: hooks.failureClassification,
  });
};

const createBindings = (
  dependencies: MultiCutReplayPostgresqlStatementExecutorDependencies,
): MultiCutReplayPostgresqlStatementExecutorBindings =>
  Object.freeze(
    Object.fromEntries(
      MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS.map((statementIdentifier) => [
        statementIdentifier,
        createBinding(statementIdentifier, dependencies),
      ]),
    ),
  ) as MultiCutReplayPostgresqlStatementExecutorBindings;

const describeRequest = (
  request: MultiCutReplayPostgresqlStatementExecutorRequest,
  bindings: MultiCutReplayPostgresqlStatementExecutorBindings,
): MultiCutReplayPostgresqlPreparedStatement => {
  const binding = bindings[request.statementRequest.statementId];

  return Object.freeze({
    preparedStatementVersion: "1.0",
    statementIdentifier: binding.statementIdentifier,
    parameters: Object.freeze({
      ...binding.parameterProjection.project(request.statementRequest),
    }),
    expectedResult: binding.expectedResult,
  });
};

export const createMultiCutReplayPostgresqlStatementExecutor = (
  dependencies: MultiCutReplayPostgresqlStatementExecutorDependencies,
): MultiCutReplayPostgresqlStatementExecutor => {
  const bindings = createBindings(dependencies);

  return Object.freeze({
    bindings,
    describe(request) {
      return describeRequest(request, bindings);
    },
    async execute(request) {
      const binding = bindings[request.statementRequest.statementId];

      try {
        const queryResult = await dependencies.connection.query.execute(
          Object.freeze({
            requestVersion: "1.0",
            preparedStatement: describeRequest(request, bindings),
            transaction: dependencies.transaction,
            cancellation: dependencies.cancellation,
          }),
        );

        return binding.resultProjection.project(queryResult, request);
      } catch (failure) {
        return binding.failureClassification.classify(failure, request);
      }
    },
  });
};
