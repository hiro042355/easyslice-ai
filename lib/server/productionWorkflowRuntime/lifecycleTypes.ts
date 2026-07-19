export type ProductionWorkflowRuntimeLifecycleStatus =
  | "constructing"
  | "validating"
  | "ready"
  | "draining"
  | "stopped"
  | "failed";

export type ProductionWorkflowReadinessIssueCode =
  | "configuration-invalid"
  | "store-unavailable"
  | "schema-incompatible"
  | "migration-incomplete"
  | "outbox-unavailable"
  | "binding-unavailable"
  | "credential-resolver-unavailable"
  | "capability-unavailable"
  | "runtime-version-incompatible";

export type ProductionWorkflowReadinessResult =
  | Readonly<{ status: "ready" }>
  | Readonly<{ status: "degraded" | "not-ready"; issues: readonly ProductionWorkflowReadinessIssueCode[] }>;

export type ProductionWorkflowDrainResult =
  | Readonly<{ status: "draining" | "already-draining" | "drained" }>
  | Readonly<{ status: "failed"; issue: "in-flight-unknown" | "dependency-unavailable" }>;

export type ProductionWorkflowShutdownResult =
  | Readonly<{ status: "stopped" | "already-stopped" }>
  | Readonly<{ status: "failed"; issue: "drain-incomplete" | "dependency-unavailable" }>;

export type ProductionWorkflowLifecycleRuntime = Readonly<{
  runtimeVersion: "1.0";
  getStatus(): ProductionWorkflowRuntimeLifecycleStatus;
  validateReadiness(): Promise<ProductionWorkflowReadinessResult>;
  beginDrain(): Promise<ProductionWorkflowDrainResult>;
  shutdown(): Promise<ProductionWorkflowShutdownResult>;
}>;
