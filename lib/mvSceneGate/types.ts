import type { DirectorDecision } from "@/lib/directorDecisionEngine";
import type { MVDecisionProjection, MVScenePlan } from "@/lib/mvContracts";

export type MVScenePlanGateContext = {
  contextVersion: "1.0";
  operationRef: string;
};

export type MVScenePlanGatePolicy = {
  policyVersion: "1.0";
  timelineMode: "exact-contiguous";
  minimumSceneCount: 5;
  requiredMainPeakCount: 1;
  requiredAfterglowCount: 1;
};

export type MVScenePlanGateInput = {
  inputVersion: "1.0";
  plan: MVScenePlan;
  projection: MVDecisionProjection;
  decision: DirectorDecision;
  policy: MVScenePlanGatePolicy;
  context: MVScenePlanGateContext;
};

export type MVScenePlanGateDescriptor = {
  gateId: "reference-mv-scene-plan-gate-v1";
  contractVersion: "1.0";
  inputVersion: "1.0";
  policyVersion: "1.0";
  contextVersion: "1.0";
  supportedPlanVersion: "1.0";
  availability: "available" | "disabled";
};

export const REFERENCE_MV_SCENE_PLAN_GATE_POLICY: Readonly<MVScenePlanGatePolicy> =
  Object.freeze({
    policyVersion: "1.0",
    timelineMode: "exact-contiguous",
    minimumSceneCount: 5,
    requiredMainPeakCount: 1,
    requiredAfterglowCount: 1,
  });
