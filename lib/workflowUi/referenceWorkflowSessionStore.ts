import { validUtcMillis } from "@/lib/workflowApi/workflowApiUtils";
import type {
  WorkflowUiRecoverySessionV2,
  WorkflowUiSessionMigrationResult,
  WorkflowUiSessionStore,
  WorkflowUiStoredSession,
} from "./types";
import { copyWorkflowUi, isWorkflowUiPlainObject, validWorkflowUiSession } from "./workflowUiUtils";

const operations = ["generate-vocal", "generate-music", "generate-mv"] as const;
const isOperation = (value: unknown): value is WorkflowUiRecoverySessionV2["operation"] =>
  typeof value === "string" && operations.some((operation) => operation === value);

export function createReferenceWorkflowInMemorySessionStore(initial?: unknown): WorkflowUiSessionStore {
  let value: unknown;
  try {
    value = initial === undefined ? undefined : copyWorkflowUi(initial);
  } catch {
    value = { invalid: true };
  }
  return Object.freeze({
    save(session: WorkflowUiStoredSession) {
      const checked = session.sessionVersion === "2.0"
        ? migrateWorkflowUiSessionV1ToV2(session, session.createdAt)
        : undefined;
      if (!validWorkflowUiSession(session) && checked?.status !== "already-v2") return { status: "invalid" as const };
      value = copyWorkflowUi(session);
      return { status: "saved" as const };
    },
    load(baselineTime: string) {
      if (value === undefined) return { status: "empty" as const };
      if (validWorkflowUiSession(value)) {
        if (typeof baselineTime !== "string" || baselineTime >= value.expiresAt) {
          value = undefined;
          return { status: "expired" as const };
        }
        return { status: "loaded" as const, session: copyWorkflowUi(value) };
      }
      if (!isWorkflowUiPlainObject(value) || value.sessionVersion !== "2.0" || typeof value.expiresAt !== "string") {
        value = undefined;
        return { status: "invalid" as const };
      }
      if (typeof baselineTime !== "string" || baselineTime >= value.expiresAt) {
        value = undefined;
        return { status: "expired" as const };
      }
      return { status: "loaded" as const, session: copyWorkflowUi(value) as WorkflowUiStoredSession };
    },
    delete() {
      value = undefined;
      return { status: "deleted" as const };
    },
  });
}

export function migrateWorkflowUiSessionV1ToV2(input: unknown, baselineTime: string): WorkflowUiSessionMigrationResult {
  let value: unknown;
  try {
    value = copyWorkflowUi(input);
  } catch {
    return { status: "invalid", reason: "session-migration-invalid" };
  }
  if (!isWorkflowUiPlainObject(value) || typeof value.sessionVersion !== "string") {
    return { status: "invalid", reason: "session-migration-invalid" };
  }
  if (value.sessionVersion !== "1.0" && value.sessionVersion !== "2.0") return { status: "unsupported" };
  const required = ["sessionVersion", "operation", "reference", "lastServerStatus", "pollAttempts", "createdAt", "expiresAt"];
  if (!required.every((key) => key in value) ||
      Object.keys(value).some((key) => ![...required, "resultReference"].includes(key)) ||
      typeof value.createdAt !== "string" || typeof value.expiresAt !== "string" ||
      !validUtcMillis(value.createdAt) || !validUtcMillis(value.expiresAt) || !validUtcMillis(baselineTime) ||
      value.expiresAt <= value.createdAt) {
    return { status: "invalid", reason: "session-migration-invalid" };
  }
  if (baselineTime >= value.expiresAt) return { status: "expired" };
  const reference = value.reference;
  if (!isWorkflowUiPlainObject(reference) || reference.referenceVersion !== "1.0" ||
      typeof reference.reference !== "string" || !reference.reference || typeof reference.kind !== "string") {
    return { status: "invalid", reason: "session-migration-invalid" };
  }
  if (value.sessionVersion === "1.0") {
    if (!validWorkflowUiSession(value)) return { status: "invalid", reason: "session-migration-invalid" };
    if (reference.kind === "workflow-result") return { status: "invalid", reason: "unsupported-legacy-reference-kind" };
    if (reference.kind !== "upload-pending" && reference.kind !== "generation-job") return { status: "invalid", reason: "session-migration-invalid" };
    const expected = reference.kind === "upload-pending" ? "pending-upload" : "pending-generation";
    if (value.lastServerStatus !== expected) return { status: "invalid", reason: "session-migration-invalid" };
    return {
      status: "migrated",
      session: {
        sessionVersion: "2.0",
        operation: value.operation,
        reference: copyWorkflowUi(reference),
        lastServerStatus: expected,
        pollAttempts: value.pollAttempts,
        createdAt: value.createdAt,
        expiresAt: value.expiresAt,
      } as WorkflowUiRecoverySessionV2,
    };
  }
  if (!isOperation(value.operation) || !Number.isSafeInteger(value.pollAttempts) ||
      typeof value.pollAttempts !== "number" || value.pollAttempts < 0 || typeof value.lastServerStatus !== "string") {
    return { status: "invalid", reason: "session-migration-invalid" };
  }
  if (reference.kind === "workflow-result") {
    if (!["completed", "degraded", "partial", "failed", "cancelled"].includes(value.lastServerStatus) || value.pollAttempts !== 0) {
      return { status: "invalid", reason: "session-migration-invalid" };
    }
  } else if (reference.kind === "upload-pending") {
    if (value.lastServerStatus !== "pending-upload") return { status: "invalid", reason: "session-migration-invalid" };
  } else if (reference.kind === "generation-job") {
    if (value.lastServerStatus !== "pending-generation") return { status: "invalid", reason: "session-migration-invalid" };
  } else {
    return { status: "invalid", reason: "session-migration-invalid" };
  }
  return { status: "already-v2", session: copyWorkflowUi(value) as WorkflowUiRecoverySessionV2 };
}
