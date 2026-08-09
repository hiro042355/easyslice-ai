export {
  CLIP_BOUNDARY_DECISION_VERSION,
  decideCanonicalClipBoundary,
} from "./canonicalClipBoundaryAuthority";

export { buildClipStoryEvidenceV1 } from "./storyBoundaryDetector";

export type {
  CanonicalClipBoundaryInput,
  ClipBoundaryCandidateKind,
  ClipBoundaryDecision,
  ClipBoundaryEvidence,
  ClipBoundaryEvidenceKind,
} from "./canonicalClipBoundaryAuthority";

export {
  CLIP_STORY_EVIDENCE_VERSION,
} from "./storyBoundaryTypes";

export type {
  ClipStoryEvidenceV1,
  ClipStorySegmentV1,
  StoryBoundaryCandidateV1,
  StoryBoundaryReasonV1,
  StoryEvidenceTypeV1,
  StoryRoleV1,
  StoryUnitV1,
} from "./storyBoundaryTypes";
