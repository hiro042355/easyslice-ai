import { AcquisitionWorkerFailure, type AcquisitionResult } from "./types";

export interface AcquisitionIdempotencyStore {
  execute(
    acquisitionId: string,
    fingerprint: string,
    operation: (leaseSignal: AbortSignal) => Promise<AcquisitionResult>,
    callerSignal?: AbortSignal,
  ): Promise<AcquisitionResult>;
}

export class InMemoryAcquisitionIdempotencyStore implements AcquisitionIdempotencyStore {
  readonly #entries = new Map<string, Readonly<{ fingerprint: string; result: Promise<AcquisitionResult> }>>();

  execute(
    acquisitionId: string,
    fingerprint: string,
    operation: (leaseSignal: AbortSignal) => Promise<AcquisitionResult>,
    callerSignal?: AbortSignal,
  ): Promise<AcquisitionResult> {
    const existing = this.#entries.get(acquisitionId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new AcquisitionWorkerFailure("idempotency-conflict"));
      }
      return existing.result;
    }
    const lease = new AbortController();
    const abort = () => lease.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abort, { once: true });
    if (callerSignal?.aborted) abort();
    const result = operation(lease.signal).finally(() => callerSignal?.removeEventListener("abort", abort));
    this.#entries.set(acquisitionId, Object.freeze({ fingerprint, result }));
    return result;
  }
}
