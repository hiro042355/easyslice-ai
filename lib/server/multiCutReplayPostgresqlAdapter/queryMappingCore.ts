import {
  MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract,
} from "../multiCutReplayPostgresqlSqlDefinitionContract";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions,
} from "../multiCutReplayPostgresqlSqlDefinitions";
import type {
  MultiCutReplayPostgresqlPureAdapterInput,
  MultiCutReplayPostgresqlPureAdapterMetadata,
  MultiCutReplayPostgresqlPureExecutionRequest,
  MultiCutReplayPostgresqlPureQueryMappingCore,
  MultiCutReplayPostgresqlPureQueryMappingCoreV2,
  MultiCutReplayPostgresqlPureQueryMappingResult,
  MultiCutReplayPostgresqlQueryExecutionSuccess,
  MultiCutReplayPostgresqlQueryOnlyClient,
  MultiCutReplayPostgresqlQueryOnlyClientV2,
  MultiCutReplayPostgresqlQueryOnlyClientV3,
  MultiCutReplayPostgresqlPureQueryMappingCoreV3,
} from "./pureTypes";

export const getMultiCutReplayPostgresqlPureAdapterMetadata = (
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

const mapResult = (
  input: MultiCutReplayPostgresqlPureAdapterInput,
  result: MultiCutReplayPostgresqlQueryExecutionSuccess,
): Exclude<
  MultiCutReplayPostgresqlPureQueryMappingResult,
  { status: "execution-failure" }
> => {
  const statement = contract.statements.find(
    ({ statementId }) => statementId === input.statementId,
  );
  if (!statement) {
    throw new Error(`missing-statement-contract:${input.statementId}`);
  }
  const metadata = getMultiCutReplayPostgresqlPureAdapterMetadata(
    input.statementId,
  );
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

export const createMultiCutReplayPostgresqlQueryMappingCore = (
  client: MultiCutReplayPostgresqlQueryOnlyClient,
): MultiCutReplayPostgresqlPureQueryMappingCore =>
  Object.freeze({
    coreVersion: "1.0",
    createExecutionRequest(input) {
      return createRequest(input);
    },
    async execute(input) {
      const result = await client.execute(createRequest(input));
      if (result.kind === "execution-failure") {
        return Object.freeze({
          resultVersion: "1.0",
          status: "execution-failure",
          statementId: input.statementId,
          classification: "execution-failure",
          safeReason: result.safeReason,
          ...(result.sqlStateClass
            ? { sqlStateClass: result.sqlStateClass }
            : {}),
          ...(result.queryConnectionDisposition
            ? {
                queryConnectionDisposition:
                  result.queryConnectionDisposition,
              }
            : {}),
          metadata: getMultiCutReplayPostgresqlPureAdapterMetadata(
            input.statementId,
          ),
        });
      }
      return mapResult(input, result);
    },
  });

export const createMultiCutReplayPostgresqlQueryMappingCoreV2 = (
  client: MultiCutReplayPostgresqlQueryOnlyClientV2,
): MultiCutReplayPostgresqlPureQueryMappingCoreV2 =>
  Object.freeze({
    coreVersion: "2.0",
    createExecutionRequest(input) {
      return createRequest(input);
    },
    async execute(input) {
      const result = await client.execute(createRequest(input));
      if (result.kind === "execution-failure") {
        return Object.freeze({
          resultVersion: "1.0",
          status: "execution-failure",
          statementId: input.statementId,
          classification: "execution-failure",
          issue: result.issue,
          safeReason: result.safeReason,
          ...(result.sqlStateClass
            ? { sqlStateClass: result.sqlStateClass }
            : {}),
          ...(result.queryConnectionDisposition
            ? {
                queryConnectionDisposition:
                  result.queryConnectionDisposition,
              }
            : {}),
          metadata: getMultiCutReplayPostgresqlPureAdapterMetadata(
            input.statementId,
          ),
        });
      }
      return mapResult(input, result);
    },
  });

export const executeReplayPostgresqlQueryOnly = (
  client: MultiCutReplayPostgresqlQueryOnlyClient,
  input: MultiCutReplayPostgresqlPureAdapterInput,
): Promise<MultiCutReplayPostgresqlPureQueryMappingResult> =>
  createMultiCutReplayPostgresqlQueryMappingCore(client).execute(input);

export const createMultiCutReplayPostgresqlQueryMappingCoreV3 = (client: MultiCutReplayPostgresqlQueryOnlyClientV3): MultiCutReplayPostgresqlPureQueryMappingCoreV3 => Object.freeze({ coreVersion: "3.0", createExecutionRequest: createRequest, async execute(input) { const result = await client.execute(createRequest(input)); if (result.kind !== "execution-failure") return mapResult(input, result); return Object.freeze({ resultVersion: "3.0", status: "execution-failure", statementId: input.statementId, classification: "execution-failure", issue: result.issue, safeReason: result.safeReason, retryable: result.retryable, ...(result.sqlStateClass === undefined ? {} : { sqlStateClass: result.sqlStateClass }), queryConnectionDisposition: result.queryConnectionDisposition, metadata: getMultiCutReplayPostgresqlPureAdapterMetadata(input.statementId) }); } });
