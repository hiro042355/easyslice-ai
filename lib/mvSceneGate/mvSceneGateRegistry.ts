import type { MVScenePlanGateDescriptor } from "@/lib/mvSceneGate/types";

export const REFERENCE_MV_SCENE_PLAN_GATE_ID = "reference-mv-scene-plan-gate-v1";

const descriptor: Readonly<MVScenePlanGateDescriptor> = Object.freeze({
  gateId: "reference-mv-scene-plan-gate-v1",
  contractVersion: "1.0",
  inputVersion: "1.0",
  policyVersion: "1.0",
  contextVersion: "1.0",
  supportedPlanVersion: "1.0",
  availability: "available",
});

const copy = (value: Readonly<MVScenePlanGateDescriptor>): MVScenePlanGateDescriptor => ({
  gateId: value.gateId,
  contractVersion: value.contractVersion,
  inputVersion: value.inputVersion,
  policyVersion: value.policyVersion,
  contextVersion: value.contextVersion,
  supportedPlanVersion: value.supportedPlanVersion,
  availability: value.availability,
});

export const listMVScenePlanGateDescriptors = (): readonly MVScenePlanGateDescriptor[] =>
  [copy(descriptor)];

export const getMVScenePlanGateDescriptor = (
  gateId: string,
): MVScenePlanGateDescriptor | undefined =>
  gateId === descriptor.gateId ? copy(descriptor) : undefined;
