import type {
  MultiCutReplayPostgresqlDriver,
  MultiCutReplayPostgresqlDriverError,
} from "../multiCutReplayPostgresqlDriver";
import type {
  PostgreSQLConnectionPool,
  PostgreSQLSafeDiagnostic,
} from "../productionWorkflowRuntime/postgresqlDriver";

export type MultiCutReplayPostgresqlProductionBridgeError =
  MultiCutReplayPostgresqlDriverError &
    Readonly<{
      retryable: boolean;
      commitUnknown: boolean;
      sqlStateClass?: PostgreSQLSafeDiagnostic["sqlStateClass"];
      originalCauseRetained: false;
      reconciliationRequired: boolean;
    }>;

export type MultiCutReplayPostgresqlProductionBridgeDependencies =
  Readonly<{
    pool: PostgreSQLConnectionPool;
  }>;

export type MultiCutReplayPostgresqlProductionBridge =
  MultiCutReplayPostgresqlDriver;
