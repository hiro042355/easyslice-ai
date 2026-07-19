import type { ReconciliationRequest, ReconciliationResolutionDecision, ReconciliationSourceResult } from "./types";
import { policyExhausted, retryAdvice } from "./reconciliationObservationPlanner";
import { freeze } from "./reconciliationUtils";

export function resolveObservation(request: ReconciliationRequest, observation: ReconciliationSourceResult, now: number): ReconciliationResolutionDecision {
  if (observation === "committed") return freeze({ nextState: "resolved", result: freeze({ status: "resolved", outcome: "committed" }), appendOutbox: true, routeManualRepair: false });
  if (observation === "not-committed") return freeze({ nextState: "resolved", result: freeze({ status: "resolved", outcome: "not-committed" }), appendOutbox: true, routeManualRepair: false });
  if (observation === "corrupted") return freeze({ nextState: "corrupted", result: freeze({ status: "corrupted" as const, escalation: "manual-repair" as const }), appendOutbox: true, routeManualRepair: true });
  if (policyExhausted(request, now)) return freeze({ nextState: "still-unknown", result: freeze({ status: "still-unknown", escalation: request.policy.exhaustionEscalation }), appendOutbox: true, routeManualRepair: request.policy.exhaustionEscalation === "manual-repair" });
  return freeze({ nextState: "retry-wait", result: freeze({ status: "pending" as const, nextAction: "retry-later" as const, retryAdvice: retryAdvice(request, now) }), appendOutbox: false, routeManualRepair: false });
}
