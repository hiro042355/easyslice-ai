import type { DurableWorkflowTransactionManager, DurableWorkflowTransactionValidationIssue, DurableWorkflowTransactionValidationResult } from "./types";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export function validateDurableWorkflowTransactionManager(value: unknown): DurableWorkflowTransactionValidationResult {
  if (!isRecord(value)) return Object.freeze({ status: "invalid", issues: Object.freeze(["not-an-object" as const]) });
  const issues: DurableWorkflowTransactionValidationIssue[] = [];
  const descriptor = value.descriptor;
  if (!isRecord(descriptor)
    || descriptor.descriptorVersion !== "2.0"
    || descriptor.id !== "production-workflow-transaction-manager-v2"
    || descriptor.mode !== "production-durable"
    || descriptor.durable !== true
    || descriptor.crossInstance !== true
    || descriptor.nestedTransactions !== false
    || descriptor.savepoints !== false
    || descriptor.externalIoInsideTransaction !== false
    || descriptor.commitUnknownSupported !== true
    || descriptor.productionReady !== false) issues.push("descriptor-invalid");
  if (typeof value.state !== "function") issues.push("state-invalid");
  if (typeof value.runInTransaction !== "function") issues.push("run-method-missing");
  if (typeof value.dispose !== "function") issues.push("dispose-method-missing");
  return issues.length === 0
    ? Object.freeze({ status: "valid" })
    : Object.freeze({ status: "invalid", issues: Object.freeze([...issues]) });
}

export function isDurableWorkflowTransactionManager(value: unknown): value is DurableWorkflowTransactionManager {
  return validateDurableWorkflowTransactionManager(value).status === "valid";
}
