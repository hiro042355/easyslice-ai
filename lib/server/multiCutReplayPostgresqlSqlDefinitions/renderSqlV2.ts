import {
  MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2 as parameters,
} from "../multiCutReplayPersistenceParameters";
import {
  MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 as physical,
} from "../multiCutReplayPhysicalSchema/physicalSchemaV2";
import type { MultiCutReplayPersistenceStatementIdV2 } from "../multiCutReplayPersistenceParameters/types";
import type {
  MultiCutReplaySqlDefinitionProjectionV2,
  MultiCutReplaySqlDefinitionStatementV2,
  MultiCutReplaySqlTerminalResolutionV2,
} from "../multiCutReplayPostgresqlSqlDefinitionContract/types";

const TABLE_NAME = physical.table.name;

const quoteLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

const castToken = (token: string, cast: string): string =>
  `${token}::${cast}`;

const placeholderFor = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
  physicalField: string,
  parameterBinding?: string,
): string => {
  const placeholder = statement.placeholders.find(
    (candidate) =>
      candidate.physicalField === physicalField &&
      (!parameterBinding || candidate.parameterBinding === parameterBinding),
  );
  if (!placeholder) {
    throw new Error(
      `missing-placeholder:${statement.statementId}:${physicalField}`,
    );
  }
  return castToken(placeholder.placeholder, placeholder.postgresqlCast);
};

const replaceExpressionBindings = (
  expression: string,
  statement: MultiCutReplaySqlDefinitionStatementV2,
): string =>
  expression.replace(
    "$lease_duration_milliseconds::bigint",
    placeholderFor(
      statement,
      "lease_duration_milliseconds",
      "lease_duration_milliseconds",
    ),
  );

const projectionSql = (
  projection: MultiCutReplaySqlDefinitionProjectionV2,
): string =>
  projection.orderedFields
    .map(
      ({ physicalField, canonicalAlias }) =>
        `${physicalField} AS ${canonicalAlias}`,
    )
    .join(",\n  ");

const terminalFor = (
  terminals: readonly MultiCutReplaySqlTerminalResolutionV2[],
  referenceId: string,
): MultiCutReplaySqlTerminalResolutionV2 => {
  const terminal = terminals.find(
    (candidate) => candidate.referenceId === referenceId,
  );
  if (!terminal) {
    throw new Error(`missing-terminal-resolution:${referenceId}`);
  }
  return terminal;
};

const checkedSuccessor = (physicalField: string): string => {
  const sourceField =
    physicalField === "fencing_token"
      ? "last_fencing_token"
      : physicalField === "reservation_attempt"
        ? "last_reservation_attempt"
        : physicalField === "expected_revision"
          ? "revision"
          : physicalField;
  const successor = parameters.continuitySuccessors.find(
    ({ field }) => field === sourceField,
  );
  if (!successor) {
    throw new Error(`missing-successor-authority:${physicalField}`);
  }
  return successor.checkedExpression;
};

const terminalSql = (
  terminal: MultiCutReplaySqlTerminalResolutionV2,
  statement: MultiCutReplaySqlDefinitionStatementV2,
): string => {
  switch (terminal.terminalResolutionKind) {
    case "exact-literal":
      return terminal.postgresqlCast === "integer" ||
        terminal.postgresqlCast === "bigint"
        ? terminal.terminalTarget
        : quoteLiteral(terminal.terminalTarget);
    case "exact-placeholder-binding":
      return placeholderFor(
        statement,
        terminal.physicalField,
        terminal.terminalTarget,
      );
    case "exact-persisted-physical-field":
    case "exact-retained-field":
      return terminal.physicalField;
    case "exact-postgresql-generated-expression-authority": {
      if (terminal.terminalTarget === "transaction_timestamp()") {
        return parameters.databaseClockPolicy.expression;
      }
      const leaseExpression = parameters.postgresqlExpressions.find(
        ({ name }) =>
          name ===
          (statement.statementId === "renew-processing-reservation"
            ? "renewal-lease-expiry"
            : statement.statementId === "takeover-stale-processing-replay"
              ? "takeover-lease-expiry"
              : "initial-lease-expiry"),
      );
      if (!leaseExpression) {
        throw new Error(
          `missing-generated-expression:${statement.statementId}`,
        );
      }
      return replaceExpressionBindings(leaseExpression.expression, statement);
    }
    case "exact-checked-successor-definition":
      return checkedSuccessor(terminal.physicalField);
    case "exact-null":
    case "exact-cleared-field":
      return "NULL";
    case "exact-projection-field-and-alias":
      throw new Error("projection-terminal-is-not-a-scalar");
  }
};

const predicatesSql = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
  terminals: readonly MultiCutReplaySqlTerminalResolutionV2[],
): string =>
  statement.orderedPredicates
    .map((predicate) => {
      let source: string;
      if (predicate.comparisonSource === "literal") {
        source = terminalSql(
          terminalFor(terminals, predicate.sourceReference),
          statement,
        );
      } else if (predicate.comparisonSource === "expression-reference") {
        source = terminalSql(
          terminalFor(terminals, predicate.sourceReference),
          statement,
        );
      } else {
        const binding = statement.predicateBindings.find(
          (candidate) => candidate.physicalField === predicate.physicalField,
        );
        if (!binding) {
          throw new Error(
            `missing-predicate-binding:${statement.statementId}:${predicate.physicalField}`,
          );
        }
        source = castToken(binding.placeholderToken, binding.postgresqlCast);
      }
      return `${predicate.physicalField} ${predicate.comparisonOperator} ${source}`;
    })
    .join("\n  AND ");

const returningProjection = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
): MultiCutReplaySqlDefinitionProjectionV2 => {
  const projection = statement.projections.find(
    ({ kind }) => kind === "returning" || kind === "select",
  );
  if (!projection) {
    throw new Error(`missing-primary-projection:${statement.statementId}`);
  }
  return projection;
};

const renderInsert = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
  terminals: readonly MultiCutReplaySqlTerminalResolutionV2[],
): string => {
  const columns = statement.insertSources.map(({ physicalField }) => physicalField);
  const values = statement.insertSources.map((source) => {
    if (source.source === "binding") {
      return placeholderFor(statement, source.physicalField, source.binding);
    }
    if (source.source === "literal") {
      return quoteLiteral(source.exactLiteral);
    }
    if (source.source === "null") {
      return "NULL";
    }
    if (source.source === "retained") {
      return source.retainedReference;
    }
    return terminalSql(
      terminalFor(terminals, source.expressionReference),
      statement,
    );
  });
  return [
    `INSERT INTO ${TABLE_NAME} (`,
    `  ${columns.join(",\n  ")}`,
    ") VALUES (",
    `  ${values.join(",\n  ")}`,
    ")",
    `ON CONFLICT ON CONSTRAINT ${physical.authoritativeUniqueConstraint.name} DO NOTHING`,
    "RETURNING",
    `  ${projectionSql(returningProjection(statement))};`,
  ].join("\n");
};

const renderSelect = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
  terminals: readonly MultiCutReplaySqlTerminalResolutionV2[],
): string =>
  [
    "SELECT",
    `  ${projectionSql(returningProjection(statement))}`,
    `FROM ${TABLE_NAME}`,
    "WHERE",
    `  ${predicatesSql(statement, terminals)};`,
  ].join("\n");

const renderUpdate = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
  terminals: readonly MultiCutReplaySqlTerminalResolutionV2[],
): string => {
  const assignments = statement.mutations
    .filter(({ action }) => action !== "retain")
    .map((mutation) => {
      const terminal = terminalFor(terminals, mutation.sourceReference);
      return `${mutation.physicalField} = ${terminalSql(terminal, statement)}`;
    });
  return [
    `UPDATE ${TABLE_NAME}`,
    "SET",
    `  ${assignments.join(",\n  ")}`,
    "WHERE",
    `  ${predicatesSql(statement, terminals)}`,
    "RETURNING",
    `  ${projectionSql(returningProjection(statement))};`,
  ].join("\n");
};

export const renderMultiCutReplayPostgresqlSqlV2 = (
  statement: MultiCutReplaySqlDefinitionStatementV2,
  terminals: readonly MultiCutReplaySqlTerminalResolutionV2[],
): string => {
  if (statement.statementId === "resolve-new-reservation") {
    return renderInsert(statement, terminals);
  }
  if (statement.statementId === "lookup-authoritative-replay") {
    return renderSelect(statement, terminals);
  }
  return renderUpdate(statement, terminals);
};

export const MULTI_CUT_REPLAY_POSTGRESQL_SQL_TABLE_V2 = TABLE_NAME;

export type MultiCutReplayPostgresqlRenderedStatementIdV2 =
  MultiCutReplayPersistenceStatementIdV2;
