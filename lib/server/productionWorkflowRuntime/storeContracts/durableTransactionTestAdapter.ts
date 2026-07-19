import { createDurableStoreFailureController } from "./durableStoreFailureController";
import { createDurableDatabaseClock, identityKey } from "./storeContractUtils";
import type {
  DurableContractAtomicGroup,
  DurableContractClaimResult,
  DurableContractIdempotencyResult,
  DurableContractLease,
  DurableContractMutationResult,
  DurableContractReadResult,
  DurableContractRecord,
  DurableContractTransactionContext,
  DurableContractTransactionResult,
  DurableWorkflowStoreContractAdapterFactory,
  DurableWorkflowStoreContractEnvironment,
} from "./types";
import type { WorkflowProtectedIdentity } from "../types";

type IdempotencyEntry = {
  fingerprint: string;
  state: "reserved" | "result" | "unknown";
  resultClass?: string;
};

type SharedBackend = {
  records: Map<string, DurableContractRecord>;
  references: Map<string, WorkflowProtectedIdentity>;
  outbox: Map<string, Readonly<Record<string, string | number | boolean | null>>>;
  idempotency: Map<string, IdempotencyEntry>;
  leases: Map<string, DurableContractLease>;
  unknown: Map<string, "committed" | "not-committed" | "still-unknown">;
  fence: number;
};

function backend(): SharedBackend {
  return { records: new Map(), references: new Map(), outbox: new Map(), idempotency: new Map(), leases: new Map(), unknown: new Map(), fence: 0 };
}

function copyIdentity(value: WorkflowProtectedIdentity): WorkflowProtectedIdentity {
  return Object.freeze({ ...value });
}

function copyRecord(value: DurableContractRecord): DurableContractRecord {
  return Object.freeze({ ...value, identity: copyIdentity(value.identity), orderedValues: Object.freeze([...value.orderedValues]) });
}

function copyLease(value: DurableContractLease): DurableContractLease {
  return Object.freeze({ ...value, identity: copyIdentity(value.identity), owner: copyIdentity(value.owner) });
}

function readRecord(shared: SharedBackend, identity: WorkflowProtectedIdentity): DurableContractReadResult {
  const value = shared.records.get(identityKey(identity));
  if (value === undefined) return { status: "not-found" };
  if (value.status === "expired") return { status: "expired" };
  if (value.status === "deleted") return { status: "deleted" };
  if (value.status === "corrupted") return { status: "corrupted" };
  return { status: "found", record: copyRecord(value) };
}

function createEnvironment(shared: SharedBackend): DurableWorkflowStoreContractEnvironment {
  const failures = createDurableStoreFailureController();
  const clock = createDurableDatabaseClock("2026-07-15T00:00:00.000Z");
  let disposed = false;
  let transactionActive = false;

  const environment: DurableWorkflowStoreContractEnvironment = Object.freeze({
    descriptor: Object.freeze({
      descriptorVersion: "1.0",
      id: "durable-workflow-store-test-adapter-v1",
      mode: "contract-test-only",
      durable: false,
      crossProcess: false,
      crossInstance: true,
      productionReady: false,
    }),
    clock,
    failures,
    transaction: Object.freeze({
      async run<T>(callback: (context: DurableContractTransactionContext) => Promise<Readonly<{ status: "success"; value: T }> | Readonly<{ status: "failure" }>> | Readonly<{ status: "success"; value: T }> | Readonly<{ status: "failure" }>): Promise<DurableContractTransactionResult<T>> {
        if (disposed) return { status: "rejected", reason: "disposed" };
        if (transactionActive) return { status: "rejected", reason: "nested" };
        const begin = failures.consume("transaction-begin");
        if (begin !== undefined) return { status: "rolled-back", reason: "begin-unavailable" };
        transactionActive = true;
        let open = true;
        const staged = new Map<string, DurableContractRecord>();
        const hooks: Array<() => void | Promise<void>> = [];
        const context: DurableContractTransactionContext = Object.freeze({
          contextVersion: "1.0",
          externalIoAllowed: false,
          set(identity, value) {
            if (!open) return "closed";
            staged.set(identityKey(identity), copyRecord(value));
            return "staged";
          },
          registerAfterCommit(hook) {
            if (!open) return "closed";
            hooks.push(hook);
            return "registered";
          },
        });
        let result: Readonly<{ status: "success"; value: T }> | Readonly<{ status: "failure" }>;
        try {
          result = await callback(context);
        } catch {
          open = false;
          transactionActive = false;
          return { status: "rolled-back", reason: "callback-failed" };
        }
        open = false;
        transactionActive = false;
        if (result.status === "failure") {
          const rollback = failures.consume("transaction-rollback");
          return { status: "rolled-back", reason: rollback === undefined ? "safe-failure" : "rollback-failed" };
        }
        const commit = failures.consume("transaction-commit");
        if (commit?.failure === "unknown-outcome") {
          if (commit.resolution === "committed") for (const [key, value] of staged) shared.records.set(key, copyRecord(value));
          return { status: "unknown" };
        }
        if (commit !== undefined) return { status: "rolled-back", reason: "commit-failed" };
        for (const [key, value] of staged) shared.records.set(key, copyRecord(value));
        try {
          for (const hook of hooks) await hook();
          return { status: "committed", value: result.value, afterCommit: "completed" };
        } catch {
          return { status: "committed", value: result.value, afterCommit: "failed" };
        }
      },
    }),
    records: Object.freeze({
      async create(record: DurableContractRecord): Promise<DurableContractMutationResult> {
        if (disposed || failures.consume("record-create") !== undefined) return { status: "unavailable" };
        const key = identityKey(record.identity);
        const current = shared.records.get(key);
        if (current !== undefined) return { status: "found", record: copyRecord(current) };
        shared.records.set(key, copyRecord(record));
        return { status: "created", record: copyRecord(record) };
      },
      async read(identity: WorkflowProtectedIdentity): Promise<DurableContractReadResult> {
        if (disposed || failures.consume("record-read") !== undefined) return { status: "unavailable" };
        return readRecord(shared, identity);
      },
      async cas(identity: WorkflowProtectedIdentity, expectedRevision: number, record: DurableContractRecord): Promise<DurableContractMutationResult> {
        if (disposed || failures.consume("cas") !== undefined) return { status: "unavailable" };
        const key = identityKey(identity);
        const current = shared.records.get(key);
        if (current === undefined) return { status: "not-found" };
        if (current.status === "terminal") return { status: "terminal" };
        if (current.status === "deleted") return { status: "deleted" };
        if (current.status === "expired") return { status: "expired" };
        if (current.status === "corrupted") return { status: "corrupted" };
        if (current.revision !== expectedRevision || record.revision !== expectedRevision + 1) return { status: "conflict" };
        shared.records.set(key, copyRecord(record));
        return { status: "updated", record: copyRecord(record) };
      },
      async delete(identity: WorkflowProtectedIdentity): Promise<DurableContractMutationResult> {
        if (disposed) return { status: "unavailable" };
        const key = identityKey(identity);
        const current = shared.records.get(key);
        if (current === undefined) return { status: "not-found" };
        if (current.legalHold) return { status: "conflict" };
        const deleted = copyRecord({ ...current, revision: current.revision + 1, status: "deleted" });
        shared.records.set(key, deleted);
        return { status: "updated", record: deleted };
      },
    }),
    atomic: Object.freeze({
      async commit(group: DurableContractAtomicGroup) {
        if (disposed) return { status: "rolled-back", reason: "unavailable" } as const;
        const resultKey = identityKey(group.result.identity);
        const referenceKey = identityKey(group.referenceIndex);
        const outboxKey = identityKey(group.outboxEvent);
        if (shared.records.has(resultKey) || shared.references.has(referenceKey) || shared.outbox.has(outboxKey)) return { status: "rolled-back", reason: "conflict" } as const;
        if (failures.consume("reference-issue") !== undefined || failures.consume("outbox-append") !== undefined) return { status: "rolled-back", reason: "write-failed" } as const;
        const commit = failures.consume("transaction-commit");
        if (commit?.failure === "unknown-outcome") {
          shared.unknown.set(resultKey, commit.resolution);
          if (commit.resolution === "committed") {
            shared.records.set(resultKey, copyRecord(group.result));
            shared.references.set(referenceKey, copyIdentity(group.result.identity));
            shared.outbox.set(outboxKey, Object.freeze({ ...group.outboxPayload }));
          }
          return { status: "unknown" } as const;
        }
        if (commit !== undefined) return { status: "rolled-back", reason: "write-failed" } as const;
        shared.records.set(resultKey, copyRecord(group.result));
        shared.references.set(referenceKey, copyIdentity(group.result.identity));
        shared.outbox.set(outboxKey, Object.freeze({ ...group.outboxPayload }));
        return { status: "committed" } as const;
      },
      async readResult(identity: WorkflowProtectedIdentity) {
        return readRecord(shared, identity);
      },
      async resolveReference(index: WorkflowProtectedIdentity) {
        const resultIdentity = shared.references.get(identityKey(index));
        return resultIdentity === undefined ? { status: "not-found" } as const : { status: "found", resultIdentity: copyIdentity(resultIdentity) } as const;
      },
      async readOutbox(event: WorkflowProtectedIdentity) {
        const payload = shared.outbox.get(identityKey(event));
        return payload === undefined ? { status: "not-found" } as const : { status: "found", payload: Object.freeze({ ...payload }) } as const;
      },
      async resolveUnknown(identity: WorkflowProtectedIdentity) {
        const status = shared.unknown.get(identityKey(identity));
        return { status: status ?? (shared.records.has(identityKey(identity)) ? "committed" : "not-committed") } as const;
      },
    }),
    idempotency: Object.freeze({
      async reserve(identity: WorkflowProtectedIdentity, fingerprint: WorkflowProtectedIdentity): Promise<DurableContractIdempotencyResult> {
        if (disposed || failures.consume("idempotency-reserve") !== undefined) return { status: "unavailable" };
        const key = identityKey(identity);
        const existing = shared.idempotency.get(key);
        if (existing !== undefined) return existing.fingerprint === identityKey(fingerprint)
          ? { status: "existing-same", state: existing.state, ...(existing.resultClass === undefined ? {} : { resultClass: existing.resultClass }) }
          : { status: "different-fingerprint" };
        shared.idempotency.set(key, { fingerprint: identityKey(fingerprint), state: "reserved" });
        return { status: "reserved", state: "reserved" };
      },
      async lookup(identity: WorkflowProtectedIdentity): Promise<DurableContractIdempotencyResult> {
        if (disposed) return { status: "unavailable" };
        const value = shared.idempotency.get(identityKey(identity));
        if (value === undefined) return { status: "expired" };
        return { status: "existing-same", state: value.state, ...(value.resultClass === undefined ? {} : { resultClass: value.resultClass }) };
      },
      async commitResult(identity: WorkflowProtectedIdentity, resultClass: string): Promise<DurableContractIdempotencyResult> {
        const value = shared.idempotency.get(identityKey(identity));
        if (disposed || value === undefined) return { status: "unavailable" };
        value.state = "result";
        value.resultClass = resultClass;
        return { status: "existing-same", state: "result", resultClass };
      },
      async commitUnknown(identity: WorkflowProtectedIdentity): Promise<DurableContractIdempotencyResult> {
        const value = shared.idempotency.get(identityKey(identity));
        if (disposed || value === undefined) return { status: "unavailable" };
        value.state = "unknown";
        return { status: "existing-same", state: "unknown" };
      },
    }),
    claims: Object.freeze({
      async acquire(identity: WorkflowProtectedIdentity, owner: WorkflowProtectedIdentity, expiresAt: string): Promise<DurableContractClaimResult> {
        if (disposed || failures.consume("claim") !== undefined) return { status: "unavailable" };
        const record = shared.records.get(identityKey(identity));
        if (record?.status === "terminal") return { status: "terminal" };
        if (record?.status === "deleted") return { status: "deleted" };
        const existing = shared.leases.get(identityKey(identity));
        if (existing !== undefined && existing.expiresAt > clock.read()) return identityKey(existing.owner) === identityKey(owner) ? { status: "already-claimed" } : { status: "conflict" };
        shared.fence += 1;
        const lease = copyLease({ leaseVersion: "1.0", identity, owner, fencingRevision: shared.fence, expiresAt, attempt: (existing?.attempt ?? 0) + 1, providerSubmitPermitted: false });
        shared.leases.set(identityKey(identity), lease);
        return { status: "acquired", lease: copyLease(lease) };
      },
      async renew(lease: DurableContractLease, expiresAt: string): Promise<DurableContractClaimResult> {
        if (disposed || failures.consume("lease-renew") !== undefined) return { status: "unavailable" };
        const current = shared.leases.get(identityKey(lease.identity));
        if (current === undefined || current.fencingRevision !== lease.fencingRevision) return { status: "stale-fence" };
        if (current.expiresAt <= clock.read()) return { status: "expired" };
        const renewed = copyLease({ ...current, expiresAt });
        shared.leases.set(identityKey(lease.identity), renewed);
        return { status: "renewed", lease: copyLease(renewed) };
      },
      async release(lease: DurableContractLease) {
        if (disposed) return { status: "unavailable" } as const;
        const current = shared.leases.get(identityKey(lease.identity));
        if (current === undefined || current.fencingRevision !== lease.fencingRevision) return { status: "stale-fence" } as const;
        if (current.expiresAt <= clock.read()) return { status: "expired" } as const;
        shared.leases.delete(identityKey(lease.identity));
        return { status: "released" } as const;
      },
    }),
    async reset() {
      if (disposed) return "reset";
      shared.records.clear();
      shared.references.clear();
      shared.outbox.clear();
      shared.idempotency.clear();
      shared.leases.clear();
      shared.unknown.clear();
      shared.fence = 0;
      failures.reset();
      return "reset";
    },
    async dispose() {
      if (disposed) return "already-disposed";
      disposed = true;
      failures.reset();
      return "disposed";
    },
  });
  return environment;
}

export function createDurableWorkflowStoreTestAdapterFactory(): DurableWorkflowStoreContractAdapterFactory {
  return Object.freeze({
    factoryVersion: "1.0" as const,
    async createEnvironment() {
      return createEnvironment(backend());
    },
    async createSharedEnvironments(count: number) {
      if (!Number.isSafeInteger(count) || count < 1) return Object.freeze([]);
      const shared = backend();
      return Object.freeze(Array.from({ length: count }, () => createEnvironment(shared)));
    },
  });
}
