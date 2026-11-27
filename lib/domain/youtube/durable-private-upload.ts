import { createHash } from 'node:crypto'
import type { OperationState } from './private-upload-control'

export type ContractCheck = 'PASS' | 'FAIL' | 'NOT_VERIFIED' | 'BLOCKED'
export type ProviderKind = 'PRODUCTION' | 'TEST_ONLY'
/** Stable logical grant identity. OAuth token custody/refresh is a separate boundary. */
export interface DurableAuthorityBinding {
  authorityId: string; authorizationEpoch: number; channelId: string; channelProofId: string
}
export interface DurableUploadBinding {
  operationId: string; idempotencyKey: string; artifactId: string; revisionId: string
  mediaDigest: string; metadataDigest: string; certificationId: string; privacyStatus: 'private'
  authority: DurableAuthorityBinding
}
export interface DurableApprovalRecord {
  schemaVersion: 1; approvalId: string; version: number; binding: DurableUploadBinding
  lifecycle: 'ISSUED' | 'CONSUMED' | 'REVOKED'; certificationState: 'CERTIFIED'
  issuedAt: number; expiresAt: number
  approver: { subjectRef: string; authorizationEvidenceRef: string; approvalEvidenceRef: string; providerKind: ProviderKind }
}
export interface DurableOperationRecord {
  schemaVersion: 1; operationId: string; approvalId: string; binding: DurableUploadBinding
  version: number; state: OperationState; createdAt: number; updatedAt: number; attemptId?: string; videoId?: string
}
export interface DurableAttemptRecord {
  schemaVersion: 1; attemptId: string; binding: DurableUploadBinding; version: number
  phase: 'RESERVED' | 'REMOTE_STARTED' | 'UNKNOWN' | 'COMMITTED'
  initiatedAt: number; updatedAt: number; protectedSessionRef?: string; videoId?: string
}
export type RemoteOutcome = 'MATCHED' | 'NOT_FOUND' | 'UNKNOWN' | 'CONFLICT' | 'PROVIDER_TIMEOUT' | 'PROVIDER_FAILURE'
/** Returned only by a trusted server evidence provider, never accepted from HTTP. */
export interface DurableRemoteEvidence {
  schemaVersion: 1; evidenceId: string; binding: DurableUploadBinding; attemptId: string
  outcome: RemoteOutcome; providerKind: ProviderKind; source: 'RESUMABLE_SESSION_STATUS' | 'EXACT_VIDEO_ID_STATUS'
  sessionRef?: string; observedAt: number; evidenceRef: string
  remoteIdentityConfirmed?: boolean; videoId?: string; processingStatus?: 'processing' | 'succeeded' | 'failed'
  privacyStatus?: 'private' | 'public' | 'unlisted'
}
export interface ProductionChannelProof {
  schemaVersion: 1; proofId: string; expectedChannelId: string; observedChannelId: string
  authorityId: string; authorizationEpoch: number; observedAt: number; expiresAt: number
  invalidatedAt: number | null; providerKind: ProviderKind; source: 'CHANNELS_LIST_MINE'; evidenceRef: string
}
/** Integration must authenticate the human outside the request body, check approve
 * permission, present/review exact bytes/metadata/certification, and validate stored
 * channel proof. subjectRef/evidenceRef are server-produced capabilities, not claims.
 */
export interface ProductionTrustedApprovalProvider {
  readonly kind: 'PRODUCTION'
  attestReviewedOperation(binding: Readonly<DurableUploadBinding>, authenticatedSubjectRef: string): Promise<DurableApprovalRecord>
}
export interface ProductionChannelProofProvider {
  readonly kind: 'PRODUCTION'
  obtainProof(expectedChannelId: string, authorityId: string, authorizationEpoch: number): Promise<ProductionChannelProof>
}
export interface ProductionReconciliationProvider {
  readonly kind: 'PRODUCTION'
  // No upload/retry method. Decrypt session material only in separate protected custody.
  inspectRecordedAttempt(attempt: Readonly<DurableAttemptRecord>, proof: Readonly<ProductionChannelProof>): Promise<DurableRemoteEvidence>
}
export type RepositoryCode = 'APPLIED' | 'STALE_VERSION' | 'DUPLICATE_IDENTITY' | 'INVALID_RECORD' |
  'INVALID_TRANSITION' | 'APPROVAL_EXPIRED' | 'APPROVAL_REVOKED' | 'INVALID_EVIDENCE' | 'INVALID_SESSION' | 'REPOSITORY_FAILURE'
export interface RepositoryResult { code: RepositoryCode }
export interface BeginUploadCommand { operationId: string; approvalVersion: number; operationVersion: number; attemptId: string; now: number }
export interface RecoveryDecision {
  state: OperationState; canReserveOriginalOperation: boolean; replacementUploadAllowed: false
  reconciliationRequired: boolean; evidenceRequired: 'NONE' | 'TRUSTED_REMOTE_ATTEMPT' | 'EXACT_PRIVATE_STATUS'
}
/** Production adapter obligations:
 * - datastore transaction time, not HTTP time; atomic approval/op/attempt/index writes;
 * - globally unique approval, canonical operation/key, attempt, evidence and video IDs;
 * - CAS versions and immutable binding; conditional revocation/expiry at reservation;
 * - commit acknowledgement only after durable storage barriers;
 * - restart/competing-process tests and proven isolation; no bucket-by-bucket fallback.
 * markRemoteStarted grants one initiation decision. Lost acknowledgement is UNKNOWN,
 * never a new initiation permission. Lease expiry cannot authorize replacement upload.
 */
export interface DurablePrivateUploadRepository {
  readonly kind: 'PRODUCTION_SHARED' | 'TEST_ONLY_REFERENCE'
  readonly productionCapable: boolean
  issueVerifiedApproval(record: unknown, now: number): Promise<RepositoryResult>
  getApproval(id: string): Promise<DurableApprovalRecord | undefined>
  getOperation(id: string): Promise<DurableOperationRecord | undefined>
  getAttempt(id: string): Promise<DurableAttemptRecord | undefined>
  getEvidence(id: string): Promise<DurableRemoteEvidence | undefined>
  beginUpload(command: BeginUploadCommand): Promise<RepositoryResult>
  beginVerification(operationId: string, expectedVersion: number, now: number): Promise<RepositoryResult>
  revokeApproval(id: string, expectedVersion: number, now: number): Promise<RepositoryResult>
  markRemoteStarted(operationId: string, expectedVersion: number, attemptId: string, now: number): Promise<RepositoryResult>
  recordSession(operationId: string, expectedVersion: number, attemptId: string, protectedRef: string, validatedLocation: string, now: number): Promise<RepositoryResult>
  markCommitUnknown(operationId: string, expectedVersion: number, now: number): Promise<RepositoryResult>
  applyReconciliation(operationId: string, expectedVersion: number, evidence: unknown, now: number): Promise<RepositoryResult>
  verifyPrivate(operationId: string, expectedVersion: number, evidence: unknown, now: number): Promise<RepositoryResult>
  recoverOperation(operationId: string, now: number): Promise<RecoveryDecision>
}

export function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
export function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value)
}
export function timestamp(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(key => allowed.includes(key)) }
export function validDurableBinding(value: unknown): value is DurableUploadBinding {
  if (!plain(value) || !keys(value, ['operationId', 'idempotencyKey', 'artifactId', 'revisionId', 'mediaDigest', 'metadataDigest', 'certificationId', 'privacyStatus', 'authority'])) return false
  if (!['operationId', 'idempotencyKey', 'artifactId', 'revisionId', 'certificationId'].every(key => identifier(value[key])) || value.privacyStatus !== 'private') return false
  if (![value.mediaDigest, value.metadataDigest].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))) return false
  const a = value.authority
  return plain(a) && keys(a, ['authorityId', 'authorizationEpoch', 'channelId', 'channelProofId']) &&
    identifier(a.authorityId) && identifier(a.channelId) && identifier(a.channelProofId) && timestamp(a.authorizationEpoch) && a.authorizationEpoch > 0
}
export function validDurableApproval(value: unknown): value is DurableApprovalRecord {
  if (!plain(value) || !keys(value, ['schemaVersion', 'approvalId', 'version', 'binding', 'lifecycle', 'certificationState', 'issuedAt', 'expiresAt', 'approver'])) return false
  const p = value.approver
  return value.schemaVersion === 1 && identifier(value.approvalId) && timestamp(value.version) && validDurableBinding(value.binding) &&
    ['ISSUED', 'CONSUMED', 'REVOKED'].includes(value.lifecycle as string) && value.certificationState === 'CERTIFIED' &&
    timestamp(value.issuedAt) && timestamp(value.expiresAt) && value.expiresAt > value.issuedAt &&
    plain(p) && keys(p, ['subjectRef', 'authorizationEvidenceRef', 'approvalEvidenceRef', 'providerKind']) &&
    identifier(p.subjectRef) && identifier(p.authorizationEvidenceRef) && identifier(p.approvalEvidenceRef) && ['PRODUCTION', 'TEST_ONLY'].includes(p.providerKind as string)
}
export function validRemoteEvidence(value: unknown): value is DurableRemoteEvidence {
  return plain(value) && keys(value, ['schemaVersion', 'evidenceId', 'binding', 'attemptId', 'outcome', 'providerKind', 'source', 'sessionRef', 'observedAt', 'evidenceRef', 'remoteIdentityConfirmed', 'videoId', 'processingStatus', 'privacyStatus']) &&
    value.schemaVersion === 1 && identifier(value.evidenceId) && validDurableBinding(value.binding) && identifier(value.attemptId) &&
    ['MATCHED', 'NOT_FOUND', 'UNKNOWN', 'CONFLICT', 'PROVIDER_TIMEOUT', 'PROVIDER_FAILURE'].includes(value.outcome as string) &&
    ['PRODUCTION', 'TEST_ONLY'].includes(value.providerKind as string) && ['RESUMABLE_SESSION_STATUS', 'EXACT_VIDEO_ID_STATUS'].includes(value.source as string) &&
    timestamp(value.observedAt) && identifier(value.evidenceRef) && (value.sessionRef === undefined || identifier(value.sessionRef)) &&
    (value.remoteIdentityConfirmed === undefined || typeof value.remoteIdentityConfirmed === 'boolean') &&
    (value.videoId === undefined || identifier(value.videoId)) &&
    (value.processingStatus === undefined || ['processing', 'succeeded', 'failed'].includes(value.processingStatus as string)) &&
    (value.privacyStatus === undefined || ['private', 'public', 'unlisted'].includes(value.privacyStatus as string))
}
export function equalDurableBinding(a: DurableUploadBinding, b: DurableUploadBinding): boolean {
  return ['operationId', 'idempotencyKey', 'artifactId', 'revisionId', 'mediaDigest', 'metadataDigest', 'certificationId', 'privacyStatus'].every(key => a[key as keyof DurableUploadBinding] === b[key as keyof DurableUploadBinding]) &&
    a.authority.authorityId === b.authority.authorityId && a.authority.authorizationEpoch === b.authority.authorizationEpoch &&
    a.authority.channelId === b.authority.channelId && a.authority.channelProofId === b.authority.channelProofId
}
export function metadataIdentity(input: { title: string; description: string; mimeType: string; privacyStatus: 'private' }): string {
  try {
    if (!plain(input) || !keys(input, ['title', 'description', 'mimeType', 'privacyStatus']) || typeof input.title !== 'string' || !input.title.trim() || typeof input.description !== 'string' ||
        typeof input.mimeType !== 'string' || !/^video\/[A-Za-z0-9.+-]+$/.test(input.mimeType) || input.privacyStatus !== 'private') throw new Error()
    return createHash('sha256').update(JSON.stringify([input.title, input.description, input.mimeType, input.privacyStatus])).digest('hex')
  } catch { throw new Error('INVALID_PRIVATE_METADATA') }
}
export function trustedSessionLocation(value: unknown): boolean {
  try { if (typeof value !== 'string') return false; const u = new URL(value)
    return u.origin === 'https://www.googleapis.com' && u.pathname === '/upload/youtube/v3/videos' && !u.username && !u.password && !u.hash
  } catch { return false }
}
export function channelProofVerdict(value: unknown, expected: DurableAuthorityBinding, now: number, production: boolean): ContractCheck {
  try {
    if (!plain(value) || !keys(value, ['schemaVersion', 'proofId', 'expectedChannelId', 'observedChannelId', 'authorityId', 'authorizationEpoch', 'observedAt', 'expiresAt', 'invalidatedAt', 'providerKind', 'source', 'evidenceRef']) || value.schemaVersion !== 1 || !timestamp(now) || value.proofId !== expected.channelProofId ||
        value.expectedChannelId !== expected.channelId || value.observedChannelId !== expected.channelId ||
        value.authorityId !== expected.authorityId || value.authorizationEpoch !== expected.authorizationEpoch ||
        !timestamp(value.observedAt) || !timestamp(value.expiresAt) || value.observedAt > now || value.expiresAt <= now ||
        now - value.observedAt > 60_000 || value.invalidatedAt !== null || value.source !== 'CHANNELS_LIST_MINE' || !identifier(value.evidenceRef) ||
        !['PRODUCTION', 'TEST_ONLY'].includes(value.providerKind as string)) return 'FAIL'
    // Shape/freshness alone cannot establish production provenance. A production
    // ingestion/verifier is absent; even a PRODUCTION string is not sufficient.
    return production ? 'NOT_VERIFIED' : 'PASS'
  } catch { return 'FAIL' }
}
/** Capability declaration is not integration/provenance verification. No provider
 * implementation or external proof is provided by this gate. */
export function productionProviderVerdict(value: unknown): ContractCheck {
  try { if (value === undefined || value === null) return 'BLOCKED'
    return plain(value) && ['TEST_ONLY', 'PRODUCTION'].includes(value.kind as string) ? 'NOT_VERIFIED' : 'FAIL'
  } catch { return 'FAIL' }
}
export function absentProductionComponentChecks(): Record<string, ContractCheck> {
  return { sharedDurableBackend: 'BLOCKED', atomicConcurrencyGuarantee: 'BLOCKED', restartRecoveryGuarantee: 'BLOCKED',
    productionTrustedApprovalProvider: 'BLOCKED', productionChannelProof: 'BLOCKED', productionReconciliationProvider: 'BLOCKED',
    externalEligibilityVerification: 'BLOCKED', quotaVerification: 'BLOCKED' }
}
