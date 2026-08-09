import type { UnifiedClipCandidateV1 } from "../clipCandidates";
import { scoreClipQualityV1 } from "./clipQualityScorer";
import { CLIP_QUALITY_CONTEXT_VERSION, type ClipQualityScoreV2 } from "./types";

export const CLIP_CONTEXT_WEIGHT_V2 = 0.1;
export const scoreClipQualityV2 = (candidate: UnifiedClipCandidateV1): ClipQualityScoreV2 => {
  const baseQuality = scoreClipQualityV1(candidate);
  const relevance = candidate.sourceContextEvidence?.relevance;
  return Object.freeze({
    qualityVersion: CLIP_QUALITY_CONTEXT_VERSION,
    baseQuality,
    ...(relevance === undefined ? {} : { sourceContextRelevance: relevance }),
    overall: relevance === undefined
      ? baseQuality.overall
      : Math.round(baseQuality.overall * (1 - CLIP_CONTEXT_WEIGHT_V2) + relevance * CLIP_CONTEXT_WEIGHT_V2),
  });
};
