import type {
  MVScenePlanGateReasonCode,
  MVScenePlanGateResult,
} from "@/lib/mvContracts";
import {
  canonicalReasons,
  validContext,
  validDecisionProjection,
  validPlanAlignment,
  validPlanStructure,
  validPolicy,
  validRoot,
  validTimeline,
} from "@/lib/mvSceneGate/mvSceneGateUtils";
import type { MVScenePlanGateInput } from "@/lib/mvSceneGate/types";

const invalid = (): MVScenePlanGateResult => ({
  allowed: false,
  reviewRequired: false,
  reasonCodes: ["scene-plan-invalid"],
});

export function createMVScenePlanGate(
  input: MVScenePlanGateInput,
): MVScenePlanGateResult {
  try {
    if (!validRoot(input) || !validPolicy(input.policy) || !validContext(input.context) ||
        !validPlanStructure(input.plan, input.policy) || !validTimeline(input.plan) ||
        !validDecisionProjection(input.decision, input.projection) ||
        !validPlanAlignment(input.plan, input.projection, input.decision, input.policy)) {
      return invalid();
    }
    if (input.plan.validation.status === "invalid") return invalid();
    if (input.plan.validation.status === "normalized" ||
        input.plan.validation.status === "fallback" || input.plan.reviewRequired) {
      const reasons: MVScenePlanGateReasonCode[] = ["scene-plan-review-pending"];
      if (input.plan.validation.status === "normalized") {
        reasons.push("scene-plan-normalized-review-required");
      }
      if (input.plan.validation.status === "fallback") {
        reasons.push("scene-plan-fallback-review-required");
      }
      return {
        allowed: false,
        reviewRequired: true,
        reasonCodes: canonicalReasons(reasons),
      };
    }
    return { allowed: true, reviewRequired: false, reasonCodes: ["scene-plan-ready"] };
  } catch {
    return invalid();
  }
}
