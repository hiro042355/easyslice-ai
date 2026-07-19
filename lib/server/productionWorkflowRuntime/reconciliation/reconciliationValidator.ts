import type { ReconciliationRuntime, ReconciliationValidationIssue, ReconciliationValidationResult } from "./types";
import { RECONCILIATION_RUNTIME_DESCRIPTOR } from "./reconciliationRegistry";

export function validateReconciliationRuntime(value: unknown): ReconciliationValidationResult {
  if (typeof value !== "object" || value === null) return Object.freeze({ status: "invalid", issues: Object.freeze(["not-an-object"] as const) });
  const runtime = value as Partial<ReconciliationRuntime>;
  const issues: ReconciliationValidationIssue[] = [];
  if (!runtime.descriptor || JSON.stringify(runtime.descriptor) !== JSON.stringify(RECONCILIATION_RUNTIME_DESCRIPTOR)) issues.push("descriptor-invalid");
  if (typeof runtime.reconcile !== "function") issues.push("reconcile-missing");
  if (typeof runtime.heartbeat !== "function") issues.push("heartbeat-missing");
  return issues.length ? Object.freeze({ status: "invalid", issues: Object.freeze(issues) }) : Object.freeze({ status: "valid" });
}
