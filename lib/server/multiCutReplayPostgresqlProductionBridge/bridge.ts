import type {
  MultiCutReplayPostgresqlFakeClientResult,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "../multiCutReplayPostgresqlAdapter";
import { MULTI_CUT_REPLAY_PRODUCTION_BRIDGE_CONTRACT as contract } from "../multiCutReplayPostgresqlProductionBridgeContract";
import type {
  MultiCutReplayPostgresqlDriverConnection,
  MultiCutReplayPostgresqlDriverErrorKind,
} from "../multiCutReplayPostgresqlDriver";
import type {
  PostgreSQLConnection,
  PostgreSQLExecutionFailure,
  PostgreSQLJsonValue,
  PostgreSQLParameter,
  PostgreSQLQueryResult,
  PostgreSQLRow,
  PostgreSQLTransactionConnection,
  PostgreSQLValue,
} from "../productionWorkflowRuntime/postgresqlDriver";
import { projectMultiCutReplayPostgresqlParameter } from "./parameterProjection";
import {
  emitReplayPostgresqlEvent,
  NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT,
} from "../multiCutReplayPostgresqlObservability";
import type {
  ReplayPostgresqlObservabilityPort,
} from "../multiCutReplayPostgresqlObservability";
import type {
  MultiCutReplayPostgresqlProductionBridge,
  MultiCutReplayPostgresqlProductionBridgeDependencies,
  MultiCutReplayPostgresqlProductionBridgeError,
} from "./types";

const copyJson = (value: PostgreSQLJsonValue): PostgreSQLJsonValue => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => copyJson(entry)));
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, copyJson(entry)]),
    ),
  );
};

const copyValue = (value: PostgreSQLValue): PostgreSQLValue =>
  value instanceof Uint8Array
    ? Uint8Array.from(value)
    : typeof value === "object" && value !== null
      ? copyJson(value)
      : value;

const copyRow = (row: PostgreSQLRow): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, copyValue(value)]),
    ),
  );

const bridgeError = (
  source:
    | PostgreSQLExecutionFailure["issue"]
    | "commit-outcome-unknown"
    | "non-postgresql-thrown-value",
  diagnostic?: PostgreSQLExecutionFailure["diagnostic"],
): MultiCutReplayPostgresqlProductionBridgeError => {
  const rule = contract.failures.find((entry) => entry.source === source);
  const target: MultiCutReplayPostgresqlDriverErrorKind =
    rule?.target ?? "query-rejected";
  return Object.freeze({
    errorVersion: "1.0",
    kind: target,
    safeReason: `postgresql-${source}`,
    retryable: rule?.retryable ?? false,
    commitUnknown: rule?.commitUnknown ?? false,
    ...(rule?.sqlState === "safe-class-only" && diagnostic?.sqlStateClass
      ? { sqlStateClass: diagnostic.sqlStateClass }
      : {}),
    ...(diagnostic?.queryConnectionDisposition
      ? { queryConnectionDisposition: diagnostic.queryConnectionDisposition }
      : {}),
    originalCauseRetained: false,
    reconciliationRequired: rule?.reconciliation === "required",
  });
};

const rejectUnexpected = (): never => {
  throw bridgeError("non-postgresql-thrown-value");
};

const projectRequest = (
  request: MultiCutReplayPostgresqlPureExecutionRequest,
): Readonly<{
  statementId: string;
  text: string;
  values: readonly PostgreSQLParameter[];
  expectedResult: "many";
}> => {
  if (
    request.parameters.length !== request.values.length ||
    request.parameters.some(
      ({ value }, index) => !Object.is(value, request.values[index]),
    )
  ) {
    return rejectUnexpected();
  }
  return Object.freeze({
    statementId: request.statementId,
    text: request.sql,
    values: Object.freeze(
      request.parameters.map(projectMultiCutReplayPostgresqlParameter),
    ),
    expectedResult: "many",
  });
};

const projectResult = (
  result: PostgreSQLQueryResult,
): MultiCutReplayPostgresqlFakeClientResult => {
  if (result.status === "failure") {
    throw bridgeError(result.issue, result.diagnostic);
  }
  if (result.status !== "success") return rejectUnexpected();
  return Object.freeze({
    rows: Object.freeze(result.rows.map(copyRow)),
    rowCount: result.rowCount,
    command: result.command,
  });
};

const createConnection = (
  connection: PostgreSQLConnection,
  observability: ReplayPostgresqlObservabilityPort,
): MultiCutReplayPostgresqlDriverConnection => {
  let transaction: PostgreSQLTransactionConnection | undefined;
  let discardObserved = false;
  const observeDiscard = (
    reasonCategory: "active-transaction" | "commit-unknown" | "rollback-failure",
  ): void => {
    if (discardObserved) return;
    discardObserved = true;
    emitReplayPostgresqlEvent(observability, Object.freeze({
      schemaVersion: "1.0",
      eventType: "replay-postgresql-connection-discarded",
      operation: "discard-connection",
      lifecyclePhase: "connection",
      reasonCategory,
      connectionDisposition: "discarded",
      outcome: "completed",
    }));
  };
  return Object.freeze({
    async begin() {
      if (transaction) throw bridgeError("disposed");
      const result = await connection.begin();
      if ("status" in result) {
        throw bridgeError(result.issue, result.diagnostic);
      }
      transaction = result;
    },
    async query(request) {
      if (!transaction) throw bridgeError("disposed");
      return projectResult(await transaction.query(projectRequest(request)));
    },
    async commit() {
      if (!transaction) throw bridgeError("disposed");
      const result = await transaction.commit();
      if (result.status === "committed") return;
      if (
        result.status === "unknown-outcome" ||
        result.status === "connection-unavailable"
      ) {
        observeDiscard("commit-unknown");
        throw bridgeError("commit-outcome-unknown");
      }
      throw bridgeError("disposed");
    },
    async rollback() {
      if (!transaction) throw bridgeError("disposed");
      const result = await transaction.rollback();
      if (result.status === "rolled-back" || result.status === "not-required") {
        return;
      }
      observeDiscard("rollback-failure");
      throw bridgeError(
        result.status === "connection-lost"
          ? "connection-unavailable"
          : "disposed",
      );
    },
  });
};

export const createMultiCutReplayPostgresqlProductionBridge = (
  dependencies: MultiCutReplayPostgresqlProductionBridgeDependencies,
): MultiCutReplayPostgresqlProductionBridge => {
  const observability =
    dependencies.observability ?? NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT;
  const connections = new WeakMap<
    MultiCutReplayPostgresqlDriverConnection,
    PostgreSQLConnection
  >();
  return Object.freeze({
    async acquire() {
      const acquired = await dependencies.pool.checkout();
      if ("status" in acquired) {
        throw bridgeError(acquired.issue, acquired.diagnostic);
      }
      const projected = createConnection(acquired, observability);
      connections.set(projected, acquired);
      return projected;
    },
    async release(projected) {
      const connection = connections.get(projected);
      if (!connection) throw bridgeError("disposed");
      const result = connection.release();
      if (result === "transaction-active") {
        connection.discard();
        emitReplayPostgresqlEvent(observability, Object.freeze({
          schemaVersion: "1.0",
          eventType: "replay-postgresql-connection-discarded",
          operation: "discard-connection",
          lifecyclePhase: "connection",
          reasonCategory: "active-transaction",
          connectionDisposition: "discarded",
          outcome: "completed",
        }));
      }
      connections.delete(projected);
    },
  });
};
