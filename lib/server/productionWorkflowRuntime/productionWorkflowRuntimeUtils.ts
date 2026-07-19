import { REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES } from "./types";
import type { ProductionWorkflowRuntime, ProductionWorkflowRuntimeValidationIssue, ProductionWorkflowRuntimeValidationResult } from "./runtimeTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFunction(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "function";
}

function isProductionWorkflowRuntimeShape(value: unknown): value is ProductionWorkflowRuntime {
  return isRecord(value)
    && value.runtimeVersion === "1.0"
    && isRecord(value.capabilities)
    && isRecord(value.core)
    && isRecord(value.stores)
    && isRecord(value.providers)
    && isRecord(value.security)
    && isRecord(value.observability)
    && isRecord(value.lifecycle);
}

const storeKeys = Object.freeze([
  "acceptedPersistence",
  "pollState",
  "resumeRecord",
  "resumeJournal",
  "materializationIdempotency",
  "generationIdempotency",
  "generationJobs",
  "generationPollIdempotency",
  "outputIngestionIdempotency",
  "finalResults",
  "apiIdempotency",
  "resultReferences",
  "restrictedInputs",
  "originalInputs",
  "authSessions",
  "csrf",
  "audit",
  "outbox",
] as const);

const storeMethods: Readonly<Record<(typeof storeKeys)[number], readonly string[]>> = Object.freeze({
  acceptedPersistence: ["createIfAbsent", "read", "compareAndSet", "markExpired"],
  pollState: ["create", "read", "claim", "renew", "commitPollResult", "markTerminal", "release"],
  resumeRecord: ["createIfAbsent", "read", "claim", "compareAndSet", "markTerminal"],
  resumeJournal: ["append", "readSafeHistory"],
  materializationIdempotency: ["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"],
  generationIdempotency: ["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"],
  generationJobs: ["createIfAbsent", "read", "claimForPoll", "renewClaim", "commitPending", "commitCompleted", "commitFailed", "commitUnknown", "commitReconciliationRequired", "cancel", "expire"],
  generationPollIdempotency: ["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"],
  outputIngestionIdempotency: ["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"],
  finalResults: ["commitIfAbsent", "read", "compareAndSet"],
  apiIdempotency: ["reserve", "lookup", "commitResult", "commitUnknown", "markConflict", "expire"],
  resultReferences: ["issueIfAbsent", "resolve", "revoke", "expire", "delete"],
  restrictedInputs: ["storeEncrypted", "resolveForAuthorizedUse", "revoke", "delete", "expire"],
  originalInputs: ["createIfAbsent", "read", "delete"],
  authSessions: ["resolve"],
  csrf: ["validate"],
  audit: ["append"],
  outbox: ["append", "claimBatch", "markDelivered"],
});

export function validateProductionWorkflowRuntime(
  value: unknown,
): ProductionWorkflowRuntimeValidationResult {
  if (!isRecord(value)) return { status: "invalid", issues: ["not-an-object"] };

  const issues: ProductionWorkflowRuntimeValidationIssue[] = [];
  if (value.runtimeVersion !== "1.0") issues.push("runtime-version-invalid");
  const bundleNames = ["capabilities", "core", "stores", "providers", "security", "observability", "lifecycle"] as const;
  for (const name of bundleNames) if (!isRecord(value[name])) issues.push("bundle-missing");
  if (issues.includes("bundle-missing")) return { status: "invalid", issues: Object.freeze([...new Set(issues)]) };

  const capabilities = value.capabilities;
  const core = value.core;
  const stores = value.stores;
  const providers = value.providers;
  const lifecycle = value.lifecycle;
  if (!isRecord(capabilities) || !isRecord(core) || !isRecord(stores) || !isRecord(providers) || !isRecord(lifecycle)) {
    return { status: "invalid", issues: ["bundle-missing"] };
  }

  for (const capability of REQUIRED_PRODUCTION_WORKFLOW_CAPABILITIES) {
    const descriptor = capabilities[capability];
    if (!isRecord(descriptor) || descriptor.status !== "available" || descriptor.requirement !== "required") {
      issues.push("required-capability-unavailable");
      break;
    }
  }

  const transactionManager = core.transactionManager;
  if (!isRecord(transactionManager) || !hasFunction(transactionManager, "runInTransaction") || !hasFunction(transactionManager, "stop")) {
    issues.push("transaction-manager-invalid");
  }
  if (stores.bundleVersion !== "1.0") issues.push("bundle-version-invalid");
  const storeObjects: object[] = [];
  for (const key of storeKeys) {
    const store = stores[key];
    if (!isRecord(store) || store.storeVersion !== "1.0") {
      issues.push("store-bundle-invalid");
      break;
    }
    if (storeMethods[key].some((method) => !hasFunction(store, method))) {
      issues.push("store-bundle-invalid");
      break;
    }
    if (storeObjects.includes(store)) issues.push("duplicate-store-reference");
    storeObjects.push(store);
  }
  if (providers.runtimeVersion !== "1.0") issues.push("provider-runtime-invalid");
  if (lifecycle.runtimeVersion !== "1.0" || !hasFunction(lifecycle, "getStatus") || !hasFunction(lifecycle, "validateReadiness") || !hasFunction(lifecycle, "beginDrain") || !hasFunction(lifecycle, "shutdown")) {
    issues.push("lifecycle-invalid");
  }

  if (issues.length > 0 || !isProductionWorkflowRuntimeShape(value)) {
    const safeIssues: ProductionWorkflowRuntimeValidationIssue[] = issues.length > 0
      ? issues
      : ["bundle-missing"];
    return { status: "invalid", issues: Object.freeze([...new Set(safeIssues)]) };
  }
  return { status: "valid", runtime: value };
}

export function isCanonicalWorkflowUtcTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
}

export function isValidWorkflowRecordRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
