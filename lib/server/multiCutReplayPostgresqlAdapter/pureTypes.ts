import type { MultiCutReplayPersistenceStatementIdV2 } from "../multiCutReplayPersistenceParameters/types";
import type { MultiCutReplaySqlDefinitionPlaceholderV2 } from "../multiCutReplayPostgresqlSqlDefinitionContract/types";
import type { PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver/types";

export type MultiCutReplayPostgresqlPureAdapterBindings =
  Readonly<
    Record<
      string,
      unknown | Readonly<Record<string, unknown>>
    >
  >;

export type MultiCutReplayPostgresqlPureExecutionParameter = Readonly<{
  ordinal: number;
  token: `$${number}`;
  postgresqlCast: MultiCutReplaySqlDefinitionPlaceholderV2["postgresqlCast"];
  physicalField: string;
  parameterBinding: string;
  value: unknown;
}>;

export type MultiCutReplayPostgresqlPureExecutionRequest = Readonly<{
  requestVersion: "1.0";
  statementId: MultiCutReplayPersistenceStatementIdV2;
  sql: string;
  parameters: readonly MultiCutReplayPostgresqlPureExecutionParameter[];
  values: readonly unknown[];
}>;

export type MultiCutReplayPostgresqlQueryExecutionSuccess = Readonly<{
  kind: "success";
  rows: readonly Readonly<Record<string, unknown>>[];
  rowCount: number;
  command: string;
}>;

export type MultiCutReplayPostgresqlFakeClientResult = Readonly<{
  rows: readonly Readonly<Record<string, unknown>>[];
  rowCount: number;
  command: string;
}>;

export type MultiCutReplayPostgresqlQueryExecutionFailure = Readonly<{
  kind: "execution-failure";
  failureVersion: "1.0";
  classification: "execution-failure";
  safeReason: string;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type MultiCutReplayPostgresqlQueryExecutionResult =
  | MultiCutReplayPostgresqlQueryExecutionSuccess
  | MultiCutReplayPostgresqlQueryExecutionFailure;

export type MultiCutReplayPostgresqlQueryOnlyClient = Readonly<{
  execute(
    request: MultiCutReplayPostgresqlPureExecutionRequest,
  ): Promise<MultiCutReplayPostgresqlQueryExecutionResult>;
}>;

export type MultiCutReplayPostgresqlFakeClient = Readonly<{
  execute(
    request: MultiCutReplayPostgresqlPureExecutionRequest,
  ): Promise<MultiCutReplayPostgresqlFakeClientResult>;
}>;

export type MultiCutReplayPostgresqlFakeClientFailure = Readonly<{
  failureVersion: "1.0";
  classification: "execution-failure" | "commit-unknown";
  safeReason: string;
  sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
  queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
}>;

export type MultiCutReplayPostgresqlPureAdapterInput = Readonly<{
  inputVersion: "1.0";
  statementId: MultiCutReplayPersistenceStatementIdV2;
  bindings: MultiCutReplayPostgresqlPureAdapterBindings;
}>;

export type MultiCutReplayPostgresqlPureAdapterMetadata = Readonly<{
  metadataVersion: "1.0";
  retryClassification: string;
  commitUnknownClassification: string;
  reconciliationClassification: string;
  logicalAttemptReuse:
    | "reuse-intent-and-expectations"
    | "repeat-authoritative-read"
    | "reuse-terminal-intent";
}>;

export type MultiCutReplayPostgresqlPureQueryMappingResult =
  | Readonly<{
    resultVersion: "1.0";
    status: "mapped";
    statementId: MultiCutReplayPersistenceStatementIdV2;
    row: Readonly<Record<string, unknown>>;
    rowCount: 1;
    command: string;
    metadata: MultiCutReplayPostgresqlPureAdapterMetadata;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "zero-row";
    statementId: MultiCutReplayPersistenceStatementIdV2;
    rowCount: 0;
    command: string;
    classification: "not-single-cause";
    lookupRequired: boolean;
    reconciliationRequired: boolean;
    metadata: MultiCutReplayPostgresqlPureAdapterMetadata;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "cardinality-failure";
    statementId: MultiCutReplayPersistenceStatementIdV2;
    rowCount: number;
    classification: "invariant-violation";
    metadata: MultiCutReplayPostgresqlPureAdapterMetadata;
  }>
  | Readonly<{
    resultVersion: "1.0";
    status: "execution-failure";
    statementId: MultiCutReplayPersistenceStatementIdV2;
    classification: "execution-failure";
    safeReason: string;
    sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
    queryConnectionDisposition?: PostgreSQLQueryConnectionDisposition;
    metadata: MultiCutReplayPostgresqlPureAdapterMetadata;
  }>;

export type MultiCutReplayPostgresqlPureAdapterResult =
  | MultiCutReplayPostgresqlPureQueryMappingResult
  | Readonly<{
    resultVersion: "1.0";
    status: "execution-failure";
    statementId: MultiCutReplayPersistenceStatementIdV2;
    classification: "commit-unknown";
    safeReason: string;
    sqlStateClass?: "08" | "23" | "25" | "40" | "42" | "57";
    metadata: MultiCutReplayPostgresqlPureAdapterMetadata;
  }>;

export type MultiCutReplayPostgresqlPureQueryMappingCore = Readonly<{
  coreVersion: "1.0";
  createExecutionRequest(
    input: MultiCutReplayPostgresqlPureAdapterInput,
  ): MultiCutReplayPostgresqlPureExecutionRequest;
  execute(
    input: MultiCutReplayPostgresqlPureAdapterInput,
  ): Promise<MultiCutReplayPostgresqlPureQueryMappingResult>;
}>;

export type MultiCutReplayPostgresqlPureAdapter = Readonly<{
  createExecutionRequest(
    input: MultiCutReplayPostgresqlPureAdapterInput,
  ): MultiCutReplayPostgresqlPureExecutionRequest;
  execute(
    input: MultiCutReplayPostgresqlPureAdapterInput,
  ): Promise<MultiCutReplayPostgresqlPureAdapterResult>;
}>;
