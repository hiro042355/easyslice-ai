import type {
  ProductionWorkflowOperation,
  ProductionWorkflowStoreSchemaVersion,
  WorkflowExpectedRevision,
  WorkflowProtectedIdentity,
  WorkflowRecordRevision,
  WorkflowUtcTimestamp,
} from "./types";
import type { WorkflowTransactionContext } from "./transactionTypes";

export type WorkflowDeletionState = "active" | "deletion-pending" | "deleted";
export type WorkflowLegalHoldState = "not-held" | "held";

export type WorkflowStoreFailureStatus =
  | "not-found"
  | "expired"
  | "deleted"
  | "corrupted"
  | "unavailable";

export type WorkflowStoreMutationFailureStatus =
  | WorkflowStoreFailureStatus
  | "conflict"
  | "terminal";

export type WorkflowRecordMetadata = Readonly<{
  schemaVersion: ProductionWorkflowStoreSchemaVersion;
  recordVersion: "1.0";
  operation: ProductionWorkflowOperation;
  region: string;
  revision: WorkflowRecordRevision;
  createdAt: WorkflowUtcTimestamp;
  updatedAt: WorkflowUtcTimestamp;
}>;

export type WorkflowLifecycleMetadata = Readonly<{
  expiresAt?: WorkflowUtcTimestamp;
  deletionState: WorkflowDeletionState;
  legalHoldState: WorkflowLegalHoldState;
}>;

export type WorkflowStoreReadResult<T> =
  | Readonly<{ status: "found"; record: T }>
  | Readonly<{ status: WorkflowStoreFailureStatus }>;

export type WorkflowStoreCreateResult<T> =
  | Readonly<{ status: "created" | "found"; record: T }>
  | Readonly<{ status: WorkflowStoreMutationFailureStatus }>;

export type WorkflowStoreCasResult<T> =
  | Readonly<{ status: "updated"; record: T }>
  | Readonly<{ status: WorkflowStoreMutationFailureStatus }>;

export type WorkflowClaimKind =
  | "upload-poll"
  | "resume"
  | "generation-poll"
  | "reconciliation"
  | "cleanup"
  | "deletion";

export type WorkflowClaimRequest = Readonly<{
  claimVersion: "1.0";
  kind: WorkflowClaimKind;
  recordIdentity: WorkflowProtectedIdentity;
  ownerIdentity: WorkflowProtectedIdentity;
  expectedRevision: WorkflowExpectedRevision;
  attempt: number;
  heartbeatBaseline: WorkflowUtcTimestamp;
}>;

export type WorkflowLease = Readonly<{
  leaseVersion: "1.0";
  kind: WorkflowClaimKind;
  claimIdentity: WorkflowProtectedIdentity;
  recordIdentity: WorkflowProtectedIdentity;
  ownerIdentity: WorkflowProtectedIdentity;
  fencingRevision: WorkflowRecordRevision;
  leaseExpiresAt: WorkflowUtcTimestamp;
  attempt: number;
  providerSubmitPermitted: false;
}>;

export type WorkflowClaimResult =
  | Readonly<{ status: "acquired"; lease: WorkflowLease }>
  | Readonly<{ status: "already-claimed" | "conflict" | "terminal" | "unavailable" }>;

export type WorkflowLeaseRenewal = Readonly<{
  renewalVersion: "1.0";
  lease: WorkflowLease;
  nextExpiry: WorkflowUtcTimestamp;
}>;

export type WorkflowLeaseRenewalResult =
  | Readonly<{ status: "renewed"; lease: WorkflowLease }>
  | Readonly<{ status: "expired" | "stale-fence" | "terminal" | "unavailable" }>;

export type WorkflowLeaseRelease = Readonly<{
  releaseVersion: "1.0";
  lease: WorkflowLease;
  outcome: "completed-stage" | "safe-checkpoint" | "abandoned";
}>;

export type WorkflowLeaseReleaseResult =
  | Readonly<{ status: "released" }>
  | Readonly<{ status: "expired" | "stale-fence" | "terminal" | "unavailable" }>;

export type AcceptedPersistenceRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  acceptedKind: "provider-upload" | "generation-job";
  bindingId: string;
  restrictedInputReference: WorkflowProtectedIdentity;
  originalInputReference: WorkflowProtectedIdentity;
}>;

export type AcceptedPersistenceStore = Readonly<{
  storeVersion: "1.0";
  createIfAbsent(context: WorkflowTransactionContext, record: AcceptedPersistenceRecord): Promise<WorkflowStoreCreateResult<AcceptedPersistenceRecord>>;
  read(identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<AcceptedPersistenceRecord>>;
  compareAndSet(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision, record: AcceptedPersistenceRecord): Promise<WorkflowStoreCasResult<AcceptedPersistenceRecord>>;
  markExpired(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<AcceptedPersistenceRecord>>;
}>;

export type PollAssetIndexMapping = Readonly<{ itemIndex: number; assetIndex: number }>;
export type PollStateRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  state: "pending" | "ready" | "failed" | "cancelled" | "expired";
  protectedSessionHandle: WorkflowProtectedIdentity;
  assetMappings: readonly PollAssetIndexMapping[];
}>;

export type PollStateStore = Readonly<{
  storeVersion: "1.0";
  create(context: WorkflowTransactionContext, record: PollStateRecord): Promise<WorkflowStoreCreateResult<PollStateRecord>>;
  read(identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<PollStateRecord>>;
  claim(context: WorkflowTransactionContext, request: WorkflowClaimRequest): Promise<WorkflowClaimResult>;
  renew(context: WorkflowTransactionContext, renewal: WorkflowLeaseRenewal): Promise<WorkflowLeaseRenewalResult>;
  commitPollResult(context: WorkflowTransactionContext, lease: WorkflowLease, record: PollStateRecord): Promise<WorkflowStoreCasResult<PollStateRecord>>;
  markTerminal(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision, record: PollStateRecord): Promise<WorkflowStoreCasResult<PollStateRecord>>;
  release(context: WorkflowTransactionContext, release: WorkflowLeaseRelease): Promise<WorkflowLeaseReleaseResult>;
}>;

export type ResumeRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  state: "waiting-upload" | "materialization-reserved" | "submit-reserved" | "submit-unknown" | "job-accepted" | "terminal";
  bindingId: string;
  restrictedRequestReference: WorkflowProtectedIdentity;
  pollRevision: WorkflowRecordRevision;
}>;

export type ResumeRecordStore = Readonly<{
  storeVersion: "1.0";
  createIfAbsent(context: WorkflowTransactionContext, record: ResumeRecord): Promise<WorkflowStoreCreateResult<ResumeRecord>>;
  read(identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<ResumeRecord>>;
  claim(context: WorkflowTransactionContext, request: WorkflowClaimRequest): Promise<WorkflowClaimResult>;
  compareAndSet(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision, record: ResumeRecord): Promise<WorkflowStoreCasResult<ResumeRecord>>;
  markTerminal(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision, record: ResumeRecord): Promise<WorkflowStoreCasResult<ResumeRecord>>;
}>;

export type ResumeJournalRecord = Readonly<{
  journalVersion: "1.0";
  eventIdentity: WorkflowProtectedIdentity;
  resumeIdentity: WorkflowProtectedIdentity;
  operation: ProductionWorkflowOperation;
  attempt: number;
  stage: string;
  transition: string;
  outcomeClass: "success" | "pending" | "conflict" | "unknown" | "failure";
  safeReasonCode: string;
  recordedAt: WorkflowUtcTimestamp;
}>;

export type ResumeJournalStore = Readonly<{
  storeVersion: "1.0";
  append(context: WorkflowTransactionContext, record: ResumeJournalRecord): Promise<Readonly<{ status: "appended" | "duplicate" | "unavailable" }>>;
  readSafeHistory(identity: WorkflowProtectedIdentity): Promise<Readonly<{ status: "found"; records: readonly ResumeJournalRecord[] }> | Readonly<{ status: "not-found" | "unavailable" }>>;
}>;

export type WorkflowIdempotencyNamespace =
  | "materialization"
  | "generation-submit"
  | "generation-poll"
  | "output-ingestion"
  | "api";

export type WorkflowIdempotencyReservation<TResult> = Readonly<{
  namespace: WorkflowIdempotencyNamespace;
  identity: WorkflowProtectedIdentity;
  fingerprint: WorkflowProtectedIdentity;
  status: "reserved" | "unknown" | "terminal" | "conflict";
  result?: TResult;
  revision: WorkflowRecordRevision;
}>;

export type WorkflowIdempotencyReserveResult<TResult> =
  | Readonly<{ status: "reserved"; reservation: WorkflowIdempotencyReservation<TResult> }>
  | Readonly<{ status: "existing-same-fingerprint"; reservation: WorkflowIdempotencyReservation<TResult> }>
  | Readonly<{ status: "different-fingerprint" | "unavailable" }>;

export type WorkflowIdempotencyStore<TResult> = Readonly<{
  storeVersion: "1.0";
  reserve(context: WorkflowTransactionContext, namespace: WorkflowIdempotencyNamespace, identity: WorkflowProtectedIdentity, fingerprint: WorkflowProtectedIdentity): Promise<WorkflowIdempotencyReserveResult<TResult>>;
  lookup(namespace: WorkflowIdempotencyNamespace, identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<WorkflowIdempotencyReservation<TResult>>>;
  commitResult(context: WorkflowTransactionContext, reservation: WorkflowIdempotencyReservation<TResult>, result: TResult): Promise<WorkflowStoreCasResult<WorkflowIdempotencyReservation<TResult>>>;
  commitUnknown(context: WorkflowTransactionContext, reservation: WorkflowIdempotencyReservation<TResult>): Promise<WorkflowStoreCasResult<WorkflowIdempotencyReservation<TResult>>>;
  markConflict(context: WorkflowTransactionContext, reservation: WorkflowIdempotencyReservation<TResult>): Promise<WorkflowStoreCasResult<WorkflowIdempotencyReservation<TResult>>>;
  expire(context: WorkflowTransactionContext, reservation: WorkflowIdempotencyReservation<TResult>): Promise<WorkflowStoreCasResult<WorkflowIdempotencyReservation<TResult>>>;
}>;

export type WorkflowSafeResult = Readonly<{
  resultVersion: "1.0";
  status: "completed" | "degraded" | "partial" | "failed" | "cancelled";
  operation: ProductionWorkflowOperation;
  safeReasonCodes: readonly string[];
}>;

export type MaterializationIdempotencyStore = WorkflowIdempotencyStore<Readonly<{ status: "materialized" | "reconciliation-required" }>>;
export type GenerationIdempotencyStore = WorkflowIdempotencyStore<Readonly<{ status: "accepted" | "unknown" | "terminal" }>>;
export type GenerationPollIdempotencyStore = WorkflowIdempotencyStore<Readonly<{ status: "pending" | "terminal" | "unknown" }>>;
export type OutputIngestionIdempotencyStore = WorkflowIdempotencyStore<Readonly<{ status: "ingested" | "partial" | "reconciliation-required" }>>;
export type ApiIdempotencyStore = WorkflowIdempotencyStore<WorkflowSafeResult>;

export type GenerationJobRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  providerJobReference: WorkflowProtectedIdentity;
  providerBindingVersion: string;
  status: "pending" | "completed" | "failed" | "cancelled" | "expired" | "unknown" | "reconciliation-required";
  nextPollEligibleAt?: WorkflowUtcTimestamp;
  cancellationState: "active" | "requested" | "confirmed";
  providerSubmitMayRun: false;
  terminalResult?: WorkflowSafeResult;
}>;

export type GenerationJobStore = Readonly<{
  storeVersion: "1.0";
  createIfAbsent(context: WorkflowTransactionContext, record: GenerationJobRecord): Promise<WorkflowStoreCreateResult<GenerationJobRecord>>;
  read(identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<GenerationJobRecord>>;
  claimForPoll(context: WorkflowTransactionContext, request: WorkflowClaimRequest): Promise<WorkflowClaimResult>;
  renewClaim(context: WorkflowTransactionContext, renewal: WorkflowLeaseRenewal): Promise<WorkflowLeaseRenewalResult>;
  commitPending(context: WorkflowTransactionContext, lease: WorkflowLease, record: GenerationJobRecord): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
  commitCompleted(context: WorkflowTransactionContext, lease: WorkflowLease, record: GenerationJobRecord): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
  commitFailed(context: WorkflowTransactionContext, lease: WorkflowLease, record: GenerationJobRecord): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
  commitUnknown(context: WorkflowTransactionContext, lease: WorkflowLease, record: GenerationJobRecord): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
  commitReconciliationRequired(context: WorkflowTransactionContext, lease: WorkflowLease, record: GenerationJobRecord): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
  cancel(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
  expire(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<GenerationJobRecord>>;
}>;

export type FinalResultRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  result: WorkflowSafeResult;
  formalAssetReferences: readonly WorkflowProtectedIdentity[];
}>;

export type FinalResultStore = Readonly<{
  storeVersion: "1.0";
  commitIfAbsent(context: WorkflowTransactionContext, record: FinalResultRecord): Promise<WorkflowStoreCreateResult<FinalResultRecord>>;
  read(identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<FinalResultRecord>>;
  compareAndSet(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision, record: FinalResultRecord): Promise<WorkflowStoreCasResult<FinalResultRecord>>;
}>;

export type ResultReferenceRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  publicTokenIndex: WorkflowProtectedIdentity;
  internalResultIdentity: WorkflowProtectedIdentity;
  kind: "upload-pending" | "generation-job" | "workflow-result";
  ownerIdentity: WorkflowProtectedIdentity;
  tenantIdentity: WorkflowProtectedIdentity;
  state: "active" | "revoked" | "expired" | "deleted";
}>;

export type ResultReferenceVault = Readonly<{
  storeVersion: "1.0";
  issueIfAbsent(context: WorkflowTransactionContext, record: ResultReferenceRecord): Promise<WorkflowStoreCreateResult<ResultReferenceRecord>>;
  resolve(publicTokenIndex: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<ResultReferenceRecord>>;
  revoke(context: WorkflowTransactionContext, publicTokenIndex: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<ResultReferenceRecord>>;
  expire(context: WorkflowTransactionContext, publicTokenIndex: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<ResultReferenceRecord>>;
  delete(context: WorkflowTransactionContext, publicTokenIndex: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<ResultReferenceRecord>>;
}>;

export type EncryptedRestrictedPayload = Readonly<{
  encryptionVersion: "1.0";
  ciphertextHandle: WorkflowProtectedIdentity;
  keyVersion: string;
  payloadSchemaVersion: string;
}>;

export type RestrictedInputRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  adapterId: string;
  adapterVersion: string;
  encryptedPayload: EncryptedRestrictedPayload;
  safeFingerprint: WorkflowProtectedIdentity;
}>;

export type RestrictedInputStore = Readonly<{
  storeVersion: "1.0";
  storeEncrypted(context: WorkflowTransactionContext, record: RestrictedInputRecord): Promise<WorkflowStoreCreateResult<RestrictedInputRecord>>;
  resolveForAuthorizedUse(identity: WorkflowProtectedIdentity, authorizationUse: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<EncryptedRestrictedPayload>>;
  revoke(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<RestrictedInputRecord>>;
  delete(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<RestrictedInputRecord>>;
  expire(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<RestrictedInputRecord>>;
}>;

export type OriginalInputRecord = Readonly<{
  metadata: WorkflowRecordMetadata;
  lifecycle: WorkflowLifecycleMetadata;
  identity: WorkflowProtectedIdentity;
  restrictedInputReference: WorkflowProtectedIdentity;
  inputSchemaVersion: string;
}>;

export type OriginalInputStore = Readonly<{
  storeVersion: "1.0";
  createIfAbsent(context: WorkflowTransactionContext, record: OriginalInputRecord): Promise<WorkflowStoreCreateResult<OriginalInputRecord>>;
  read(identity: WorkflowProtectedIdentity): Promise<WorkflowStoreReadResult<OriginalInputRecord>>;
  delete(context: WorkflowTransactionContext, identity: WorkflowProtectedIdentity, expected: WorkflowExpectedRevision): Promise<WorkflowStoreCasResult<OriginalInputRecord>>;
}>;

export type SafeAuditEvent = Readonly<{
  auditVersion: "1.0";
  eventIdentity: WorkflowProtectedIdentity;
  operation: ProductionWorkflowOperation;
  stage: string;
  statusClass: string;
  safeReasonCode: string;
  recordedAt: WorkflowUtcTimestamp;
}>;

export type AuditStore = Readonly<{
  storeVersion: "1.0";
  append(context: WorkflowTransactionContext, event: SafeAuditEvent): Promise<Readonly<{ status: "appended" | "duplicate" | "unavailable" }>>;
}>;

export type SafeOutboxPayload = Readonly<Record<string, string | number | boolean | null>>;
export type OutboxRecord = Readonly<{
  outboxVersion: "1.0";
  eventIdentity: WorkflowProtectedIdentity;
  aggregateIdentity: WorkflowProtectedIdentity;
  eventType: string;
  payloadVersion: "1.0";
  payload: SafeOutboxPayload;
  deliveryState: "pending" | "claimed" | "delivered" | "reconciliation-required";
  attempt: number;
  nextEligibleAt: WorkflowUtcTimestamp;
}>;

export type OutboxStore = Readonly<{
  storeVersion: "1.0";
  append(context: WorkflowTransactionContext, record: OutboxRecord): Promise<Readonly<{ status: "appended" | "duplicate" | "unavailable" }>>;
  claimBatch(context: WorkflowTransactionContext, request: WorkflowClaimRequest): Promise<Readonly<{ status: "claimed"; records: readonly OutboxRecord[]; lease: WorkflowLease }> | Readonly<{ status: "empty" | "conflict" | "unavailable" }>>;
  markDelivered(context: WorkflowTransactionContext, lease: WorkflowLease, eventIdentity: WorkflowProtectedIdentity): Promise<Readonly<{ status: "delivered" | "duplicate" | "stale-fence" | "unavailable" }>>;
}>;

export type ProductionAuthSessionStore = Readonly<{
  storeVersion: "1.0";
  resolve(sessionIdentity: WorkflowProtectedIdentity): Promise<Readonly<{ status: "active"; principalIdentity: WorkflowProtectedIdentity; expiresAt: WorkflowUtcTimestamp }> | Readonly<{ status: "expired" | "revoked" | "not-found" | "unavailable" }>>;
}>;

export type ProductionCsrfStore = Readonly<{
  storeVersion: "1.0";
  validate(sessionIdentity: WorkflowProtectedIdentity, tokenDigest: WorkflowProtectedIdentity): Promise<Readonly<{ status: "valid" }> | Readonly<{ status: "invalid" | "expired" | "revoked" | "unavailable" }>>;
}>;

export type ProductionWorkflowStoreBundle = Readonly<{
  bundleVersion: "1.0";
  acceptedPersistence: AcceptedPersistenceStore;
  pollState: PollStateStore;
  resumeRecord: ResumeRecordStore;
  resumeJournal: ResumeJournalStore;
  materializationIdempotency: MaterializationIdempotencyStore;
  generationIdempotency: GenerationIdempotencyStore;
  generationJobs: GenerationJobStore;
  generationPollIdempotency: GenerationPollIdempotencyStore;
  outputIngestionIdempotency: OutputIngestionIdempotencyStore;
  finalResults: FinalResultStore;
  apiIdempotency: ApiIdempotencyStore;
  resultReferences: ResultReferenceVault;
  restrictedInputs: RestrictedInputStore;
  originalInputs: OriginalInputStore;
  authSessions: ProductionAuthSessionStore;
  csrf: ProductionCsrfStore;
  audit: AuditStore;
  outbox: OutboxStore;
}>;
