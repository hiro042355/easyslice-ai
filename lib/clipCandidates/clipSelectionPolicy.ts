export const CLIP_SELECTION_POLICY_VERSION = "1.0" as const;

export type ClipFinalSelectionPolicyV1 = Readonly<{
  policyVersion: typeof CLIP_SELECTION_POLICY_VERSION;
  finalClipCount: 5;
  candidatePoolLimit: 10;
  orderingOwner: "portfolio-selector";
}>;

export const CLIP_FINAL_SELECTION_POLICY_V1: ClipFinalSelectionPolicyV1 =
  Object.freeze({
    policyVersion: CLIP_SELECTION_POLICY_VERSION,
    finalClipCount: 5,
    candidatePoolLimit: 10,
    orderingOwner: "portfolio-selector",
  });
