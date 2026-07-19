import type { ProductionWorkflowOperation, WorkflowUtcTimestamp } from "./types";

export type ProductionWorkflowSafeDimension = Readonly<{
  operation?: ProductionWorkflowOperation;
  stage?: string;
  statusClass?: string;
  providerClass?: string;
  durationClass?: string;
  retryClass?: string;
  regionClass?: string;
  safeReasonCode?: string;
}>;

export type ProductionWorkflowSafeAuditProjection = Readonly<{
  auditVersion: "1.0";
  action: string;
  outcomeClass: string;
  policyVersion: string;
  recordedAt: WorkflowUtcTimestamp;
  dimensions: ProductionWorkflowSafeDimension;
}>;

export type ProductionWorkflowTraceHandle = Readonly<{
  traceVersion: "1.0";
  addSafeEvent(name: string, dimensions: ProductionWorkflowSafeDimension): void;
  end(statusClass: string): void;
}>;

export type ProductionWorkflowObservabilityRuntime = Readonly<{
  runtimeVersion: "1.0";
  recordMetric(name: string, value: number, dimensions: ProductionWorkflowSafeDimension): void;
  recordSafeAudit(event: ProductionWorkflowSafeAuditProjection): Promise<Readonly<{ status: "recorded" | "deferred" | "unavailable" }>>;
  startTrace(name: string, dimensions: ProductionWorkflowSafeDimension): ProductionWorkflowTraceHandle;
  recordHealth(componentClass: string, status: "healthy" | "degraded" | "unavailable"): void;
}>;
