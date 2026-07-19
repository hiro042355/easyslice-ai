import type { WorkflowProtectedIdentity } from "../types";

export type DurableWorkflowStoreTestAdapterDescriptor = Readonly<{
  descriptorVersion: "1.0";
  id: "durable-workflow-store-test-adapter-v1";
  mode: "contract-test-only";
  durable: false;
  crossProcess: false;
  crossInstance: boolean;
  productionReady: false;
}>;

export type DurableStoreFailureOperation =
  | "transaction-begin"
  | "transaction-commit"
  | "transaction-rollback"
  | "record-create"
  | "record-read"
  | "record-update"
  | "cas"
  | "claim"
  | "lease-renew"
  | "outbox-append"
  | "reference-issue"
  | "idempotency-reserve";

export type DurableStoreFailureClass =
  | "definite-failure"
  | "unknown-outcome"
  | "unavailable"
  | "timeout"
  | "conflict"
  | "corrupted-result";

export type DurableCommitUnknownResolution =
  | "committed"
  | "not-committed"
  | "still-unknown";

export type DurableStoreFailureController = Readonly<{
  controllerVersion: "1.0";
  inject(operation: DurableStoreFailureOperation, failure: DurableStoreFailureClass, resolution?: DurableCommitUnknownResolution): "injected";
  consume(operation: DurableStoreFailureOperation): Readonly<{ failure: DurableStoreFailureClass; resolution: DurableCommitUnknownResolution }> | undefined;
  reset(): void;
}>;

export type DurableDatabaseClock = Readonly<{
  clockVersion: "1.0";
  read(): string;
  advance(milliseconds: number): "advanced" | "frozen" | "invalid";
  freeze(): "frozen";
}>;

export type DurableContractRecordStatus =
  | "active"
  | "terminal"
  | "expired"
  | "deletion-pending"
  | "deleted"
  | "corrupted";

export type DurableContractRecord = Readonly<{
  recordVersion: "1.0";
  identity: WorkflowProtectedIdentity;
  revision: number;
  status: DurableContractRecordStatus;
  legalHold: boolean;
  valueClass: string;
  orderedValues: readonly string[];
}>;

export type DurableContractReadResult =
  | Readonly<{ status: "found"; record: DurableContractRecord }>
  | Readonly<{ status: "not-found" | "expired" | "deleted" | "corrupted" | "unavailable" }>;

export type DurableContractMutationResult =
  | Readonly<{ status: "created" | "updated" | "found"; record: DurableContractRecord }>
  | Readonly<{ status: "conflict" | "not-found" | "terminal" | "expired" | "deleted" | "corrupted" | "unavailable" }>;

export type DurableContractAtomicGroup = Readonly<{
  groupVersion: "1.0";
  result: DurableContractRecord;
  referenceIndex: WorkflowProtectedIdentity;
  outboxEvent: WorkflowProtectedIdentity;
  outboxPayload: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type DurableContractAtomicCommitResult =
  | Readonly<{ status: "committed" }>
  | Readonly<{ status: "rolled-back"; reason: "write-failed" | "conflict" | "unavailable" }>
  | Readonly<{ status: "unknown" }>;

export type DurableContractUnknownLookupResult =
  | Readonly<{ status: "committed" | "not-committed" | "still-unknown" }>
  | Readonly<{ status: "corrupted" | "unavailable" }>;

export type DurableContractIdempotencyResult =
  | Readonly<{ status: "reserved" | "existing-same"; state: "reserved" | "result" | "unknown"; resultClass?: string }>
  | Readonly<{ status: "different-fingerprint" | "expired" | "deleted" | "unavailable" }>;

export type DurableContractLease = Readonly<{
  leaseVersion: "1.0";
  identity: WorkflowProtectedIdentity;
  owner: WorkflowProtectedIdentity;
  fencingRevision: number;
  expiresAt: string;
  attempt: number;
  providerSubmitPermitted: false;
}>;

export type DurableContractClaimResult =
  | Readonly<{ status: "acquired" | "renewed"; lease: DurableContractLease }>
  | Readonly<{ status: "already-claimed" | "conflict" | "expired" | "stale-fence" | "terminal" | "deleted" | "unavailable" }>;

export type DurableContractTransactionResult<T> =
  | Readonly<{ status: "committed"; value: T; afterCommit: "completed" | "failed" }>
  | Readonly<{ status: "rolled-back"; reason: "callback-failed" | "safe-failure" | "begin-unavailable" | "commit-failed" | "rollback-failed" }>
  | Readonly<{ status: "unknown" }>
  | Readonly<{ status: "rejected"; reason: "nested" | "disposed" }>;

export type DurableContractTransactionContext = Readonly<{
  contextVersion: "1.0";
  externalIoAllowed: false;
  set(identity: WorkflowProtectedIdentity, value: DurableContractRecord): "staged" | "closed";
  registerAfterCommit(hook: () => void | Promise<void>): "registered" | "closed";
}>;

export type DurableWorkflowStoreContractEnvironment = Readonly<{
  descriptor: DurableWorkflowStoreTestAdapterDescriptor;
  clock: DurableDatabaseClock;
  failures: DurableStoreFailureController;
  transaction: Readonly<{
    run<T>(callback: (context: DurableContractTransactionContext) => Promise<Readonly<{ status: "success"; value: T }> | Readonly<{ status: "failure" }>> | Readonly<{ status: "success"; value: T }> | Readonly<{ status: "failure" }>): Promise<DurableContractTransactionResult<T>>;
  }>;
  records: Readonly<{
    create(record: DurableContractRecord): Promise<DurableContractMutationResult>;
    read(identity: WorkflowProtectedIdentity): Promise<DurableContractReadResult>;
    cas(identity: WorkflowProtectedIdentity, expectedRevision: number, record: DurableContractRecord): Promise<DurableContractMutationResult>;
    delete(identity: WorkflowProtectedIdentity): Promise<DurableContractMutationResult>;
  }>;
  atomic: Readonly<{
    commit(group: DurableContractAtomicGroup): Promise<DurableContractAtomicCommitResult>;
    readResult(identity: WorkflowProtectedIdentity): Promise<DurableContractReadResult>;
    resolveReference(index: WorkflowProtectedIdentity): Promise<Readonly<{ status: "found"; resultIdentity: WorkflowProtectedIdentity }> | Readonly<{ status: "not-found" }>>;
    readOutbox(event: WorkflowProtectedIdentity): Promise<Readonly<{ status: "found"; payload: Readonly<Record<string, string | number | boolean | null>> }> | Readonly<{ status: "not-found" }>>;
    resolveUnknown(identity: WorkflowProtectedIdentity): Promise<DurableContractUnknownLookupResult>;
  }>;
  idempotency: Readonly<{
    reserve(identity: WorkflowProtectedIdentity, fingerprint: WorkflowProtectedIdentity): Promise<DurableContractIdempotencyResult>;
    lookup(identity: WorkflowProtectedIdentity): Promise<DurableContractIdempotencyResult>;
    commitResult(identity: WorkflowProtectedIdentity, resultClass: string): Promise<DurableContractIdempotencyResult>;
    commitUnknown(identity: WorkflowProtectedIdentity): Promise<DurableContractIdempotencyResult>;
  }>;
  claims: Readonly<{
    acquire(identity: WorkflowProtectedIdentity, owner: WorkflowProtectedIdentity, expiresAt: string): Promise<DurableContractClaimResult>;
    renew(lease: DurableContractLease, expiresAt: string): Promise<DurableContractClaimResult>;
    release(lease: DurableContractLease): Promise<Readonly<{ status: "released" | "stale-fence" | "expired" | "unavailable" }>>;
  }>;
  reset(): Promise<"reset">;
  dispose(): Promise<"disposed" | "already-disposed">;
}>;

export type DurableWorkflowStoreContractAdapterFactory = Readonly<{
  factoryVersion: "1.0";
  createEnvironment(): Promise<DurableWorkflowStoreContractEnvironment>;
  createSharedEnvironments(count: number): Promise<readonly DurableWorkflowStoreContractEnvironment[]>;
}>;
