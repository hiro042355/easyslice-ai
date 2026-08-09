import { decideCanonicalClipBoundary, type CanonicalClipBoundaryInput } from "../clipBoundary";
import { createClipEditPlanV1, type ClipEditInputV1 } from "../clipEditing";
import type { UnifiedClipCandidateV1 } from "../clipCandidates";
import { scoreClipQualityV2, selectIntelligentClipPortfolioV1, type ClipPortfolioSelectionV1 } from "../clipRanking";
import { CLIP_PLATFORM_PROFILE_VERSION, type ClipPlatformTargetV1, type PlatformAwareClipQualityV1, type PlatformAwarePortfolioItemV1 } from "./types";
import { resolveClipPlatformProfileV1 } from "./profiles";

export const decidePlatformAwareClipBoundaryV1 = (input: CanonicalClipBoundaryInput, target: ClipPlatformTargetV1 = "generic-short") => decideCanonicalClipBoundary({ ...input, adaptiveDurationPolicy: resolveClipPlatformProfileV1(target).durationPolicy });
export const createPlatformAwareClipEditPlanV1 = (input: ClipEditInputV1, target: ClipPlatformTargetV1 = "generic-short") => createClipEditPlanV1({ ...input, policy: resolveClipPlatformProfileV1(target).editingPolicy });
export const scorePlatformAwareClipQualityV1 = (candidate: UnifiedClipCandidateV1, target: ClipPlatformTargetV1 = "generic-short"): PlatformAwareClipQualityV1 => {
  const profile = resolveClipPlatformProfileV1(target); const baseQuality = scoreClipQualityV2(candidate); const dimensions = baseQuality.baseQuality.dimensions; const weights = profile.qualityWeights;
  const adjusted = target === "generic-short" ? baseQuality.overall : Math.round(dimensions.hookStrength * weights.hookStrength + dimensions.storyCompleteness * weights.storyCompleteness + dimensions.standaloneValue * weights.standaloneValue + dimensions.payoffStrength * weights.payoffStrength + dimensions.informationDensity * weights.informationDensity + dimensions.boundaryQuality * weights.boundaryQuality + (baseQuality.sourceContextRelevance ?? 0) * weights.sourceContextRelevance);
  return Object.freeze({ platformTarget: target, platformProfileVersion: CLIP_PLATFORM_PROFILE_VERSION, baseQuality, platformAdjustedQuality: adjusted, appliedWeightProfile: weights });
};
export const selectPlatformAwareClipPortfolioV1 = (candidates: readonly UnifiedClipCandidateV1[], target: ClipPlatformTargetV1 = "generic-short"): Readonly<{ selection: ClipPortfolioSelectionV1; evidence: readonly PlatformAwarePortfolioItemV1[] }> => {
  const selection = selectIntelligentClipPortfolioV1(candidates); const profile = resolveClipPlatformProfileV1(target);
  if (target === "generic-short") return Object.freeze({ selection, evidence: Object.freeze(selection.selected.map((item) => Object.freeze({ stableCandidateId: item.candidate.stableCandidateId, platformTarget: target, platformAdjustedPortfolioScore: item.portfolioScore, platformReasonCodes: profile.reasonCodes, baseQuality: item.quality }))) });
  const ordered = [...selection.selected].sort((left, right) => scorePlatformAwareClipQualityV1(right.candidate, target).platformAdjustedQuality - scorePlatformAwareClipQualityV1(left.candidate, target).platformAdjustedQuality || left.selectedRank - right.selectedRank).map((item, index) => Object.freeze({ ...item, selectedRank: index + 1 }));
  const adjustedSelection = Object.freeze({ ...selection, selected: Object.freeze(ordered) });
  return Object.freeze({ selection: adjustedSelection, evidence: Object.freeze(ordered.map((item) => Object.freeze({ stableCandidateId: item.candidate.stableCandidateId, platformTarget: target, platformAdjustedPortfolioScore: scorePlatformAwareClipQualityV1(item.candidate, target).platformAdjustedQuality, platformReasonCodes: profile.reasonCodes, baseQuality: item.quality }))) });
};
