import {
  CLIP_FINAL_SELECTION_POLICY_V1,
  type LegacyClipCandidateV1,
  type UnifiedClipCandidateV1,
} from "../clipCandidates";
import { scoreClipQualityV1 } from "./clipQualityScorer";
import { scoreClipSimilarityV1 } from "./clipSimilarity";
import {
  createClipDuplicateGroupsV1,
  selectClipDuplicateRepresentativesV1,
} from "./duplicateGroups";
import {
  CLIP_PORTFOLIO_VERSION,
  type ClipPortfolioCategoryV1,
  type ClipPortfolioReasonV1,
  type ClipPortfolioSelectionV1,
  type ClipQualityScoreV1,
  type RejectedClipPortfolioItemV1,
  type SelectedClipPortfolioItemV1,
} from "./types";

export const CLIP_QUALITY_FLOOR_V1 = 45;

const categoryOf = (candidate: UnifiedClipCandidateV1): ClipPortfolioCategoryV1 => {
  if (candidate.storyReason === "question-answer-completion") return "question-answer";
  if (candidate.storyReason === "payoff-completion") return "conclusion";
  if (candidate.transcriptText && /^(?:でも|しかし|実は|ところが|but\b|however\b|actually\b)/iu.test(candidate.transcriptText.trim())) {
    return "contrast";
  }
  if (candidate.storyReason === "semantic-completion") return "story-complete";
  if (candidate.transcriptText) return "explanation";
  return "generic-complete";
};

const compareQuality = (left: ClipQualityScoreV1, right: ClipQualityScoreV1) =>
  right.overall - left.overall || left.stableCandidateId.localeCompare(right.stableCandidateId);

const groupFor = (candidateId: string, groups: ClipPortfolioSelectionV1["duplicateGroups"]) =>
  groups.find((group) => group.candidateIds.includes(candidateId))!;

const evaluatePortfolioContribution = (
  candidate: UnifiedClipCandidateV1,
  quality: ClipQualityScoreV1,
  selected: readonly SelectedClipPortfolioItemV1[]
) => {
  if (selected.length === 0) {
    return { score: quality.overall + Math.round((candidate.sourceContextEvidence?.relevance ?? 0) * 0.05), reasons: ["highest-quality"] as ClipPortfolioReasonV1[] };
  }
  const category = categoryOf(candidate);
  const unseenCategory = selected.every((item) => item.category !== category);
  const minimumTimeDistance = Math.min(...selected.map((item) => Math.abs(item.candidate.start - candidate.start)));
  const maximumSimilarity = Math.max(
    ...selected.map((item) => scoreClipSimilarityV1(item.candidate, candidate).combined)
  );
  const diversity =
    (unseenCategory ? 40 : 0) +
    (minimumTimeDistance >= 30 ? 30 : 0) +
    Math.round(30 * (1 - maximumSimilarity / 100));
  const primaryTerm = candidate.sourceContextEvidence?.primaryTerms[0];
  const sourceContextDiverse = primaryTerm !== undefined && selected.every(
    (item) => item.candidate.sourceContextEvidence?.primaryTerms[0] !== primaryTerm
  );
  const reasons: ClipPortfolioReasonV1[] = [];
  if (unseenCategory) reasons.push("category-diversity");
  if (minimumTimeDistance >= 30) reasons.push("temporal-diversity");
  if (maximumSimilarity < 70) reasons.push("low-similarity");
  if (quality.dimensions.storyCompleteness >= 90) reasons.push("strong-story-completeness");
  if (quality.dimensions.payoffStrength >= 90) reasons.push("strong-payoff");
  if (quality.dimensions.hookStrength >= 85) reasons.push("strong-hook");
  if (sourceContextDiverse) reasons.push("source-context-diversity");
  return {
    score: Math.round(
      quality.overall * 0.75 + diversity * 0.25 +
      (candidate.sourceContextEvidence?.relevance ?? 0) * 0.05 +
      (sourceContextDiverse ? 3 : 0)
    ),
    reasons,
  };
};

export const selectIntelligentClipPortfolioV1 = (
  candidates: readonly UnifiedClipCandidateV1[]
): ClipPortfolioSelectionV1 => {
  const qualities = new Map(
    candidates.map((candidate) => [candidate.stableCandidateId, scoreClipQualityV1(candidate)])
  );
  const duplicateGroups = createClipDuplicateGroupsV1(candidates);
  const representatives = selectClipDuplicateRepresentativesV1(candidates, duplicateGroups, qualities);
  const representativeIds = new Set(representatives.map((candidate) => candidate.stableCandidateId));
  const eligible = representatives.filter(
    (candidate) => qualities.get(candidate.stableCandidateId)!.overall >= CLIP_QUALITY_FLOOR_V1
  );
  const selected: SelectedClipPortfolioItemV1[] = [];
  const remaining = [...eligible];
  while (selected.length < CLIP_FINAL_SELECTION_POLICY_V1.finalClipCount && remaining.length > 0) {
    const evaluated = remaining.map((candidate) => {
      const quality = qualities.get(candidate.stableCandidateId)!;
      return {
        candidate,
        quality,
        contribution: evaluatePortfolioContribution(candidate, quality, selected),
      };
    }).sort((left, right) =>
      right.contribution.score - left.contribution.score ||
      compareQuality(left.quality, right.quality) ||
      left.candidate.start - right.candidate.start ||
      left.candidate.stableCandidateId.localeCompare(right.candidate.stableCandidateId)
    );
    const winner = evaluated[0]!;
    const group = groupFor(winner.candidate.stableCandidateId, duplicateGroups);
    selected.push(Object.freeze({
      candidate: winner.candidate,
      quality: winner.quality,
      selectedRank: selected.length + 1,
      duplicateGroupId: group.duplicateGroupId,
      representativeReason: group.candidateIds.length > 1
        ? "highest-quality-representative"
        : "only-candidate",
      portfolioScore: winner.contribution.score,
      portfolioReasons: Object.freeze(winner.contribution.reasons),
      category: categoryOf(winner.candidate),
    }));
    remaining.splice(remaining.indexOf(winner.candidate), 1);
  }

  const selectedIds = new Set(selected.map((item) => item.candidate.stableCandidateId));
  const rejected: RejectedClipPortfolioItemV1[] = candidates
    .filter((candidate) => !selectedIds.has(candidate.stableCandidateId))
    .map((candidate) => {
      const group = groupFor(candidate.stableCandidateId, duplicateGroups);
      const quality = qualities.get(candidate.stableCandidateId)!;
      const reason = !representativeIds.has(candidate.stableCandidateId)
        ? "lower-quality-duplicate" as const
        : quality.overall < CLIP_QUALITY_FLOOR_V1
          ? "below-quality-floor" as const
          : "portfolio-capacity" as const;
      return Object.freeze({
        candidate,
        reason,
        duplicateGroupId: group.duplicateGroupId,
      });
    });
  return Object.freeze({
    portfolioVersion: CLIP_PORTFOLIO_VERSION,
    selected: Object.freeze(selected),
    rejected: Object.freeze(rejected),
    duplicateGroups,
  });
};

export const projectPortfolioToLegacyClipsV1 = (
  selection: ClipPortfolioSelectionV1
): readonly LegacyClipCandidateV1[] => Object.freeze(
  selection.selected.map(({ candidate }) => Object.freeze({
    start: String(candidate.start),
    end: String(candidate.end),
    title: candidate.title ?? "",
    reason: candidate.reason ?? "",
    score: candidate.sourceScore ?? 0,
  }))
);
