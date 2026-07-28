import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
} from "../multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayPostgresqlStatementExecutionRequest,
} from "../multiCutReplayPostgresqlAdapterPort";
import type {
  MultiCutReplayPostgresqlAdapterRuntimeDependencies,
  MultiCutReplayPostgresqlAdapterRuntimeDispatcher,
  MultiCutReplayPostgresqlAdapterRuntimeFailureContext,
  MultiCutReplayPostgresqlAdapterRuntimeMetadata,
  MultiCutReplayPostgresqlAdapterRuntimeProjectionContext,
  MultiCutReplayPostgresqlAdapterRuntimeRequest,
} from "./types";

const createPortRequest = (
  request: MultiCutReplayPostgresqlAdapterRuntimeRequest,
): MultiCutReplayPostgresqlStatementExecutionRequest =>
  Object.freeze({
    requestVersion: "1.0",
    statementId: request.statementId,
    parameters: request.parameters,
    transactionContext: request.transactionContext,
  });

const createRuntimeMetadata = (
  request: MultiCutReplayPostgresqlAdapterRuntimeRequest,
): MultiCutReplayPostgresqlAdapterRuntimeMetadata =>
  Object.freeze({
    metadataVersion: "1.0",
    statement:
      MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[request.statementId],
  });

export const createMultiCutReplayPostgresqlAdapterRuntime = <
  Projection,
  FailureProjection,
>(
  dependencies: MultiCutReplayPostgresqlAdapterRuntimeDependencies<
    Projection,
    FailureProjection
  >,
): MultiCutReplayPostgresqlAdapterRuntimeDispatcher<
  Projection,
  FailureProjection
> =>
  Object.freeze({
    async dispatch(request) {
      const portRequest = createPortRequest(request);
      const runtimeMetadata = createRuntimeMetadata(request);
      const executionResult =
        await dependencies.executor.executeStatement(portRequest);

      if (executionResult.status === "executed") {
        const context: MultiCutReplayPostgresqlAdapterRuntimeProjectionContext =
          Object.freeze({
            runtimeRequest: request,
            portRequest,
            executionResult,
            runtimeMetadata,
          });
        const projection = await dependencies.projectionHook.project(context);

        return Object.freeze({
          resultVersion: "1.0",
          status: "projected",
          projection,
          executionResult,
          runtimeMetadata,
        });
      }

      const context: MultiCutReplayPostgresqlAdapterRuntimeFailureContext =
        Object.freeze({
          runtimeRequest: request,
          portRequest,
          executionResult,
          runtimeMetadata,
        });
      const failureProjection =
        await dependencies.failureHook.projectFailure(context);

      return Object.freeze({
        resultVersion: "1.0",
        status: "failure-projected",
        failureProjection,
        executionResult,
        runtimeMetadata,
      });
    },
  });
