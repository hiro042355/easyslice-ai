export type OperationState = 'AWAITING_APPROVAL' | 'APPROVED' | 'UPLOAD_IN_PROGRESS' | 'COMMIT_UNKNOWN' | 'UPLOAD_COMMITTED' | 'VERIFYING' | 'PRIVATE_VERIFIED' | 'FAILED_TERMINAL'
const transitions: Record<OperationState, readonly OperationState[]> = {
  AWAITING_APPROVAL: ['APPROVED', 'FAILED_TERMINAL'], APPROVED: ['UPLOAD_IN_PROGRESS', 'FAILED_TERMINAL'],
  UPLOAD_IN_PROGRESS: ['COMMIT_UNKNOWN', 'UPLOAD_COMMITTED'], COMMIT_UNKNOWN: ['UPLOAD_COMMITTED'],
  UPLOAD_COMMITTED: ['VERIFYING'], VERIFYING: ['UPLOAD_COMMITTED', 'PRIVATE_VERIFIED', 'FAILED_TERMINAL'],
  PRIVATE_VERIFIED: ['VERIFYING'], FAILED_TERMINAL: [],
}
export function isPrivateUploadTransitionAllowed(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(transitions, from) && transitions[from as OperationState].includes(to as OperationState)
}
export type ApprovalBinding = {
  approvalId: string; operationId: string; idempotencyKey: string; artifactId: string; revisionId: string
  digest: string; mimeType: string; title: string; description: string; privacyStatus: 'private'
  certificationId: string; expiresAt: number; authorityBinding: string; channelBinding: string
}
export interface TrustedApprovalProvider {
  readonly kind: 'PRODUCTION' | 'TEST_ONLY'
  getChannelBinding(authorityBinding: string): unknown
  issueApproval(binding: Readonly<ApprovalBinding>): unknown
}
export interface ReconciliationProvider {
  readonly kind: 'PRODUCTION' | 'TEST_ONLY'
  inspect(binding: Readonly<ApprovalBinding & { attemptId: string; startedAt: number }>): Promise<unknown>
}
export function allowedProvider(value: unknown): value is { kind: 'PRODUCTION' | 'TEST_ONLY' } {
  try { return !!value && typeof value === 'object' &&
    ((value as { kind?: unknown }).kind === 'PRODUCTION' ||
      ((value as { kind?: unknown }).kind === 'TEST_ONLY' && process.env.NODE_ENV === 'test'))
  } catch { return false }
}
export interface StateCollection<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  has(key: string): boolean
  clear(): void
}
/** A durable replacement must provide atomic transactions across approval consumption,
 * operation reservation, attempt identity, and evidence; isolated bucket writes are
 * explicitly insufficient across processes. No durable implementation exists here.
 */
export interface PrivateUploadStateRepository {
  readonly durability: 'PROCESS_LOCAL' | 'DURABLE_SHARED'
  collection<T>(name: string): StateCollection<T>
}
export class InMemoryPrivateUploadRepository implements PrivateUploadStateRepository {
  readonly durability = 'PROCESS_LOCAL' as const
  private buckets = new Map<string, Map<string, unknown>>()
  collection<T>(name: string): StateCollection<T> {
    let bucket = this.buckets.get(name)
    if (!bucket) { bucket = new Map(); this.buckets.set(name, bucket) }
    const data = bucket
    return {
      get: key => data.has(key) ? structuredClone(data.get(key)) as T : undefined,
      set: (key, value) => { data.set(key, structuredClone(value)) },
      has: key => data.has(key), clear: () => { data.clear() },
    }
  }
}
