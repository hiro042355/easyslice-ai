import type { DirectorDecision, SectionDirection } from "@/lib/directorDecisionEngine";
import type {
  MVDecisionProjection,
  MVScene,
  MVScenePlan,
  MVScenePlanGateReasonCode,
} from "@/lib/mvContracts";
import type {
  MVScenePlanGateContext,
  MVScenePlanGateInput,
  MVScenePlanGatePolicy,
} from "@/lib/mvSceneGate/types";

const SECTIONS = ["verse", "pre-chorus", "chorus", "bridge", "outro"];
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"];
const ASSET_ROLES = ["subject", "identity", "location", "motif", "style-reference"];
const REASON_ORDER: readonly MVScenePlanGateReasonCode[] = [
  "scene-plan-invalid",
  "scene-plan-review-pending",
  "scene-plan-rejected",
  "scene-plan-normalized-review-required",
  "scene-plan-fallback-review-required",
  "scene-plan-approval-stale",
  "scene-plan-approved",
  "scene-plan-ready",
];
const CONTROL = /[\u0000-\u001f\u007f]/;

export const canonicalReasons = (
  reasons: readonly MVScenePlanGateReasonCode[],
): MVScenePlanGateReasonCode[] => {
  const selected = new Set(reasons);
  return REASON_ORDER.filter((reason) => selected.has(reason));
};

const plainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const safeOpaque = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max &&
  !value.includes("://") && !CONTROL.test(value);

export const validContext = (value: MVScenePlanGateContext) =>
  plainRecord(value) && exactKeys(value, ["contextVersion", "operationRef"]) &&
  value.contextVersion === "1.0" && safeOpaque(value.operationRef, 128);

export const validPolicy = (value: MVScenePlanGatePolicy) =>
  plainRecord(value) && exactKeys(value, [
    "policyVersion", "timelineMode", "minimumSceneCount",
    "requiredMainPeakCount", "requiredAfterglowCount",
  ]) && value.policyVersion === "1.0" &&
  value.timelineMode === "exact-contiguous" && value.minimumSceneCount === 5 &&
  value.requiredMainPeakCount === 1 && value.requiredAfterglowCount === 1;

export const validRoot = (value: MVScenePlanGateInput) =>
  plainRecord(value) && exactKeys(value, [
    "inputVersion", "plan", "projection", "decision", "policy", "context",
  ]) && value.inputVersion === "1.0";

const validSectionDirections = (sections: readonly SectionDirection[]) =>
  Array.isArray(sections) && sections.length === SECTIONS.length &&
  sections.every((section, index) => {
    const previous = sections[index - 1];
    return section !== null && typeof section === "object" &&
      section.section === SECTIONS[index] &&
      Number.isFinite(section.startRatio) && Number.isFinite(section.endRatio) &&
      section.startRatio >= 0 && section.endRatio <= 1 &&
      section.startRatio < section.endRatio &&
      (index === 0 ? section.startRatio === 0 : section.startRatio === previous.endRatio);
  }) && sections.at(-1)?.endRatio === 1;

const equivalent = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((item, index) => equivalent(item, right[index]));
  }
  if (!plainRecord(left) || !plainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && equivalent(left[key], right[key]));
};

export const validDecisionProjection = (
  decision: DirectorDecision,
  projection: MVDecisionProjection,
) => plainRecord(decision) && plainRecord(projection) &&
  decision.schemaVersion === "1.0" && decision.engineVersion === "rule-v1" &&
  projection.decisionSchemaVersion === decision.schemaVersion &&
  projection.engineVersion === decision.engineVersion &&
  projection.normalizedPreset === decision.normalizedPreset &&
  validSectionDirections(decision.sectionDirections) &&
  validSectionDirections(projection.sectionDirections) &&
  decision.sectionDirections.filter((section) => section.isMainPeak).length === 1 &&
  decision.overallDirection.mainPeakSection ===
    decision.sectionDirections.find((section) => section.isMainPeak)?.section &&
  projection.confidence === decision.overallDirection.confidence &&
  equivalent(projection.overallDirection, decision.overallDirection) &&
  equivalent(projection.sectionDirections, decision.sectionDirections) &&
  equivalent(projection.validation, decision.validation) &&
  equivalent(projection.direction, decision.mvDirection);

const validAssetRefs = (scene: MVScene) => {
  if (!Array.isArray(scene.assetRefs)) return false;
  const identities = new Set<string>();
  return scene.assetRefs.every((asset) => {
    if (!plainRecord(asset) || !safeOpaque(asset.assetId, 256) ||
        typeof asset.role !== "string" || !ASSET_ROLES.includes(asset.role)) return false;
    const identity = `${asset.assetId}\u0000${asset.role}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
};

const validSceneShape = (scene: MVScene) => plainRecord(scene) &&
  safeOpaque(scene.sceneId, 256) && SECTIONS.includes(scene.section) &&
  Number.isSafeInteger(scene.order) && typeof scene.isMainPeak === "boolean" &&
  typeof scene.isAfterglow === "boolean" && typeof scene.narrativePurpose === "string" &&
  Number.isFinite(scene.startRatio) && Number.isFinite(scene.endRatio) &&
  Number.isFinite(scene.startSeconds) && Number.isFinite(scene.endSeconds) &&
  validAssetRefs(scene);

export const validPlanStructure = (
  plan: MVScenePlan,
  policy: MVScenePlanGatePolicy,
) => {
  if (!plainRecord(plan) || plan.schemaVersion !== "1.0" || plan.plannerVersion !== "rule-v1" ||
      !Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0 ||
      !ASPECT_RATIOS.includes(plan.aspectRatio) || !Array.isArray(plan.scenes) ||
      plan.scenes.length < policy.minimumSceneCount || !plainRecord(plan.validation) ||
      !["valid", "normalized", "fallback", "invalid"].includes(plan.validation.status)) return false;
  const ids = new Set<string>();
  return plan.scenes.every((scene) => {
    if (!validSceneShape(scene) || ids.has(scene.sceneId)) return false;
    ids.add(scene.sceneId);
    return true;
  });
};

export const validTimeline = (plan: MVScenePlan) =>
  plan.scenes.every((scene, index) => {
    const previous = plan.scenes[index - 1];
    return scene.order === index + 1 && scene.startRatio >= 0 && scene.endRatio <= 1 &&
      scene.startRatio < scene.endRatio && scene.startSeconds >= 0 &&
      scene.startSeconds < scene.endSeconds && scene.endSeconds <= plan.durationSeconds &&
      (index === 0
        ? scene.startRatio === 0 && scene.startSeconds === 0
        : scene.startRatio === previous.endRatio && scene.startSeconds === previous.endSeconds);
  }) && plan.scenes.at(-1)?.endRatio === 1 &&
  plan.scenes.at(-1)?.endSeconds === plan.durationSeconds;

export const validPlanAlignment = (
  plan: MVScenePlan,
  projection: MVDecisionProjection,
  decision: DirectorDecision,
  policy: MVScenePlanGatePolicy,
) => {
  if (plan.sourceDecisionSchemaVersion !== projection.decisionSchemaVersion) return false;
  for (const scene of plan.scenes) {
    const section = projection.sectionDirections.find((item) => item.section === scene.section);
    if (!section || scene.startRatio < section.startRatio || scene.endRatio > section.endRatio) return false;
  }
  const peaks = plan.scenes.filter((scene) => scene.isMainPeak);
  const afterglows = plan.scenes.filter((scene) => scene.isAfterglow);
  const finalScene = plan.scenes.at(-1);
  return peaks.length === policy.requiredMainPeakCount &&
    peaks[0]?.section === decision.overallDirection.mainPeakSection &&
    peaks[0]?.section === projection.overallDirection.mainPeakSection &&
    afterglows.length === policy.requiredAfterglowCount && afterglows[0] === finalScene &&
    finalScene?.section === "outro" && finalScene.narrativePurpose === "afterglow";
};
