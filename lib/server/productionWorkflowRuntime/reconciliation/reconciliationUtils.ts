import type { ReconciliationRequest, ReconciliationTemporalPolicy } from "./types";

export const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
export const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const validOwner = (value: string): boolean => /^[a-z][a-z0-9-]{0,63}$/.test(value);

export function validateTemporalPolicy(policy: ReconciliationTemporalPolicy): boolean {
  return policy.policyVersion === "1.0"
    && Number.isInteger(policy.maxAttempts) && policy.maxAttempts >= 1 && policy.maxAttempts <= 64
    && Number.isInteger(policy.maxElapsedMilliseconds) && policy.maxElapsedMilliseconds >= 1 && policy.maxElapsedMilliseconds <= 604_800_000
    && Number.isInteger(policy.leaseDurationMilliseconds) && policy.leaseDurationMilliseconds >= 1 && policy.leaseDurationMilliseconds <= 3_600_000
    && Number.isInteger(policy.heartbeatIntervalMilliseconds) && policy.heartbeatIntervalMilliseconds >= 1
    && policy.heartbeatIntervalMilliseconds < policy.leaseDurationMilliseconds;
}

export function validateRequest(request: ReconciliationRequest): boolean {
  return request.requestVersion === "1.0" && request.requestId.length > 0 && request.requestId.length <= 128
    && isSafeInteger(request.revision) && isSafeInteger(request.attempt) && isSafeInteger(request.observationCount)
    && isSafeInteger(request.createdAtMilliseconds) && validateTemporalPolicy(request.policy)
    && request.attempt <= request.policy.maxAttempts;
}
