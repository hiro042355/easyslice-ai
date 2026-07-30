import {
  MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract,
} from "../multiCutReplayPostgresqlSqlDefinitionContract";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_SQL_TABLE_V2,
  renderMultiCutReplayPostgresqlSqlV2,
} from "./renderSqlV2";
import type {
  MultiCutReplayPostgresqlSqlDefinitionV2,
  MultiCutReplayPostgresqlSqlDefinitionsV2,
} from "./types";

const statements: readonly MultiCutReplayPostgresqlSqlDefinitionV2[] =
  Object.freeze(
    contract.statements.map((statement) =>
      Object.freeze({
        definitionVersion: "2.0",
        statementId: statement.statementId,
        sql: renderMultiCutReplayPostgresqlSqlV2(
          statement,
          contract.terminalResolutionRegistry,
        ),
        placeholders: Object.freeze([...statement.placeholders]),
        bindingOrder: Object.freeze(
          statement.placeholders.map(({ parameterBinding }) => parameterBinding),
        ),
        operationClass: statement.operationClass,
        transactionClass: statement.transactionClass,
        retryClass: statement.retryClass,
        reconciliationClass: statement.reconciliationClass,
        logicalAttemptReuse: statement.zeroRowContract.logicalAttemptReuse,
        commitUnknown: statement.zeroRowContract.commitUnknown,
        deterministic: true,
        transactionControlIncluded: false,
        ddlIncluded: false,
      }),
    ),
  );

export const MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2:
  MultiCutReplayPostgresqlSqlDefinitionsV2 = Object.freeze({
  definitionVersion: "2.0",
  tableName: MULTI_CUT_REPLAY_POSTGRESQL_SQL_TABLE_V2,
  statements,
  byStatementId: Object.freeze(
    Object.fromEntries(
      statements.map((statement) => [statement.statementId, statement]),
    ),
  ) as MultiCutReplayPostgresqlSqlDefinitionsV2["byStatementId"],
});
