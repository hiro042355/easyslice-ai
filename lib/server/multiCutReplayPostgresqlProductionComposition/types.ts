import type {
  MultiCutReplayPostgresqlExecutionRuntime,
} from "../multiCutReplayPostgresqlExecutionRuntime";
import type {
  MultiCutReplayPostgresqlProductionBridge,
} from "../multiCutReplayPostgresqlProductionBridge";
import type {
  MultiCutReplayPostgresqlDriver,
} from "../multiCutReplayPostgresqlDriver";
import type {
  PostgreSQLConnectionConfig,
  PostgreSQLConnectionPool,
} from "../productionWorkflowRuntime/postgresqlDriver";

export type MultiCutReplayPostgresqlProductionCompositionFailureClassification =
  | "configuration-failure"
  | "startup-failure"
  | "runtime-failure"
  | "shutdown-failure";

export type MultiCutReplayPostgresqlProductionCompositionState =
  | "ready"
  | "shutting-down"
  | "closed"
  | "failed";

export type MultiCutReplayPostgresqlProductionPoolFactory = Readonly<{
  create(config: PostgreSQLConnectionConfig): PostgreSQLConnectionPool;
}>;

export type MultiCutReplayPostgresqlProductionCompositionDependencies =
  Readonly<{
    poolFactory?: MultiCutReplayPostgresqlProductionPoolFactory;
  }>;

export type MultiCutReplayPostgresqlProductionCompositionShutdownResult =
  | Readonly<{ status: "closed" | "already-closed" }>
  | Readonly<{
      status: "failed";
      classification: "shutdown-failure";
      safeReason: string;
    }>;

export type MultiCutReplayPostgresqlProductionComposition = Readonly<{
  compositionVersion: "1.0";
  runtime: MultiCutReplayPostgresqlExecutionRuntime;
  state(): MultiCutReplayPostgresqlProductionCompositionState;
  shutdown(): Promise<MultiCutReplayPostgresqlProductionCompositionShutdownResult>;
}>;

export type MultiCutReplayPostgresqlProductionCompositionResult =
  | Readonly<{
      status: "ready";
      composition: MultiCutReplayPostgresqlProductionComposition;
    }>
  | Readonly<{
      status: "failed";
      classification: "configuration-failure" | "startup-failure";
      safeReason: string;
    }>;

export type MultiCutReplayPostgresqlProductionCompositionWiring = Readonly<{
  pool: PostgreSQLConnectionPool;
  bridge: MultiCutReplayPostgresqlProductionBridge;
  driver: MultiCutReplayPostgresqlDriver;
  runtime: MultiCutReplayPostgresqlExecutionRuntime;
}>;
