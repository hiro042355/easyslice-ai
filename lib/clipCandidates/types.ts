import type { StoryBoundaryReasonV1 } from "../clipBoundary";

export const UNIFIED_CLIP_CANDIDATE_VERSION = "1.0" as const;

export type ClipCandidateSourceType =
  | "subtitle"
  | "summary"
  | "ai-highlight"
  | "audio-energy";

export type ClipCandidateBoundaryReason =
  | "candidate-anchor"
  | "candidate-lead-in"
  | "story-utterance-start"
  | "source-boundary"
  | "requested-end"
  | "adaptive-evidence"
  | "source-duration"
  | "adaptive-target"
  | StoryBoundaryReasonV1;

export type ClipCandidateInputV1 = Readonly<{
  sourceType: ClipCandidateSourceType;
  start: number;
  end: number;
  title?: string;
  reason?: string;
  sourceScore?: number;
  transcriptText?: string;
  segmentIndexes?: readonly number[];
  storyReason?: StoryBoundaryReasonV1 | "story-insufficient-fallback";
  storyEvidenceVersion?: "1.0";
  startReason?: ClipCandidateBoundaryReason;
  endReason?: ClipCandidateBoundaryReason;
}>;

export type UnifiedClipCandidateV1 = Readonly<{
  candidateVersion: typeof UNIFIED_CLIP_CANDIDATE_VERSION;
  stableCandidateId: string;
  sourceType: ClipCandidateSourceType;
  start: number;
  end: number;
  duration: number;
  title?: string;
  reason?: string;
  sourceScore?: number;
  transcriptText?: string;
  segmentIndexes?: readonly number[];
  storyReason?: StoryBoundaryReasonV1 | "story-insufficient-fallback";
  storyEvidenceVersion?: "1.0";
  startReason?: ClipCandidateBoundaryReason;
  endReason?: ClipCandidateBoundaryReason;
}>;

export type LegacyClipCandidateV1 = Readonly<{
  start: string;
  end: string;
  title: string;
  reason: string;
  score: number;
}>;
