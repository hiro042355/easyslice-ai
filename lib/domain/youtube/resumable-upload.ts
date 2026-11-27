import { createHash } from 'node:crypto'
import { trustedSessionLocation } from './durable-private-upload'

/**
 * YouTube resumable-upload protocol, expressed as pure functions.
 *
 * Nothing here performs I/O, so the protocol rules are testable without a network
 * and without a provider. The HTTP transport in
 * `lib/infrastructure/youtube/resumable-upload-transport.ts` is the only caller.
 *
 * Protocol facts this module encodes (v3 `upload/youtube/v3/videos?uploadType=resumable`):
 * - a session is initiated once and then addressed by an opaque `upload_id`;
 * - chunks are `PUT` with `Content-Range: bytes start-end/total`;
 * - an incomplete chunk is answered `308 Resume Incomplete`, and the bytes the
 *   server actually holds are reported in `Range: bytes=0-<lastByte>`;
 * - the final chunk is answered `200`/`201` with the video resource;
 * - the server may forget a session (400/404 with an expired-session reason).
 *
 * The important safety rule: `Range` is the only authority on how far the server
 * got. A locally attempted chunk proves nothing.
 */

/** Google requires a chunk multiple of 256 KiB, except the final chunk. */
export const RESUMABLE_ALIGNMENT = 256 * 1024
export const RESUMABLE_CHUNK_BYTES = 8 * RESUMABLE_ALIGNMENT
export const RESUMABLE_MAX_CHUNK_BYTES = 64 * RESUMABLE_ALIGNMENT

export type ChunkPlan = { readonly index: number; readonly offset: number; readonly length: number; readonly isFinal: boolean }

export type ProtocolRefusal =
  | { readonly code: 'INVALID_TOTAL_BYTES'; readonly field: 'totalBytes' }
  | { readonly code: 'INVALID_CHUNK_SIZE'; readonly field: 'chunkBytes' }
  | { readonly code: 'INVALID_OFFSET'; readonly field: 'offset' }

export function planChunks(totalBytes: number, chunkBytes: number = RESUMABLE_CHUNK_BYTES): ChunkPlan[] | ProtocolRefusal {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) return { code: 'INVALID_TOTAL_BYTES', field: 'totalBytes' }
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < RESUMABLE_ALIGNMENT || chunkBytes > RESUMABLE_MAX_CHUNK_BYTES || chunkBytes % RESUMABLE_ALIGNMENT !== 0) {
    return { code: 'INVALID_CHUNK_SIZE', field: 'chunkBytes' }
  }
  const chunks: ChunkPlan[] = []
  for (let offset = 0, index = 0; offset < totalBytes; index++) {
    const length = Math.min(chunkBytes, totalBytes - offset)
    chunks.push({ index, offset, length, isFinal: offset + length === totalBytes })
    offset += length
  }
  return chunks
}

/** `bytes start-end/total`; `*` only for a status probe, never for a chunk we send. */
export function contentRange(offset: number, length: number, totalBytes: number): string | undefined {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || !Number.isSafeInteger(totalBytes)) return undefined
  if (offset < 0 || length <= 0 || totalBytes <= 0 || offset >= totalBytes || offset + length > totalBytes) return undefined
  return `bytes ${offset}-${offset + length - 1}/${totalBytes}`
}

/** Parses `Range: bytes=0-<lastByte>` and returns the next byte to send. */
export function confirmedOffsetFromRange(value: string | undefined, totalBytes: number): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^bytes=(\d+)-(\d+)$/.exec(value.trim())
  if (!match) return undefined
  const start = Number(match[1])
  const end = Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start !== 0 || end < 0) return undefined
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || end >= totalBytes) return undefined
  return end + 1
}

export type ResumableResponseKind =
  | 'COMPLETE' | 'RESUME' | 'SESSION_EXPIRED' | 'RETRY' | 'TERMINAL'

export interface ResumableClassification {
  readonly kind: ResumableResponseKind
  /** Present for RESUME: the server's confirmed next offset, when it reported one. */
  readonly confirmedOffset?: number
  readonly videoId?: string
  readonly privacyStatus?: 'private' | 'public' | 'unlisted'
  readonly retryAfterMs?: number
  readonly code?: string
}

export interface ResumableHttpResult {
  readonly status: number
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: unknown
}

const reasonOf = (body: unknown): string => {
  if (!body || typeof body !== 'object') return ''
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') return ''
  const e = error as { message?: unknown; errors?: unknown; status?: unknown }
  const first = Array.isArray(e.errors) && e.errors[0] && typeof e.errors[0] === 'object' ? (e.errors[0] as { reason?: unknown }).reason : undefined
  return [typeof first === 'string' ? first : '', typeof e.message === 'string' ? e.message : '', typeof e.status === 'string' ? e.status : ''].join(' ').toLowerCase()
}

const EXPIRED = /uploadexpired|sessionexpired|upload session|resumable session|expired/
const QUOTA = /quotaexceeded|dailylimitexceeded|quotaExceeded/i
const AUTH = /unauthorized|autherror|forbidden|invalid_grant|invalid credentials|insufficientpermissions|insufficientpermission/

export function classifyResumableResponse(response: ResumableHttpResult, totalBytes: number): ResumableClassification {
  const status = Number(response.status)
  const headers = response.headers ?? {}
  const rangeHeader = headers['range'] ?? headers['Range']
  const retryAfter = Number(headers['retry-after'] ?? headers['Retry-After'])
  if (status === 308) {
    const confirmedOffset = confirmedOffsetFromRange(rangeHeader, totalBytes)
    return { kind: 'RESUME', confirmedOffset, code: confirmedOffset === undefined ? 'RANGE_UNREPORTED' : undefined }
  }
  if (status === 200 || status === 201) {
    const body = response.body as { id?: unknown; status?: { privacyStatus?: unknown } } | undefined
    const videoId = typeof body?.id === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(body.id) ? body.id : undefined
    const privacy = body?.status?.privacyStatus
    const privacyStatus = privacy === 'private' || privacy === 'public' || privacy === 'unlisted' ? privacy : undefined
    return videoId ? { kind: 'COMPLETE', videoId, privacyStatus } : { kind: 'TERMINAL', code: 'MALFORMED_COMPLETION' }
  }
  if (status === 429) return { kind: 'RETRY', retryAfterMs: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : undefined, code: 'RATE_LIMITED' }
  if (status >= 500) return { kind: 'RETRY', code: `HTTP_${status}` }
  if (status === 408) return { kind: 'RETRY', code: 'REQUEST_TIMEOUT' }
  if (status === 400 || status === 404 || status === 410) {
    if (EXPIRED.test(reasonOf(response.body))) return { kind: 'SESSION_EXPIRED', code: 'SESSION_EXPIRED' }
    return { kind: 'TERMINAL', code: `HTTP_${status}` }
  }
  if (status === 401) return { kind: 'TERMINAL', code: 'AUTH_REJECTED' }
  if (status === 403) {
    const reason = reasonOf(response.body)
    if (QUOTA.test(reason)) return { kind: 'TERMINAL', code: 'QUOTA_EXCEEDED' }
    if (AUTH.test(reason)) return { kind: 'TERMINAL', code: 'AUTH_REJECTED' }
    return { kind: 'TERMINAL', code: 'FORBIDDEN' }
  }
  return { kind: 'TERMINAL', code: `HTTP_${status}` }
}

/**
 * Session URL validation. A resumable session URL is a bearer capability: whoever
 * holds it can write bytes into that one upload. It is therefore constrained to the
 * exact Google upload origin and path, with only the parameters the protocol defines.
 */
export const RESUMABLE_SESSION_PARAMS = Object.freeze(['upload_id', 'uploadType', 'part'])

export function validateResumableSessionUrl(value: unknown): boolean {
  try {
    if (typeof value !== 'string' || value.length > 16384 || !trustedSessionLocation(value)) return false
    const url = new URL(value)
    const names = Array.from(url.searchParams.keys())
    if (names.some(name => !RESUMABLE_SESSION_PARAMS.includes(name))) return false
    if (url.searchParams.getAll('uploadType').some(v => v !== 'resumable')) return false
    const uploadId = url.searchParams.get('upload_id')
    if (uploadId === null || !/^[A-Za-z0-9._~-]{8,512}$/.test(uploadId)) return false
    return true
  } catch { return false }
}

/** Stable identity of one upload attempt. A session bound to another attempt is unusable. */
export interface ResumableSessionBinding {
  readonly operationId: string
  readonly attemptId: string
  readonly assetId: string
  readonly mediaDigest: string
  readonly googleAccountId: string
  readonly tenantId: string
  readonly approvalId: string
}

export function sessionBindingFingerprint(binding: ResumableSessionBinding): string {
  return createHash('sha256')
    .update(JSON.stringify([binding.operationId, binding.attemptId, binding.assetId, binding.mediaDigest,
      binding.googleAccountId, binding.tenantId, binding.approvalId]))
    .digest('hex')
}

export function sessionBindingMatches(stored: string, expected: ResumableSessionBinding): boolean {
  if (typeof stored !== 'string' || !/^[a-f0-9]{64}$/.test(stored)) return false
  return stored === sessionBindingFingerprint(expected)
}

/**
 * Upload states. These mirror the established durable vocabulary rather than
 * introducing a second, competing machine:
 * `DurableAttemptRecord.phase` ∈ RESERVED | REMOTE_STARTED | UNKNOWN | COMMITTED.
 */
export type UploadSessionState =
  | 'CREATED' | 'INITIALIZING' | 'UPLOADING' | 'RESUME_PENDING'
  | 'COMPLETED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'COMMIT_UNKNOWN'

const TRANSITIONS: Readonly<Record<UploadSessionState, readonly UploadSessionState[]>> = Object.freeze({
  CREATED: ['INITIALIZING', 'FAILED_TERMINAL'],
  INITIALIZING: ['UPLOADING', 'RESUME_PENDING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'COMMIT_UNKNOWN'],
  UPLOADING: ['UPLOADING', 'RESUME_PENDING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'COMMIT_UNKNOWN'],
  // A resumable session that expired is resumable only by initiating a new session
  // for the same attempt; it may never silently restart the whole upload.
  RESUME_PENDING: ['INITIALIZING', 'UPLOADING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'COMMIT_UNKNOWN'],
  COMPLETED: [],
  FAILED_RETRYABLE: ['INITIALIZING', 'UPLOADING', 'RESUME_PENDING', 'FAILED_TERMINAL', 'COMMIT_UNKNOWN'],
  FAILED_TERMINAL: [],
  // Set once and resolved only by reconciliation; never a licence to re-upload.
  COMMIT_UNKNOWN: ['COMPLETED', 'FAILED_TERMINAL', 'COMMIT_UNKNOWN'],
})

export function canTransitionUpload(from: UploadSessionState, to: UploadSessionState): boolean {
  const allowed = TRANSITIONS[from as UploadSessionState]
  return !!allowed && allowed.includes(to)
}

export function isTerminalUploadState(state: UploadSessionState): boolean {
  return state === 'COMPLETED' || state === 'FAILED_TERMINAL'
}

/** Projection onto the established durable attempt phases. No parallel machine. */
export function attemptPhaseFor(state: UploadSessionState): 'RESERVED' | 'REMOTE_STARTED' | 'UNKNOWN' | 'COMMITTED' {
  if (state === 'COMPLETED') return 'COMMITTED'
  if (state === 'COMMIT_UNKNOWN') return 'UNKNOWN'
  if (state === 'CREATED') return 'RESERVED'
  return 'REMOTE_STARTED'
}

export function stateForAttemptPhase(phase: 'RESERVED' | 'REMOTE_STARTED' | 'UNKNOWN' | 'COMMITTED'): UploadSessionState {
  if (phase === 'COMMITTED') return 'COMPLETED'
  if (phase === 'UNKNOWN') return 'COMMIT_UNKNOWN'
  if (phase === 'RESERVED') return 'CREATED'
  return 'UPLOADING'
}
