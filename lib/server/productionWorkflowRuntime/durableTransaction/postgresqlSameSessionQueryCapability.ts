import type {
  PostgreSQLJsonValue,
  PostgreSQLParameter,
  PostgreSQLQueryResult,
  PostgreSQLRow,
  PostgreSQLTransactionConnection,
  PostgreSQLValue,
} from "../postgresqlDriver/types";
import type {
  DurableWorkflowSameSessionQueryCapability,
  DurableWorkflowSameSessionQueryFailure,
  DurableWorkflowSameSessionQueryRequest,
  DurableWorkflowSameSessionQuerySuccess,
} from "./sameSessionQueryTypes";

const EVIDENCE = Object.freeze({
  evidenceVersion: "1.0",
  sessionScope: "workflow-transaction",
  sessionAffinity: "same-session-required",
  transactionOwnership: "workflow-owner",
  separateConnectionPermitted: false,
  capabilityOwnsLifecycle: false,
  validOnlyDuringActiveTransaction: true,
} as const);

function copyJson(value: PostgreSQLJsonValue): PostgreSQLJsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(copyJson));
  const copy: Record<string, PostgreSQLJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = copyJson(entry);
  return Object.freeze(copy);
}

function copyParameter(parameter: PostgreSQLParameter): PostgreSQLParameter {
  if (parameter.kind === "bytea") {
    return Object.freeze({ kind: "bytea", value: Uint8Array.from(parameter.value) });
  }
  if (parameter.kind === "json") {
    return Object.freeze({
      kind: "json",
      value: copyJson(parameter.value as PostgreSQLJsonValue),
    });
  }
  return Object.freeze({ ...parameter });
}

function copyValue(value: PostgreSQLValue): PostgreSQLValue {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value !== null && typeof value === "object") return copyJson(value);
  return value;
}

function copyRow(row: PostgreSQLRow): PostgreSQLRow {
  const copy: Record<string, PostgreSQLValue> = {};
  for (const [key, value] of Object.entries(row)) copy[key] = copyValue(value);
  return Object.freeze(copy);
}

function copyRequest(
  request: DurableWorkflowSameSessionQueryRequest,
): DurableWorkflowSameSessionQueryRequest {
  return Object.freeze({
    statementId: request.statementId,
    text: request.text,
    values: Object.freeze(request.values.map(copyParameter)),
    expectedResult: request.expectedResult,
  });
}

function projectSuccess(
  result: Extract<PostgreSQLQueryResult, { status: "success" }>,
): DurableWorkflowSameSessionQuerySuccess {
  return Object.freeze({
    resultVersion: "1.0",
    status: "success",
    rows: Object.freeze(result.rows.map(copyRow)),
    rowCount: result.rowCount,
    command: result.command,
  });
}

function projectFailure(
  result: Extract<PostgreSQLQueryResult, { status: "failure" }>,
): DurableWorkflowSameSessionQueryFailure {
  return Object.freeze({
    resultVersion: "1.0",
    status: "execution-failure",
    phase: "query",
    classification: result.issue,
    safeReason: result.safeReason,
    ...(result.diagnostic.sqlStateClass !== undefined
      ? { sqlStateClass: result.diagnostic.sqlStateClass }
      : {}),
    ...(result.diagnostic.queryConnectionDisposition !== undefined
      ? {
          queryConnectionDisposition:
            result.diagnostic.queryConnectionDisposition,
        }
      : {}),
  });
}

function projectResult(result: PostgreSQLQueryResult) {
  if (result.status === "success") return projectSuccess(result);
  if (result.status === "failure") return projectFailure(result);
  throw new Error("postgresql-many-query-result-invariant");
}

export function createDurableWorkflowPostgresqlSameSessionQueryCapability(
  input: Readonly<{
    transactionConnection: PostgreSQLTransactionConnection;
  }>,
): DurableWorkflowSameSessionQueryCapability {
  const transactionConnection = input.transactionConnection;
  return Object.freeze({
    capabilityVersion: "1.0",
    evidence: EVIDENCE,
    async executeQuery(request) {
      const result = await transactionConnection.query(copyRequest(request));
      return projectResult(result);
    },
  });
}
