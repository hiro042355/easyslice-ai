import type { DurableWorkflowDatabaseCapability, DurableWorkflowTransactionContext } from "../durableTransaction";

export type PostgreSQLProtectedDigest = Readonly<{ algorithm: "sha256"; version: 1; bytes: Uint8Array }>;
export type PostgreSQLProtectedDigestFactory = Readonly<{ factoryVersion: "1.0"; create(value: Uint8Array): PostgreSQLProtectedDigest | undefined }>;
export type PostgreSQLInternalUuidGenerator = Readonly<{ generatorVersion: "1.0"; generate(): string }>;
export type PostgreSQLSliceAReadSession = Readonly<{ sessionVersion: "1.0"; database: DurableWorkflowDatabaseCapability }>;

export type PostgreSQLSliceAStatement = Readonly<{ statementId: string; sql: string; parameterCount: number; cardinality: "none" | "single" | "many"; accessMode: "read" | "write" }>;
export type PostgreSQLSliceAStatementCatalog = Readonly<{ catalogVersion: "1.0"; statements: readonly PostgreSQLSliceAStatement[] }>;
export type PostgreSQLSliceAStatementCatalogRegistrar = Readonly<{ register(catalog: PostgreSQLSliceAStatementCatalog): "registered" | "already-registered" | "rejected" }>;

export type SliceAOperation = "generate-vocal" | "generate-music" | "generate-mv";
export type SliceAResultStatus = "completed" | "degraded" | "partial" | "failed" | "cancelled";
export type SliceADeletionState = "active" | "deletion-pending" | "deleted";
export type SliceALegalHoldState = "none" | "held";

export type PostgreSQLFinalResultRecord = Readonly<{
  internalId: string;
  resultIdentity: PostgreSQLProtectedDigest;
  tenantIdentity: PostgreSQLProtectedDigest;
  region: string;
  operation: SliceAOperation;
  status: SliceAResultStatus;
  revision: string;
  terminalPayload: Readonly<Record<string, unknown>>;
  expiresAt: string;
  retentionClass: string;
  deletionState: SliceADeletionState;
  legalHoldState: SliceALegalHoldState;
}>;

export type PostgreSQLFinalResultDraft = Omit<PostgreSQLFinalResultRecord, "internalId">;
export type PostgreSQLFinalResultMutationResult =
  | Readonly<{ status: "created" | "found" | "updated"; record: PostgreSQLFinalResultRecord }>
  | Readonly<{ status: "conflict" | "not-found" | "terminal" | "corrupted" | "unavailable" }>;
export type PostgreSQLFinalResultReadResult = Readonly<{ status: "found"; record: PostgreSQLFinalResultRecord }> | Readonly<{ status: "not-found" | "corrupted" | "unavailable" }>;

export type PostgreSQLResultReferenceRecord = Readonly<{
  internalId: string;
  tokenIdentity: PostgreSQLProtectedDigest;
  resultId: string;
  kind: "upload-pending" | "generation-job" | "workflow-result";
  operation: SliceAOperation;
  ownerIdentity: PostgreSQLProtectedDigest;
  tenantIdentity: PostgreSQLProtectedDigest;
  region: string;
  state: "active" | "revoked" | "expired" | "deleted";
  revision: string;
  expiresAt: string;
  deletionState: SliceADeletionState;
  legalHoldState: SliceALegalHoldState;
}>;
export type PostgreSQLResultReferenceDraft = Omit<PostgreSQLResultReferenceRecord, "internalId" | "resultId">;
export type PostgreSQLResultReferenceResult = Readonly<{ status: "created" | "found"; record: PostgreSQLResultReferenceRecord }> | Readonly<{ status: "conflict" | "not-found" | "corrupted" | "unavailable" }>;

export type PostgreSQLOutboxRecord = Readonly<{
  internalId: string;
  eventIdentity: PostgreSQLProtectedDigest;
  aggregateIdentity: PostgreSQLProtectedDigest;
  resultId: string;
  eventType: string;
  safePayload: Readonly<Record<string, string | number | boolean | null>>;
  deliveryState: "pending" | "claimed" | "delivered" | "reconciliation-required";
  attempt: number;
  nextEligibleAt: string;
  claimOwnerIdentity?: PostgreSQLProtectedDigest;
  fencingRevision?: string;
  leaseExpiresAt?: string;
  deliveredAt?: string;
  safeFailureClass?: string;
  revision: string;
}>;
export type PostgreSQLOutboxDraft = Omit<PostgreSQLOutboxRecord, "internalId" | "resultId" | "deliveryState" | "attempt" | "revision">;
export type PostgreSQLOutboxAppendResult = Readonly<{ status: "appended" | "duplicate"; record: PostgreSQLOutboxRecord }> | Readonly<{ status: "conflict" | "unavailable" }>;
export type PostgreSQLOutboxClaimRequest = Readonly<{ ownerIdentity: PostgreSQLProtectedDigest; now: string; leaseExpiresAt: string; limit: number }>;
export type PostgreSQLOutboxClaimResult = Readonly<{ status: "claimed"; records: readonly PostgreSQLOutboxRecord[] }> | Readonly<{ status: "empty" | "conflict" | "unavailable" }>;
export type PostgreSQLOutboxDeliveryResult = Readonly<{ status: "delivered" | "duplicate" | "stale-fence" | "unavailable" }>;
export type PostgreSQLOutboxLeaseResult = Readonly<{ status: "renewed"; record: PostgreSQLOutboxRecord }> | Readonly<{ status: "stale-fence" | "expired" | "unavailable" }>;

export type PostgreSQLFinalResultStoreV2 = Readonly<{
  storeVersion: "2.0";
  commitIfAbsent(context: DurableWorkflowTransactionContext, draft: PostgreSQLFinalResultDraft): Promise<PostgreSQLFinalResultMutationResult>;
  read(session: PostgreSQLSliceAReadSession, identity: PostgreSQLProtectedDigest): Promise<PostgreSQLFinalResultReadResult>;
  readInTransaction(context: DurableWorkflowTransactionContext, identity: PostgreSQLProtectedDigest): Promise<PostgreSQLFinalResultReadResult>;
  compareAndSet(context: DurableWorkflowTransactionContext, identity: PostgreSQLProtectedDigest, expectedRevision: string, lifecycle: Readonly<{ deletionState: SliceADeletionState; legalHoldState: SliceALegalHoldState }>): Promise<PostgreSQLFinalResultMutationResult>;
}>;

export type PostgreSQLResultReferenceVaultV2 = Readonly<{
  storeVersion: "2.0";
  issueIfAbsent(context: DurableWorkflowTransactionContext, resultId: string, draft: PostgreSQLResultReferenceDraft): Promise<PostgreSQLResultReferenceResult>;
  resolve(session: PostgreSQLSliceAReadSession, token: PostgreSQLProtectedDigest): Promise<PostgreSQLResultReferenceResult>;
  resolveInTransaction(context: DurableWorkflowTransactionContext, token: PostgreSQLProtectedDigest): Promise<PostgreSQLResultReferenceResult>;
  compareAndSet(context: DurableWorkflowTransactionContext, token: PostgreSQLProtectedDigest, expectedRevision: string, state: PostgreSQLResultReferenceRecord["state"], deletionState: SliceADeletionState): Promise<PostgreSQLResultReferenceResult>;
  revoke(context: DurableWorkflowTransactionContext, token: PostgreSQLProtectedDigest, expectedRevision: string): Promise<PostgreSQLResultReferenceResult>;
  expire(context: DurableWorkflowTransactionContext, token: PostgreSQLProtectedDigest, expectedRevision: string): Promise<PostgreSQLResultReferenceResult>;
  delete(context: DurableWorkflowTransactionContext, token: PostgreSQLProtectedDigest, expectedRevision: string): Promise<PostgreSQLResultReferenceResult>;
}>;

export type PostgreSQLOutboxStoreV2 = Readonly<{
  storeVersion: "2.0";
  append(context: DurableWorkflowTransactionContext, resultId: string, draft: PostgreSQLOutboxDraft): Promise<PostgreSQLOutboxAppendResult>;
  claimBatch(context: DurableWorkflowTransactionContext, request: PostgreSQLOutboxClaimRequest): Promise<PostgreSQLOutboxClaimResult>;
  renew(context: DurableWorkflowTransactionContext, event: PostgreSQLProtectedDigest, expectedFence: string, owner: PostgreSQLProtectedDigest, now: string, nextExpiry: string): Promise<PostgreSQLOutboxLeaseResult>;
  release(context: DurableWorkflowTransactionContext, event: PostgreSQLProtectedDigest, expectedFence: string, owner: PostgreSQLProtectedDigest, nextEligibleAt: string): Promise<PostgreSQLOutboxDeliveryResult>;
  markReconciliationRequired(context: DurableWorkflowTransactionContext, event: PostgreSQLProtectedDigest, expectedRevision: string, failureClass: string): Promise<PostgreSQLOutboxDeliveryResult>;
  markDelivered(context: DurableWorkflowTransactionContext, event: PostgreSQLProtectedDigest, expectedFence: string, deliveredAt: string): Promise<PostgreSQLOutboxDeliveryResult>;
}>;

export type PostgreSQLSliceAAtomicGroup = Readonly<{ finalResult: PostgreSQLFinalResultDraft; reference: PostgreSQLResultReferenceDraft; outbox: PostgreSQLOutboxDraft }>;
export type PostgreSQLSliceAAtomicCommitResult = Readonly<{ status: "committed" | "replayed"; resultId: string }> | Readonly<{ status: "conflict" | "corrupted" | "unavailable" }>;
export type PostgreSQLSliceAUnknownLookupResult = Readonly<{ status: "committed" | "not-committed" | "corrupted" | "unavailable" | "still-unknown" }>;
