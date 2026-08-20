import { AcquisitionWorkerFailure, type AcquisitionResult } from "./types";

export interface AcquisitionIdempotencyStore {
  execute(acquisitionId: string, fingerprint: string, operation: () => Promise<AcquisitionResult>): Promise<AcquisitionResult>;
}

export class InMemoryAcquisitionIdempotencyStore implements AcquisitionIdempotencyStore {
  readonly #entries = new Map<string, Readonly<{ fingerprint: string; result: Promise<AcquisitionResult> }>>();

  execute(acquisitionId: string, fingerprint: string, operation: () => Promise<AcquisitionResult>): Promise<AcquisitionResult> {
    const existing = this.#entries.get(acquisitionId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new AcquisitionWorkerFailure("idempotency-conflict"));
      }
      return existing.result;
    }
    const result = operation();
    this.#entries.set(acquisitionId, Object.freeze({ fingerprint, result }));
    return result;
  }
}
