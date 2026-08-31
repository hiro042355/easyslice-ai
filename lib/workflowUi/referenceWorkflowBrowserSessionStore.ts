import type {
  WorkflowUiRecoverySessionV2,
  WorkflowUiSessionLoadResult,
  WorkflowUiSessionStore,
  WorkflowUiSessionStoreResult,
  WorkflowUiStoredSession,
} from "./types";
import { migrateWorkflowUiSessionV1ToV2 } from "./referenceWorkflowSessionStore";

type ReferenceWorkflowBrowserStoragePort = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

type ReferenceWorkflowBrowserSessionStoreOptions = Readonly<{
  storage?: ReferenceWorkflowBrowserStoragePort;
  identityPartition?: string;
}>;

const STORAGE_KEY_PREFIX = "nexcut.reference-workflow.session-v2";
const SESSION_KEYS = Object.freeze([
  "sessionVersion",
  "operation",
  "reference",
  "lastServerStatus",
  "pollAttempts",
  "createdAt",
  "expiresAt",
]);
const REFERENCE_KEYS = Object.freeze(["referenceVersion", "kind", "reference"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
};

const validPartition = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 16 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);

const hasExactSessionV2Shape = (value: unknown): value is WorkflowUiRecoverySessionV2 => {
  if (!isPlainObject(value) || !hasExactKeys(value, SESSION_KEYS) || value.sessionVersion !== "2.0") return false;
  return isPlainObject(value.reference) && hasExactKeys(value.reference, REFERENCE_KEYS);
};

const canonicalSession = (session: WorkflowUiRecoverySessionV2): WorkflowUiRecoverySessionV2 => ({
  sessionVersion: "2.0",
  operation: session.operation,
  reference: {
    referenceVersion: "1.0",
    kind: session.reference.kind,
    reference: session.reference.reference,
  } as WorkflowUiRecoverySessionV2["reference"],
  lastServerStatus: session.lastServerStatus,
  pollAttempts: session.pollAttempts,
  createdAt: session.createdAt,
  expiresAt: session.expiresAt,
} as WorkflowUiRecoverySessionV2);

export function createReferenceWorkflowBrowserSessionStore(
  options: ReferenceWorkflowBrowserSessionStoreOptions,
): WorkflowUiSessionStore {
  const storage = options.storage;
  const partitionAvailable = validPartition(options.identityPartition);
  const key = partitionAvailable
    ? `${STORAGE_KEY_PREFIX}:${encodeURIComponent(options.identityPartition)}`
    : undefined;
  let enabled = !!storage && !!key;

  const disable = () => {
    enabled = false;
  };

  const cleanupOnce = () => {
    if (!enabled || !storage || !key) return;
    try {
      storage.removeItem(key);
    } catch {
      disable();
    }
  };

  const invalid = (): WorkflowUiSessionStoreResult => ({ status: "invalid" });

  return Object.freeze({
    save(session: WorkflowUiStoredSession): WorkflowUiSessionStoreResult {
      if (!enabled || !storage || !key || !hasExactSessionV2Shape(session)) return invalid();
      const checked = migrateWorkflowUiSessionV1ToV2(session, session.createdAt);
      if (checked.status !== "already-v2") return invalid();
      try {
        storage.setItem(key, JSON.stringify(canonicalSession(checked.session)));
        return { status: "saved" };
      } catch {
        disable();
        return invalid();
      }
    },

    load(baselineTime: string): WorkflowUiSessionLoadResult {
      if (!partitionAvailable || !storage || !key) return { status: "empty" };
      if (!enabled) return { status: "invalid" };
      let serialized: string | null;
      try {
        serialized = storage.getItem(key);
      } catch {
        disable();
        return { status: "invalid" };
      }
      if (serialized === null) return { status: "empty" };

      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized);
      } catch {
        cleanupOnce();
        return { status: "invalid" };
      }
      if (!hasExactSessionV2Shape(parsed)) {
        cleanupOnce();
        return { status: "invalid" };
      }
      const checked = migrateWorkflowUiSessionV1ToV2(parsed, baselineTime);
      if (checked.status === "expired") {
        cleanupOnce();
        return { status: "expired" };
      }
      if (checked.status !== "already-v2") {
        cleanupOnce();
        return { status: "invalid" };
      }
      return { status: "loaded", session: canonicalSession(checked.session) };
    },

    delete(): WorkflowUiSessionStoreResult {
      if (!enabled || !storage || !key) return invalid();
      try {
        storage.removeItem(key);
        return { status: "deleted" };
      } catch {
        disable();
        return invalid();
      }
    },
  });
}
