import type { MultiCutReplaySqlDefinitionPlaceholderV2 } from "../multiCutReplayPostgresqlSqlDefinitionContract";
import type {
  PostgreSQLDriverIssueCode,
  PostgreSQLParameter,
} from "../productionWorkflowRuntime/postgresqlDriver";
import type { MultiCutReplayPostgresqlDriverErrorKind } from "../multiCutReplayPostgresqlDriver";

export type MultiCutReplayProductionBridgeParameterProjection = Readonly<{
  cast: MultiCutReplaySqlDefinitionPlaceholderV2["postgresqlCast"];
  acceptedInput: string;
  normalization: "none" | "canonical-validation-only";
  parameterKind: PostgreSQLParameter["kind"];
  nullable: false;
  invalidInput: "fail-closed-before-query";
  overflow: string;
  precision: "exact";
}>;

export type MultiCutReplayProductionBridgeFailureSource =
  | PostgreSQLDriverIssueCode
  | "commit-outcome-unknown"
  | "non-postgresql-thrown-value";

export type MultiCutReplayProductionBridgeFailureProjection = Readonly<{
  source: MultiCutReplayProductionBridgeFailureSource;
  target: MultiCutReplayPostgresqlDriverErrorKind;
  retryable: boolean;
  commitUnknown: boolean;
  originalCause: "not-exposed";
  sqlState: "safe-class-only" | "not-retained";
  safeReason: "classified-safe-reason";
  reconciliation: "required" | "not-required";
}>;

export type MultiCutReplayProductionBridgeConnectionState =
  | "acquired"
  | "transaction-open"
  | "committed"
  | "rolled-back"
  | "commit-unknown"
  | "discarded"
  | "released";

export type MultiCutReplayProductionBridgeConnectionStateRule = Readonly<{
  state: MultiCutReplayProductionBridgeConnectionState;
  release: "allowed" | "prohibited" | "idempotent-no-op";
  discard: "allowed" | "required" | "idempotent-no-op";
  repeatedCall: "same-terminal-outcome" | "prohibited-while-active";
  underlyingAction:
    | "return-to-pool"
    | "destroy-connection"
    | "none"
    | "transaction-must-finish-first";
  runtimeReleaseResult: "release" | "no-op" | "not-reachable";
}>;

export type MultiCutReplayProductionBridgeContract = Readonly<{
  contractVersion: "1.0";
  command: Readonly<{
    owner: "pg-query-result";
    productionSource: "PostgreSQLQueryResult.command";
    replayTarget: "MultiCutReplayPostgresqlFakeClientResult.command";
    projection: "direct";
    inference: "forbidden";
  }>;
  zeroRow: Readonly<{
    owner: "multi-cut-replay-postgresql-pure-adapter";
    driverExpectedResult: "many";
    bridgeClassification: "none";
    preservedCardinalities: readonly [0, 1, "multiple"];
  }>;
  parameters: readonly MultiCutReplayProductionBridgeParameterProjection[];
  result: Readonly<{
    fields: readonly ["rows", "rowCount", "command"];
    rows: "decoded-values-copy-isolated";
    rowCount: "direct";
    command: "direct";
    null: "preserve";
    undefined: "fail-closed";
    domainMapping: "forbidden";
  }>;
  failures: readonly MultiCutReplayProductionBridgeFailureProjection[];
  connections: readonly MultiCutReplayProductionBridgeConnectionStateRule[];
  transactionOwner: "multi-cut-replay-postgresql-execution-runtime";
  mechanismProvider: "production-postgresql-driver";
  dependencyDirection: Readonly<{
    bridgeDependsOn: readonly [
      "multi-cut-replay-postgresql-driver-types",
      "production-postgresql-driver-types",
    ];
    forbidden: readonly [
      "production-driver-to-replay",
      "pure-adapter-to-production-driver",
      "execution-runtime-to-pg",
      "sql-definitions-to-driver",
      "circular-dependency",
    ];
  }>;
}>;
