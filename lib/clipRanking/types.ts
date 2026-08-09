import type { UnifiedClipCandidateV1 } from "../clipCandidates";

export const CLIP_QUALITY_VERSION = "1.0" as const;
export const CLIP_SIMILARITY_VERSION = "1.0" as const;
export const CLIP_PORTFOLIO_VERSION = "1.0" as const;

export type ClipQualityReasonCodeV1 =
  | "strong-question-hook"
  | "strong-contrast-hook"
  | "complete-story-unit"
  | "contains-answer"
  | "payoff-complete"
  | "self-contained"
  | "dense-information"
  | "strong-boundary"
  | "weak-context-start"
  | "unresolved-question"
  | "fallback-end"
  | "low-information-density"
  | "incomplete-story"
  | "repeated-content";

export type ClipQualityDimensionScoresV1 = Readonly<{
  hookStrength: number;
  storyCompleteness: number;
  standaloneValue: number;
  payoffStrength: number;
  informationDensity: number;
  boundaryQuality: number;
}>;

export type ClipQualityScoreV1 = Readonly<{
  qualityVersion: typeof CLIP_QUALITY_VERSION;
  stableCandidateId: string;
  dimensions: ClipQualityDimensionScoresV1;
  overall: number;
  reasonCodes: readonly ClipQualityReasonCodeV1[];
}>;

export type ClipDuplicateClassificationV1 = "duplicate" | "similar" | "distinct";

export type ClipSimilarityScoreV1 = Readonly<{
  similarityVersion: typeof CLIP_SIMILARITY_VERSION;
  leftCandidateId: string;
  rightCandidateId: string;
  temporal: number;
  text?: number;
  segments?: number;
  combined: number;
  classification: ClipDuplicateClassificationV1;
  hardDuplicate: boolean;
}>;

export type ClipDuplicateGroupV1 = Readonly<{
  duplicateGroupId: string;
  candidateIds: readonly string[];
}>;

export type ClipPortfolioReasonV1 =
  | "highest-quality"
  | "duplicate-representative"
  | "category-diversity"
  | "temporal-diversity"
  | "low-similarity"
  | "strong-story-completeness"
  | "strong-payoff"
  | "strong-hook";

export type ClipRejectionReasonV1 =
  | "duplicate"
  | "lower-quality-duplicate"
  | "below-quality-floor"
  | "portfolio-capacity"
  | "excessive-similarity"
  | "lower-selection-score";

export type ClipPortfolioCategoryV1 =
  | "question-answer"
  | "conclusion"
  | "contrast"
  | "explanation"
  | "story-complete"
  | "generic-complete";

export type SelectedClipPortfolioItemV1 = Readonly<{
  candidate: UnifiedClipCandidateV1;
  quality: ClipQualityScoreV1;
  selectedRank: number;
  duplicateGroupId: string;
  representativeReason: "only-candidate" | "highest-quality-representative";
  portfolioScore: number;
  portfolioReasons: readonly ClipPortfolioReasonV1[];
  category: ClipPortfolioCategoryV1;
}>;

export type RejectedClipPortfolioItemV1 = Readonly<{
  candidate: UnifiedClipCandidateV1;
  reason: ClipRejectionReasonV1;
  duplicateGroupId?: string;
}>;

export type ClipPortfolioSelectionV1 = Readonly<{
  portfolioVersion: typeof CLIP_PORTFOLIO_VERSION;
  selected: readonly SelectedClipPortfolioItemV1[];
  rejected: readonly RejectedClipPortfolioItemV1[];
  duplicateGroups: readonly ClipDuplicateGroupV1[];
}>;
