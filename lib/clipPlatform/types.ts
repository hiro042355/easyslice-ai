import type { AdaptiveClipDurationPolicyV1 } from "../clipBoundary";
import type { ClipEditingPolicyV1 } from "../clipEditing";
import type { ClipQualityScoreV1, ClipQualityScoreV2 } from "../clipRanking";

export const CLIP_PLATFORM_PROFILE_VERSION = "1.0" as const;
export type ClipPlatformTargetV1 = "youtube-shorts" | "tiktok" | "instagram-reels" | "generic-short";
export type ClipPlatformQualityWeightsV1 = Readonly<{ hookStrength: number; storyCompleteness: number; standaloneValue: number; payoffStrength: number; informationDensity: number; boundaryQuality: number; sourceContextRelevance: number }>;
export type ClipPlatformPortfolioWeightsV1 = Readonly<{ quality: number; diversity: number; sourceContext: number }>;
export type ClipPlatformReasonCodeV1 = "shorts-story-priority" | "tiktok-hook-priority" | "reels-balanced-priority" | "generic-compatible" | "duration-profile-applied" | "hook-profile-applied";
export type ClipPlatformProfileV1 = Readonly<{ version: typeof CLIP_PLATFORM_PROFILE_VERSION; target: ClipPlatformTargetV1; durationPolicy: AdaptiveClipDurationPolicyV1; qualityWeights: ClipPlatformQualityWeightsV1; portfolioWeights: ClipPlatformPortfolioWeightsV1; hookPolicy: Readonly<{ hookWindowSeconds: number; maxStartShiftSeconds: number; allowWeakLeadTrim: true; contextProtectionLevel: "strict" }>; editingPolicy: ClipEditingPolicyV1; reasonCodes: readonly ClipPlatformReasonCodeV1[] }>;
export type PlatformAwareClipQualityV1 = Readonly<{ platformTarget: ClipPlatformTargetV1; platformProfileVersion: typeof CLIP_PLATFORM_PROFILE_VERSION; baseQuality: ClipQualityScoreV2; platformAdjustedQuality: number; appliedWeightProfile: ClipPlatformQualityWeightsV1 }>;
export type PlatformAwarePortfolioItemV1 = Readonly<{ stableCandidateId: string; platformTarget: ClipPlatformTargetV1; platformAdjustedPortfolioScore: number; platformReasonCodes: readonly ClipPlatformReasonCodeV1[]; baseQuality: ClipQualityScoreV1 }>;
