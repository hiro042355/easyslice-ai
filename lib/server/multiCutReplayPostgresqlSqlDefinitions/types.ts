import type { MultiCutReplayPersistenceStatementIdV2 } from "../multiCutReplayPersistenceParameters/types";
import type { MultiCutReplaySqlDefinitionPlaceholderV2 } from "../multiCutReplayPostgresqlSqlDefinitionContract/types";
import type { MultiCutReplayPostgresqlStatementCatalogEntry } from "../multiCutReplayPostgresqlStatementCatalog/types";

export type MultiCutReplayPostgresqlSqlDefinitionV2 = Readonly<{
  definitionVersion: "2.0";
  statementId: MultiCutReplayPersistenceStatementIdV2;
  sql: string;
  placeholders: readonly MultiCutReplaySqlDefinitionPlaceholderV2[];
  bindingOrder: readonly string[];
  operationClass: MultiCutReplayPostgresqlStatementCatalogEntry["operationKind"];
  transactionClass: MultiCutReplayPostgresqlStatementCatalogEntry["transactionRequirement"];
  retryClass: string;
  reconciliationClass: string;
  logicalAttemptReuse:
    | "reuse-intent-and-expectations"
    | "repeat-authoritative-read"
    | "reuse-terminal-intent";
  commitUnknown: string;
  deterministic: true;
  transactionControlIncluded: false;
  ddlIncluded: false;
}>;

export type MultiCutReplayPostgresqlSqlDefinitionsV2 = Readonly<{
  definitionVersion: "2.0";
  tableName: "multi_cut_replay_records_v2";
  statements: readonly MultiCutReplayPostgresqlSqlDefinitionV2[];
  byStatementId: Readonly<
    Record<
      MultiCutReplayPersistenceStatementIdV2,
      MultiCutReplayPostgresqlSqlDefinitionV2
    >
  >;
}>;
