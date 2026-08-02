import type {
  DurableWorkflowDatabaseCommand,
  DurableWorkflowDatabaseScalar,
} from "../durableTransaction";
import type {
  PostgreSQLParameter,
  PostgreSQLQueryRequest,
} from "../postgresqlDriver/types";
import type {
  PostgreSQLSliceAStatement,
  PostgreSQLSliceAStatementCatalog,
} from "./types";

export type PostgreSQLSliceAStatementResolverVersionV1 = "1.0";

export type PostgreSQLSliceAResolvedStatementV1 = Readonly<{
  resolverVersion: PostgreSQLSliceAStatementResolverVersionV1;
  statement: PostgreSQLSliceAStatement;
  query: PostgreSQLQueryRequest;
}>;

export type PostgreSQLSliceAStatementResolutionV1 =
  | Readonly<{ status: "resolved"; value: PostgreSQLSliceAResolvedStatementV1 }>
  | Readonly<{ status: "unsupported-statement"; statementId: string }>
  | Readonly<{
      status: "invalid-request";
      reason: "parameter-count-mismatch" | "cardinality-mismatch";
    }>;

function copyScalar(value: DurableWorkflowDatabaseScalar): DurableWorkflowDatabaseScalar {
  return value instanceof Uint8Array ? Uint8Array.from(value) : value;
}

function projectParameter(value: DurableWorkflowDatabaseScalar): PostgreSQLParameter {
  if (value === null) return Object.freeze({ kind: "null" });
  if (typeof value === "string") return Object.freeze({ kind: "string", value });
  if (typeof value === "boolean") return Object.freeze({ kind: "boolean", value });
  if (typeof value === "number") return Object.freeze({ kind: "safe-integer", value });
  return Object.freeze({ kind: "bytea", value: Uint8Array.from(value) });
}

function copyStatement(statement: PostgreSQLSliceAStatement): PostgreSQLSliceAStatement {
  return Object.freeze({ ...statement });
}

export function resolvePostgreSQLSliceAStatementV1(
  catalog: PostgreSQLSliceAStatementCatalog,
  command: DurableWorkflowDatabaseCommand,
): PostgreSQLSliceAStatementResolutionV1 {
  const statement = catalog.statements.find(
    (candidate) => candidate.statementId === command.statementId,
  );
  if (statement === undefined) {
    return Object.freeze({
      status: "unsupported-statement",
      statementId: command.statementId,
    });
  }
  if (statement.parameterCount !== command.parameters.length) {
    return Object.freeze({
      status: "invalid-request",
      reason: "parameter-count-mismatch",
    });
  }
  if (statement.cardinality !== command.expectedResult) {
    return Object.freeze({
      status: "invalid-request",
      reason: "cardinality-mismatch",
    });
  }
  const parameters = Object.freeze(command.parameters.map(copyScalar));
  const resolvedStatement = copyStatement(statement);
  return Object.freeze({
    status: "resolved",
    value: Object.freeze({
      resolverVersion: "1.0",
      statement: resolvedStatement,
      query: Object.freeze({
        statementId: resolvedStatement.statementId,
        text: resolvedStatement.sql,
        values: Object.freeze(parameters.map(projectParameter)),
        expectedResult: command.expectedResult,
      }),
    }),
  });
}
