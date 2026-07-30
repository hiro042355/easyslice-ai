import {
  MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract,
} from "../multiCutReplayPostgresqlSqlDefinitionContract";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions,
} from "../multiCutReplayPostgresqlSqlDefinitions";
import type {
  MultiCutReplayPostgresqlFakeClient,
  MultiCutReplayPostgresqlFakeClientFailure,
  MultiCutReplayPostgresqlPureAdapter,
  MultiCutReplayPostgresqlPureAdapterInput,
  MultiCutReplayPostgresqlPureAdapterMetadata,
  MultiCutReplayPostgresqlPureAdapterResult,
  MultiCutReplayPostgresqlPureExecutionRequest,
} from "./pureTypes";

const metadataFor = (
  statementId: MultiCutReplayPostgresqlPureAdapterInput["statementId"],
): MultiCutReplayPostgresqlPureAdapterMetadata => {
  const definition = definitions.byStatementId[statementId];
  return Object.freeze({
    metadataVersion: "1.0",
    retryClassification: definition.retryClass,
    commitUnknownClassification: definition.commitUnknown,
    reconciliationClassification: definition.reconciliationClass,
    logicalAttemptReuse: definition.logicalAttemptReuse,
  });
};

const isBindingRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const createRequest = (
  input: MultiCutReplayPostgresqlPureAdapterInput,
): MultiCutReplayPostgresqlPureExecutionRequest => {
  const definition = definitions.byStatementId[input.statementId];
  const parameters = definition.placeholders.map((placeholder) => {
    if (!(placeholder.parameterBinding in input.bindings)) {
      throw new Error(
        `missing-placeholder-binding:${input.statementId}:${placeholder.parameterBinding}`,
      );
    }
    const bindingValue = input.bindings[placeholder.parameterBinding];
    const bindingMultiplicity = definition.placeholders.filter(
      ({ parameterBinding }) =>
        parameterBinding === placeholder.parameterBinding,
    ).length;
    const value =
      isBindingRecord(bindingValue) &&
      placeholder.physicalField in bindingValue
        ? bindingValue[placeholder.physicalField]
        : bindingMultiplicity === 1
          ? bindingValue
          : undefined;
    if (value === undefined) {
      throw new Error(
        `missing-placeholder-field:${input.statementId}:${placeholder.parameterBinding}:${placeholder.physicalField}`,
      );
    }
    return Object.freeze({
      ordinal: placeholder.ordinal,
      token: placeholder.placeholder,
      postgresqlCast: placeholder.postgresqlCast,
      physicalField: placeholder.physicalField,
      parameterBinding: placeholder.parameterBinding,
      value,
    });
  });
  return Object.freeze({
    requestVersion: "1.0",
    statementId: input.statementId,
    sql: definition.sql,
    parameters: Object.freeze(parameters),
    values: Object.freeze(parameters.map(({ value }) => value)),
  });
};

const isFakeFailure = (
  failure: unknown,
): failure is MultiCutReplayPostgresqlFakeClientFailure =>
  typeof failure === "object" &&
  failure !== null &&
  "failureVersion" in failure &&
  failure.failureVersion === "1.0" &&
  "classification" in failure &&
  (failure.classification === "execution-failure" ||
    failure.classification === "commit-unknown") &&
  "safeReason" in failure &&
  typeof failure.safeReason === "string" &&
  (!("sqlStateClass" in failure) ||
    failure.sqlStateClass === "08" ||
    failure.sqlStateClass === "23" ||
    failure.sqlStateClass === "25" ||
    failure.sqlStateClass === "40" ||
    failure.sqlStateClass === "42" ||
    failure.sqlStateClass === "57");

const mapResult = (
  input: MultiCutReplayPostgresqlPureAdapterInput,
  result: Awaited<ReturnType<MultiCutReplayPostgresqlFakeClient["execute"]>>,
): MultiCutReplayPostgresqlPureAdapterResult => {
  const statement = contract.statements.find(
    ({ statementId }) => statementId === input.statementId,
  );
  if (!statement) {
    throw new Error(`missing-statement-contract:${input.statementId}`);
  }
  const metadata = metadataFor(input.statementId);
  if (result.rowCount === 0) {
    return Object.freeze({
      resultVersion: "1.0",
      status: "zero-row",
      statementId: input.statementId,
      rowCount: 0,
      command: result.command,
      classification: statement.zeroRowContract.ambiguity,
      lookupRequired: statement.zeroRowContract.lookupRequired,
      reconciliationRequired: statement.zeroRowContract.reconciliationRequired,
      metadata,
    });
  }
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    return Object.freeze({
      resultVersion: "1.0",
      status: "cardinality-failure",
      statementId: input.statementId,
      rowCount: result.rowCount,
      classification: "invariant-violation",
      metadata,
    });
  }
  return Object.freeze({
    resultVersion: "1.0",
    status: "mapped",
    statementId: input.statementId,
    row: Object.freeze({ ...result.rows[0] }),
    rowCount: 1,
    command: result.command,
    metadata,
  });
};

export const createMultiCutReplayPostgresqlPureAdapter = (
  client: MultiCutReplayPostgresqlFakeClient,
): MultiCutReplayPostgresqlPureAdapter =>
  Object.freeze({
    createExecutionRequest(input) {
      return createRequest(input);
    },
    async execute(input) {
      try {
        return mapResult(input, await client.execute(createRequest(input)));
      } catch (failure) {
        if (!isFakeFailure(failure)) {
          throw failure;
        }
        return Object.freeze({
          resultVersion: "1.0",
          status: "execution-failure",
          statementId: input.statementId,
          classification: failure.classification,
          safeReason: failure.safeReason,
          ...(failure.sqlStateClass
            ? { sqlStateClass: failure.sqlStateClass }
            : {}),
          metadata: metadataFor(input.statementId),
        });
      }
    },
  });
