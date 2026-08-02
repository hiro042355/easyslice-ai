import type {
  PostgreSQLJsonValue,
  PostgreSQLParameter,
  PostgreSQLQueryResult,
  PostgreSQLRow,
  PostgreSQLTransactionConnection,
  PostgreSQLValue,
} from "../postgresqlDriver/types";
import type {
  DurableWorkflowGeneralSameSessionQueryCapabilityV1,
  DurableWorkflowGeneralSameSessionQueryRequestV1,
  DurableWorkflowGeneralSameSessionQueryResultV1,
  DurableWorkflowSameSessionQueryCapability,
  DurableWorkflowSameSessionQueryCapabilitySetV1,
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
  if (parameter.kind === "bytea") return Object.freeze({ kind: "bytea", value: Uint8Array.from(parameter.value) });
  if (parameter.kind === "json") return Object.freeze({ kind: "json", value: copyJson(parameter.value as PostgreSQLJsonValue) });
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

function copyRequest(request: DurableWorkflowGeneralSameSessionQueryRequestV1): DurableWorkflowGeneralSameSessionQueryRequestV1 {
  return Object.freeze({
    statementId: request.statementId,
    text: request.text,
    values: Object.freeze(request.values.map(copyParameter)),
    expectedResult: request.expectedResult,
  });
}

function projectResult(result: PostgreSQLQueryResult): DurableWorkflowGeneralSameSessionQueryResultV1 {
  switch (result.status) {
    case "success":
      return Object.freeze({
        resultVersion: "1.0",
        status: "success",
        rows: Object.freeze(result.rows.map(copyRow)),
        rowCount: result.rowCount,
        command: result.command,
      });
    case "not-found":
      return Object.freeze({ resultVersion: "1.0", ...result });
    case "cardinality-conflict":
      return Object.freeze({ resultVersion: "1.0", ...result });
    case "failure":
      return Object.freeze({
        resultVersion: "1.0",
        status: "execution-failure",
        phase: "query",
        classification: result.issue,
        safeReason: result.safeReason,
        retryable: result.diagnostic.retryable,
        ...(result.diagnostic.sqlStateClass === undefined ? {} : { sqlStateClass: result.diagnostic.sqlStateClass }),
        ...(result.diagnostic.queryConnectionDisposition === undefined ? {} : { queryConnectionDisposition: result.diagnostic.queryConnectionDisposition }),
      });
  }
}

export function createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1(
  input: Readonly<{ transactionConnection: PostgreSQLTransactionConnection }>,
): DurableWorkflowGeneralSameSessionQueryCapabilityV1 {
  const transactionConnection = input.transactionConnection;
  return Object.freeze({
    capabilityVersion: "1.0",
    evidence: EVIDENCE,
    async executeQuery(request) {
      return projectResult(await transactionConnection.query(copyRequest(request)));
    },
  });
}

export function narrowDurableWorkflowGeneralSameSessionQueryCapabilityV1(
  general: DurableWorkflowGeneralSameSessionQueryCapabilityV1,
): DurableWorkflowSameSessionQueryCapability {
  return Object.freeze({
    capabilityVersion: "1.0",
    evidence: general.evidence,
    async executeQuery(request) {
      const result = await general.executeQuery(request);
      if (result.status === "success" || result.status === "execution-failure") return result;
      throw new Error("postgresql-many-query-result-invariant");
    },
  });
}

export function createDurableWorkflowPostgresqlSameSessionQueryCapabilitySetV1(
  input: Readonly<{ transactionConnection: PostgreSQLTransactionConnection }>,
): DurableWorkflowSameSessionQueryCapabilitySetV1 {
  const general = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1(input);
  return Object.freeze({ general, manyOnly: narrowDurableWorkflowGeneralSameSessionQueryCapabilityV1(general) });
}
