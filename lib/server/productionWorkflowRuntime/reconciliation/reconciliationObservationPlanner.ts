import type { ReconciliationAttemptRemainingClass, ReconciliationRequest, ReconciliationRequiredSource, SafeReconciliationRetryAdvice } from "./types";
import { freeze } from "./reconciliationUtils";

export function requiredSourceFor(request: ReconciliationRequest): ReconciliationRequiredSource {
  if (request.triggerClass === "database-commit-unknown") return "writer-authoritative-store";
  if (request.triggerClass === "provider-submit-unknown" || request.triggerClass === "provider-poll-unknown") return "provider-formal-lookup";
  if (request.triggerClass === "webhook-scheduler-race") return "terminal-store";
  return "safe-journal";
}

export function policyExhausted(request: ReconciliationRequest, now: number): boolean {
  return request.attempt >= request.policy.maxAttempts || now - request.createdAtMilliseconds >= request.policy.maxElapsedMilliseconds;
}

export function retryAdvice(request: ReconciliationRequest, now: number): SafeReconciliationRetryAdvice {
  const exhausted = policyExhausted(request, now);
  const remaining: ReconciliationAttemptRemainingClass = exhausted ? "exhausted" : request.attempt + 1 >= request.policy.maxAttempts ? "last-attempt" : "remaining";
  return freeze({ delayClass: request.policy.delayClass, deadlineClass: exhausted ? "policy-exhausted" : "within-policy", attemptRemainingClass: remaining, requiredSource: requiredSourceFor(request) });
}
