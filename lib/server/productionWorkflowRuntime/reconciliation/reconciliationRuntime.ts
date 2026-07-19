import type { ReconciliationObservation, ReconciliationPersistence, ReconciliationRuntime, WorkflowReconciliationResult } from "./types";
import { RECONCILIATION_RUNTIME_DESCRIPTOR } from "./reconciliationRegistry";
import { requiredSourceFor } from "./reconciliationObservationPlanner";
import { resolveObservation } from "./reconciliationResolutionEngine";
import { freeze, validOwner, validateRequest } from "./reconciliationUtils";

const unavailable = (retryable: boolean): WorkflowReconciliationResult => freeze({ status: "unavailable", retryable });

export function createReconciliationRuntime(persistence: ReconciliationPersistence): ReconciliationRuntime {
  return freeze({
    descriptor: RECONCILIATION_RUNTIME_DESCRIPTOR,
    async heartbeat(request, lease, nowMilliseconds) {
      return persistence.heartbeat(request, lease, nowMilliseconds);
    },
    async reconcile(request, owner, source, nowMilliseconds, observedAt) {
      if (!validateRequest(request) || !validOwner(owner) || source.source !== requiredSourceFor(request) || !source.sideEffectFree) return unavailable(false);
      const claim = await persistence.claim(request, owner, nowMilliseconds);
      if (claim.status !== "claimed") return unavailable(claim.status === "unavailable");
      const claimed = claim.request;
      const lease = claimed.lease;
      if (!lease) return unavailable(false);
      const sourceResult = await source.observe(claimed).catch(() => "unavailable" as const);
      const observation: ReconciliationObservation = freeze({ observationVersion: "1.0", sequence: claimed.observationCount + 1, attempt: claimed.attempt + 1, source: source.source, result: sourceResult, observedAt });
      const appended = await persistence.appendObservation(claimed, lease, observation);
      if (appended.status !== "committed") {
        if (appended.status === "commit-unknown") {
          const lookup = await persistence.lookupResolution(claimed);
          if (lookup === "committed") return freeze({ status: "resolved", outcome: "committed" });
          if (lookup === "corrupted") return freeze({ status: "corrupted" as const, escalation: "manual-repair" as const });
          return unavailable(false);
        }
        return unavailable(appended.status === "unavailable");
      }
      const observed = appended.request;
      const decision = resolveObservation(observed, sourceResult, nowMilliseconds);
      const completed = await persistence.complete(observed, lease, decision);
      if (completed.status === "committed") return decision.result;
      if (completed.status === "commit-unknown") {
        const lookup = await persistence.lookupResolution(observed);
        if (lookup === "committed") return decision.result;
        if (lookup === "corrupted") return freeze({ status: "corrupted" as const, escalation: "manual-repair" as const });
        return unavailable(false);
      }
      await persistence.release(observed, lease).catch(() => undefined);
      return unavailable(completed.status === "unavailable");
    },
  });
}
