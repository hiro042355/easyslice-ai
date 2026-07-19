import type { ReconciliationClaimResult, ReconciliationLease, ReconciliationRequest } from "./types";
import { freeze, validOwner, validateRequest } from "./reconciliationUtils";

const TERMINAL = new Set(["resolved", "still-unknown", "corrupted", "manual-repair-required", "cancelled"]);

export function claimReconciliationRequest(request: ReconciliationRequest, owner: string, now: number): ReconciliationClaimResult {
  if (!validateRequest(request) || !validOwner(owner) || !Number.isSafeInteger(now)) return freeze({ status: "unavailable" });
  if (TERMINAL.has(request.state)) return freeze({ status: "terminal" });
  if (request.lease && request.lease.expiresAtMilliseconds > now && request.lease.owner !== owner) return freeze({ status: "busy" });
  const lease = freeze({ owner, fence: (request.lease?.fence ?? 0) + 1, acquiredAtMilliseconds: now, expiresAtMilliseconds: now + request.policy.leaseDurationMilliseconds });
  return freeze({ status: "claimed", request: freeze({ ...request, state: "claimed", revision: request.revision + 1, lease }) });
}

export function renewReconciliationLease(request: ReconciliationRequest, lease: ReconciliationLease, now: number): ReconciliationClaimResult {
  if (!request.lease || request.lease.owner !== lease.owner || request.lease.fence !== lease.fence) return freeze({ status: "stale-fence" });
  if (request.lease.expiresAtMilliseconds <= now) return freeze({ status: "stale-fence" });
  const renewed = freeze({ ...lease, expiresAtMilliseconds: now + request.policy.leaseDurationMilliseconds });
  return freeze({ status: "claimed", request: freeze({ ...request, revision: request.revision + 1, lease: renewed }) });
}

export function leaseOwns(request: ReconciliationRequest, lease: ReconciliationLease, now: number): boolean {
  return !!request.lease && request.lease.owner === lease.owner && request.lease.fence === lease.fence && request.lease.expiresAtMilliseconds > now;
}
