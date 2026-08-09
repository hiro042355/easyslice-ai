export {
  CLIP_FINAL_SELECTION_POLICY_V1,
  CLIP_SELECTION_POLICY_VERSION,
} from "./clipSelectionPolicy";
export type { ClipFinalSelectionPolicyV1 } from "./clipSelectionPolicy";

export {
  createUnifiedClipCandidate,
  createUnifiedClipCandidatePool,
  selectLegacyFinalClips,
} from "./unifiedClipCandidatePool";

export {
  UNIFIED_CLIP_CANDIDATE_VERSION,
} from "./types";
export type {
  ClipCandidateBoundaryReason,
  ClipCandidateInputV1,
  ClipCandidateSourceType,
  LegacyClipCandidateV1,
  UnifiedClipCandidateV1,
} from "./types";
