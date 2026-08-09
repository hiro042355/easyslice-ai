export const CLIP_STORY_EVIDENCE_VERSION = "1.0" as const;

export type StoryRoleV1 =
  | "hook-candidate"
  | "context"
  | "development"
  | "payoff-candidate"
  | "completion";

export type StoryBoundaryReasonV1 =
  | "semantic-completion"
  | "question-answer-completion"
  | "payoff-completion"
  | "story-boundary";

export type StoryEvidenceTypeV1 =
  | "statement"
  | "question"
  | "contrast"
  | "conclusion"
  | "completion";

export type ClipStorySegmentV1 = Readonly<{
  startSeconds: number;
  text: string;
}>;

export type StoryUnitV1 = Readonly<{
  startSeconds: number;
  endSeconds: number;
  text: string;
  evidenceType: StoryEvidenceTypeV1;
  role: StoryRoleV1;
  segmentIndexes: readonly number[];
}>;

export type StoryBoundaryCandidateV1 = Readonly<{
  endSeconds: number;
  reason: StoryBoundaryReasonV1;
  role: StoryRoleV1;
  segmentIndexes: readonly number[];
}>;

export type ClipStoryEvidenceV1 = Readonly<{
  storyEvidenceVersion: typeof CLIP_STORY_EVIDENCE_VERSION;
  units: readonly StoryUnitV1[];
  boundaryCandidates: readonly StoryBoundaryCandidateV1[];
}>;
