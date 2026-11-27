import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { UploadSessionState } from './resumable-upload'

/**
 * B4 upload receipt.
 *
 * A receipt records *how far* an upload actually got, stage by stage. The stages are
 * deliberately not collapsed into one boolean: "request accepted" and "video id
 * obtained with private visibility confirmed" are different facts, and a receipt
 * that cannot tell them apart is not evidence.
 *
 * Integrity is a digest over a canonical projection of the receipt. That proves the
 * receipt was not altered after creation; it does not prove who created it. Provenance
 * requires a signer, so `ReceiptSigner` is a separate interface with a clearly
 * synthetic implementation for local tests. No claim is made that the synthetic key
 * is a production trust anchor.
 */

export type ReceiptStage =
  | 'REQUEST_ACCEPTED' | 'SESSION_INITIALIZED' | 'BYTES_TRANSFERRED'
  | 'PROVIDER_COMPLETED' | 'VIDEO_IDENTIFIED' | 'VISIBILITY_CONFIRMED' | 'RESULT_RECONCILED'

export const RECEIPT_STAGES: readonly ReceiptStage[] = Object.freeze([
  'REQUEST_ACCEPTED', 'SESSION_INITIALIZED', 'BYTES_TRANSFERRED',
  'PROVIDER_COMPLETED', 'VIDEO_IDENTIFIED', 'VISIBILITY_CONFIRMED', 'RESULT_RECONCILED',
])

export type ReceiptVerification = 'VERIFIED' | 'NOT_VERIFIED' | 'FAILED'
export type ReceiptVisibility = 'private' | 'public' | 'unlisted' | 'UNVERIFIED'

export interface UploadReceipt {
  readonly schemaVersion: 1
  readonly receiptId: string
  readonly tenantId: string
  readonly authorityId: string
  readonly actorRef: string
  readonly googleAccountId: string
  readonly operationId: string
  readonly attemptId: string
  readonly assetId: string
  readonly mediaDigest: string
  readonly metadataDigest: string
  readonly approvalId: string
  readonly provider: 'YOUTUBE'
  readonly videoId?: string
  readonly visibility: ReceiptVisibility
  readonly uploadState: UploadSessionState
  readonly stages: readonly ReceiptStage[]
  readonly confirmedOffset: number
  readonly totalBytes: number
  readonly providerEvidenceRef?: string
  readonly verification: ReceiptVerification
  readonly completionTimestampMs?: number
  readonly createdAtMs: number
  readonly integrityDigest: string
}

const ID = /^[A-Za-z0-9_.:-]{1,256}$/
const HEX64 = /^[a-f0-9]{64}$/
const isId = (value: unknown): value is string =>
  typeof value === 'string' && ID.test(value) && !['__proto__', '__proto__', 'constructor', 'prototype'].includes(value)
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Canonical projection: every field that the digest covers, in fixed order. */
export function receiptDigestInput(receipt: Omit<UploadReceipt, 'integrityDigest'>): string {
  return JSON.stringify([
    receipt.schemaVersion, receipt.receiptId, receipt.tenantId, receipt.authorityId, receipt.actorRef,
    receipt.googleAccountId, receipt.operationId, receipt.attemptId, receipt.assetId,
    receipt.mediaDigest, receipt.metadataDigest, receipt.approvalId, receipt.provider,
    receipt.videoId ?? null, receipt.visibility, receipt.uploadState,
    [...receipt.stages].sort(), receipt.confirmedOffset, receipt.totalBytes,
    receipt.providerEvidenceRef ?? null, receipt.verification, receipt.completionTimestampMs ?? null,
    receipt.createdAtMs,
  ])
}

export function receiptIntegrityDigest(receipt: Omit<UploadReceipt, 'integrityDigest'>): string {
  return createHash('sha256').update(receiptDigestInput(receipt)).digest('hex')
}

export function buildUploadReceipt(input: Omit<UploadReceipt, 'schemaVersion' | 'integrityDigest'>): UploadReceipt {
  const base: Omit<UploadReceipt, 'integrityDigest'> = { schemaVersion: 1, ...input, stages: Object.freeze([...input.stages]) }
  return { ...base, integrityDigest: receiptIntegrityDigest(base) }
}

export type ReceiptFailureCode =
  | 'RECEIPT_MALFORMED' | 'RECEIPT_TAMPERED' | 'WRONG_ASSET' | 'WRONG_DIGEST' | 'WRONG_ACCOUNT'
  | 'WRONG_OPERATION' | 'WRONG_APPROVAL' | 'WRONG_TENANT' | 'WRONG_ATTEMPT'
  | 'MISSING_PROVIDER_EVIDENCE' | 'INVALID_VISIBILITY' | 'INCONSISTENT_UPLOAD_STATE'
  | 'MISSING_REQUIRED_STAGE' | 'DUPLICATE_RECEIPT'

export interface ReceiptFailure { readonly code: ReceiptFailureCode; readonly field: string }
export interface ReceiptExpectation {
  readonly tenantId: string
  readonly authorityId: string
  readonly googleAccountId: string
  readonly operationId: string
  readonly attemptId: string
  readonly assetId: string
  readonly mediaDigest: string
  readonly metadataDigest: string
  readonly approvalId: string
  readonly totalBytes: number
}

export function verifyUploadReceipt(receipt: UploadReceipt, expected: ReceiptExpectation): { readonly ok: boolean; readonly failures: readonly ReceiptFailure[] } {
  const failures: ReceiptFailure[] = []
  const fail = (code: ReceiptFailureCode, field: string) => failures.push({ code, field })
  if (!receipt || typeof receipt !== 'object' || receipt.schemaVersion !== 1 || !isId(receipt.receiptId)) {
    return { ok: false, failures: [{ code: 'RECEIPT_MALFORMED', field: 'receipt' }] }
  }
  const { integrityDigest, ...rest } = receipt
  if (typeof integrityDigest !== 'string' || !HEX64.test(integrityDigest) || receiptIntegrityDigest(rest) !== integrityDigest) {
    fail('RECEIPT_TAMPERED', 'integrityDigest')
  }
  if (receipt.tenantId !== expected.tenantId) fail('WRONG_TENANT', 'tenantId')
  if (receipt.authorityId !== expected.authorityId) fail('WRONG_TENANT', 'authorityId')
  if (receipt.googleAccountId !== expected.googleAccountId) fail('WRONG_ACCOUNT', 'googleAccountId')
  if (receipt.operationId !== expected.operationId) fail('WRONG_OPERATION', 'operationId')
  if (receipt.attemptId !== expected.attemptId) fail('WRONG_ATTEMPT', 'attemptId')
  if (receipt.assetId !== expected.assetId) fail('WRONG_ASSET', 'assetId')
  if (receipt.mediaDigest !== expected.mediaDigest) fail('WRONG_DIGEST', 'mediaDigest')
  if (receipt.metadataDigest !== expected.metadataDigest) fail('WRONG_DIGEST', 'metadataDigest')
  if (receipt.approvalId !== expected.approvalId) fail('WRONG_APPROVAL', 'approvalId')
  if (receipt.totalBytes !== expected.totalBytes) fail('WRONG_DIGEST', 'totalBytes')
  if (!isInt(receipt.confirmedOffset) || !isInt(receipt.totalBytes) || receipt.confirmedOffset > receipt.totalBytes) {
    fail('INCONSISTENT_UPLOAD_STATE', 'confirmedOffset')
  }
  if (!Array.isArray(receipt.stages) || receipt.stages.some(stage => !RECEIPT_STAGES.includes(stage))) {
    fail('RECEIPT_MALFORMED', 'stages')
  }
  const stages = new Set(receipt.stages)
  const claimsCompletion = receipt.uploadState === 'COMPLETED' || receipt.verification === 'VERIFIED'
  if (claimsCompletion) {
    for (const stage of ['PROVIDER_COMPLETED', 'VIDEO_IDENTIFIED', 'VISIBILITY_CONFIRMED'] as const) {
      if (!stages.has(stage)) fail('MISSING_REQUIRED_STAGE', stage)
    }
    if (receipt.confirmedOffset !== receipt.totalBytes) fail('INCONSISTENT_UPLOAD_STATE', 'confirmedOffset')
  }
  if (receipt.uploadState === 'COMPLETED' && !receipt.videoId) fail('INCONSISTENT_UPLOAD_STATE', 'videoId')
  if (receipt.uploadState === 'COMPLETED' && !receipt.providerEvidenceRef) fail('MISSING_PROVIDER_EVIDENCE', 'providerEvidenceRef')
  if (receipt.visibility !== 'UNVERIFIED' && !['private', 'public', 'unlisted'].includes(receipt.visibility)) fail('INVALID_VISIBILITY', 'visibility')
  if (receipt.verification === 'VERIFIED' && receipt.visibility !== 'private') fail('INVALID_VISIBILITY', 'visibility')
  if (!['YOUTUBE'].includes(receipt.provider)) fail('RECEIPT_MALFORMED', 'provider')
  if (!isInt(receipt.createdAtMs)) fail('RECEIPT_MALFORMED', 'createdAtMs')
  return { ok: failures.length === 0, failures }
}

/**
 * Signer boundary. A production signer is a separate trust decision (key custody,
 * rotation, revocation), so only this interface is implemented here.
 */
export interface ReceiptSignature { readonly keyId: string; readonly algorithm: 'HMAC-SHA256'; readonly signature: string }
export interface ReceiptSigner {
  readonly kind: 'SYNTHETIC_TEST_ONLY' | 'PRODUCTION'
  sign(receipt: UploadReceipt): Promise<ReceiptSignature>
  verify(receipt: UploadReceipt, signature: ReceiptSignature): Promise<boolean>
}

/**
 * Local deterministic signer. It proves the signing/verification wiring works.
 * It is NOT a production key and proves nothing about production key custody.
 */
export class SyntheticTestReceiptSigner implements ReceiptSigner {
  readonly kind = 'SYNTHETIC_TEST_ONLY' as const
  constructor(private readonly key: string = 'synthetic-test-receipt-key', private readonly keyId: string = 'synthetic-key-1') {
    if (!key) throw new Error('SYNTHETIC_KEY_REQUIRED')
  }
  async sign(receipt: UploadReceipt): Promise<ReceiptSignature> {
    const signature = createHmac('sha256', this.key).update(receipt.integrityDigest).digest('hex')
    return { keyId: this.keyId, algorithm: 'HMAC-SHA256', signature }
  }
  async verify(receipt: UploadReceipt, signature: ReceiptSignature): Promise<boolean> {
    if (!signature || signature.keyId !== this.keyId || signature.algorithm !== 'HMAC-SHA256' || !/^[a-f0-9]{64}$/.test(signature.signature)) return false
    const expected = createHmac('sha256', this.key).update(receipt.integrityDigest).digest()
    const actual = Buffer.from(signature.signature, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

/**
 * A receipt whose persisted signature has been verified by the signer (Y3.0 trust boundary).
 *
 * `UploadReceipt` is a value read from storage; it may be digest-intact while its signature column was
 * forged, because the store holds no key. Only this branded type may cross a trust boundary (recovery,
 * reconciliation, an API response that claims "committed"). The brand cannot be forged structurally:
 * `verifyReceiptSignature` is the only constructor.
 */
declare const verifiedReceiptBrand: unique symbol
export type VerifiedReceipt = UploadReceipt & { readonly [verifiedReceiptBrand]: true }

export async function verifyReceiptSignature(
  receipt: UploadReceipt | undefined,
  signature: ReceiptSignature | undefined,
  signer: ReceiptSigner | undefined,
): Promise<VerifiedReceipt | undefined> {
  if (!receipt || !signature || !signer) return undefined
  if (!/^[a-f0-9]{64}$/.test(signature.signature ?? '')) return undefined
  try {
    const ok = await signer.verify(receipt, signature)
    return ok ? (receipt as VerifiedReceipt) : undefined
  } catch {
    return undefined
  }
}

export interface ReceiptStore {
  put(receipt: UploadReceipt): Promise<'APPLIED' | 'DUPLICATE_RECEIPT' | 'CONFLICT'>
  get(receiptId: string): Promise<UploadReceipt | undefined>
  getForAttempt(attemptId: string): Promise<UploadReceipt | undefined>
}

/** In-memory store: sufficient for local integration tests; the PG store is B3/B4 follow-up. */
export class InMemoryReceiptStore implements ReceiptStore {
  private readonly byId = new Map<string, UploadReceipt>()
  private readonly byAttempt = new Map<string, string>()
  async put(receipt: UploadReceipt): Promise<'APPLIED' | 'DUPLICATE_RECEIPT' | 'CONFLICT'> {
    const existing = this.byId.get(receipt.receiptId)
    if (existing) return existing.integrityDigest === receipt.integrityDigest ? 'DUPLICATE_RECEIPT' : 'CONFLICT'
    const attemptReceipt = this.byAttempt.get(receipt.attemptId)
    if (attemptReceipt && attemptReceipt !== receipt.receiptId) return 'CONFLICT'
    this.byId.set(receipt.receiptId, receipt)
    this.byAttempt.set(receipt.attemptId, receipt.receiptId)
    return 'APPLIED'
  }
  async get(receiptId: string) { return this.byId.get(receiptId) }
  async getForAttempt(attemptId: string) {
    const id = this.byAttempt.get(attemptId)
    return id ? this.byId.get(id) : undefined
  }
}

/** Stages implied by an observed transport outcome. Never optimistic. */
export function stagesForOutcome(input: {
  readonly sessionInitialized: boolean
  readonly confirmedOffset: number
  readonly totalBytes: number
  readonly completed: boolean
  readonly videoId?: string
  readonly visibilityVerified: boolean
  readonly reconciled: boolean
}): ReceiptStage[] {
  const stages: ReceiptStage[] = ['REQUEST_ACCEPTED']
  if (input.sessionInitialized) stages.push('SESSION_INITIALIZED')
  if (input.confirmedOffset > 0) stages.push('BYTES_TRANSFERRED')
  if (input.completed) stages.push('PROVIDER_COMPLETED')
  if (input.videoId) stages.push('VIDEO_IDENTIFIED')
  if (input.visibilityVerified) stages.push('VISIBILITY_CONFIRMED')
  if (input.reconciled) stages.push('RESULT_RECONCILED')
  return stages
}
