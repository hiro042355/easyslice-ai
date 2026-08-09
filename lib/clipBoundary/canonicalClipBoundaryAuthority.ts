export const CLIP_BOUNDARY_DECISION_VERSION = "1.0" as const;

export type ClipBoundaryCandidateKind =
  | "subtitle-highlight"
  | "summary-highlight"
  | "audio-energy"
  | "requested-range";

export type ClipBoundaryEvidenceKind =
  | "subtitle-timing"
  | "audio-window"
  | "explicit-ai-end"
  | "requested-end";

export type ClipBoundaryEvidence = Readonly<{
  kind: ClipBoundaryEvidenceKind;
  second: number;
}>;
export type AdaptiveClipDurationPolicyV1 = Readonly<{ minimumSeconds: number; preferredSeconds: number; maximumSeconds: number }>;

export type CanonicalClipBoundaryInput = Readonly<{
  candidateKind: ClipBoundaryCandidateKind;
  anchorSecond: number;
  sourceDurationSeconds?: number;
  evidence?: readonly ClipBoundaryEvidence[];
  storySegments?: readonly ClipStorySegmentV1[];
  adaptiveDurationPolicy?: AdaptiveClipDurationPolicyV1;
}>;

export type ClipBoundaryDecision = Readonly<{
  decisionVersion: typeof CLIP_BOUNDARY_DECISION_VERSION;
  start: number;
  end: number;
  duration: number;
  endAuthority:
    | "requested-end"
    | "adaptive-evidence"
    | "source-duration"
    | "adaptive-target";
  selectedEvidenceKind?: ClipBoundaryEvidenceKind;
  startReason:
    | "candidate-anchor"
    | "candidate-lead-in"
    | "story-utterance-start"
    | "source-boundary";
  endReason:
    | "requested-end"
    | "adaptive-evidence"
    | "source-duration"
    | "adaptive-target"
    | StoryBoundaryReasonV1;
  storyReason?: StoryBoundaryReasonV1 | "story-insufficient-fallback";
  storyEvidenceVersion?: "1.0";
}>;

export const DEFAULT_ADAPTIVE_CLIP_DURATION_POLICY_V1 = Object.freeze({ minimumSeconds: 15, preferredSeconds: 30, maximumSeconds: 60 });
const MAX_START_REFINEMENT_SECONDS = 5;

const START_LEAD_IN_SECONDS: Readonly<Record<ClipBoundaryCandidateKind, number>> = {
  "subtitle-highlight": 0,
  "summary-highlight": 5,
  "audio-energy": 3,
  "requested-range": 0,
};

const normalizeNonNegativeSecond = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const normalizeSourceDuration = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;

const compareEvidence = (
  targetEnd: number,
  left: ClipBoundaryEvidence,
  right: ClipBoundaryEvidence
) => {
  const distance = Math.abs(left.second - targetEnd) - Math.abs(right.second - targetEnd);
  if (distance !== 0) return distance;
  if (left.second !== right.second) return left.second - right.second;
  return left.kind.localeCompare(right.kind);
};

const STORY_REASON_PRIORITY: Readonly<Record<StoryBoundaryReasonV1, number>> = {
  "payoff-completion": 1,
  "question-answer-completion": 2,
  "semantic-completion": 3,
  "story-boundary": 4,
};

const compareStoryCandidates = (
  targetEnd: number,
  left: StoryBoundaryCandidateV1,
  right: StoryBoundaryCandidateV1
) => {
  const priority = STORY_REASON_PRIORITY[left.reason] - STORY_REASON_PRIORITY[right.reason];
  if (priority !== 0) return priority;
  const distance = Math.abs(left.endSeconds - targetEnd) - Math.abs(right.endSeconds - targetEnd);
  if (distance !== 0) return distance;
  return left.endSeconds - right.endSeconds;
};

export const decideCanonicalClipBoundary = (
  input: CanonicalClipBoundaryInput
): ClipBoundaryDecision => {
  const sourceDuration = normalizeSourceDuration(input.sourceDurationSeconds);
  const anchor = normalizeNonNegativeSecond(input.anchorSecond);
  const unclampedStart = Math.max(0, anchor - START_LEAD_IN_SECONDS[input.candidateKind]);
  const adaptiveStart = sourceDuration === undefined
    ? unclampedStart
    : Math.min(unclampedStart, Math.max(0, sourceDuration - 1));
  const storyEvidence = buildClipStoryEvidenceV1(
    input.storySegments ?? [],
    sourceDuration
  );
  const containingStartUnit = storyEvidence.units.find(
    (unit) => unit.startSeconds <= adaptiveStart && unit.endSeconds > adaptiveStart
  );
  const refinedStart = containingStartUnit?.startSeconds;
  const start =
    refinedStart !== undefined &&
    adaptiveStart - refinedStart <= MAX_START_REFINEMENT_SECONDS
      ? refinedStart
      : adaptiveStart;
  const startReason: ClipBoundaryDecision["startReason"] =
    start !== adaptiveStart
      ? "story-utterance-start"
      : sourceDuration !== undefined && adaptiveStart !== unclampedStart
        ? "source-boundary"
        : START_LEAD_IN_SECONDS[input.candidateKind] > 0
          ? "candidate-lead-in"
          : "candidate-anchor";
  const evidence = (input.evidence ?? []).filter(
    (item) => Number.isFinite(item.second) && item.second > start
  );
  const requestedEnd = evidence
    .filter((item) => item.kind === "requested-end")
    .sort((left, right) => left.second - right.second)[0];
  const explicitAiEnd = evidence
    .filter((item) => item.kind === "explicit-ai-end")
    .sort((left, right) => left.second - right.second)
    .find((item) =>
      storyEvidence.boundaryCandidates.some(
        (candidate) => Math.abs(candidate.endSeconds - item.second) < 0.001
      )
    );

  if (explicitAiEnd) {
    const matchingStoryCandidate = storyEvidence.boundaryCandidates.find(
      (candidate) => Math.abs(candidate.endSeconds - explicitAiEnd.second) < 0.001
    );
    const end = sourceDuration === undefined
      ? explicitAiEnd.second
      : Math.min(explicitAiEnd.second, sourceDuration);
    return Object.freeze({
      decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
      start,
      end,
      duration: end - start,
      endAuthority: "adaptive-evidence",
      selectedEvidenceKind: explicitAiEnd.kind,
      startReason,
      endReason: matchingStoryCandidate?.reason ?? "story-boundary",
      storyReason: matchingStoryCandidate?.reason ?? "story-boundary",
      storyEvidenceVersion: storyEvidence.storyEvidenceVersion,
    });
  }

  if (requestedEnd) {
    const end = sourceDuration === undefined
      ? requestedEnd.second
      : Math.min(requestedEnd.second, sourceDuration);
    const safeEnd = end > start ? end : start + 1;
    return Object.freeze({
      decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
      start,
      end: safeEnd,
      duration: safeEnd - start,
      endAuthority: "requested-end",
      selectedEvidenceKind: requestedEnd.kind,
      startReason,
      endReason: "requested-end",
    });
  }

  const durationPolicy = input.adaptiveDurationPolicy ?? DEFAULT_ADAPTIVE_CLIP_DURATION_POLICY_V1;
  const targetEnd = start + durationPolicy.preferredSeconds;
  const maximumEnd = sourceDuration === undefined
    ? start + durationPolicy.maximumSeconds
    : Math.min(start + durationPolicy.maximumSeconds, sourceDuration);
  const minimumEnd = Math.min(start + durationPolicy.minimumSeconds, maximumEnd);
  const storyCandidate = storyEvidence.boundaryCandidates
    .filter(
      (candidate) =>
        candidate.endSeconds >= minimumEnd && candidate.endSeconds <= maximumEnd
    )
    .sort((left, right) => compareStoryCandidates(targetEnd, left, right))[0];

  if (storyCandidate) {
    return Object.freeze({
      decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
      start,
      end: storyCandidate.endSeconds,
      duration: storyCandidate.endSeconds - start,
      endAuthority: "adaptive-evidence",
      selectedEvidenceKind: "subtitle-timing",
      startReason,
      endReason: storyCandidate.reason,
      storyReason: storyCandidate.reason,
      storyEvidenceVersion: storyEvidence.storyEvidenceVersion,
    });
  }
  const adaptiveEvidence = evidence
    .filter(
      (item) =>
        item.kind !== "requested-end" &&
        item.second >= minimumEnd &&
        item.second <= maximumEnd
    )
    .sort((left, right) => compareEvidence(targetEnd, left, right))[0];

  if (adaptiveEvidence) {
    return Object.freeze({
      decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
      start,
      end: adaptiveEvidence.second,
      duration: adaptiveEvidence.second - start,
      endAuthority: "adaptive-evidence",
      selectedEvidenceKind: adaptiveEvidence.kind,
      startReason,
      endReason: "adaptive-evidence",
      ...(storyEvidence.units.length > 0
        ? {
            storyReason: "story-insufficient-fallback" as const,
            storyEvidenceVersion: storyEvidence.storyEvidenceVersion,
          }
        : {}),
    });
  }

  if (sourceDuration !== undefined && sourceDuration <= targetEnd) {
    const end = Math.max(start, sourceDuration);
    return Object.freeze({
      decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
      start,
      end,
      duration: end - start,
      endAuthority: "source-duration",
      startReason,
      endReason: "source-duration",
      ...(storyEvidence.units.length > 0
        ? {
            storyReason: "story-insufficient-fallback" as const,
            storyEvidenceVersion: storyEvidence.storyEvidenceVersion,
          }
        : {}),
    });
  }

  const end = Math.min(targetEnd, maximumEnd);
  return Object.freeze({
    decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
    start,
    end,
    duration: end - start,
    endAuthority: "adaptive-target",
    startReason,
    endReason: "adaptive-target",
    ...(storyEvidence.units.length > 0
      ? {
          storyReason: "story-insufficient-fallback" as const,
          storyEvidenceVersion: storyEvidence.storyEvidenceVersion,
        }
      : {}),
  });
};
import { buildClipStoryEvidenceV1 } from "./storyBoundaryDetector";
import type {
  ClipStorySegmentV1,
  StoryBoundaryCandidateV1,
  StoryBoundaryReasonV1,
} from "./storyBoundaryTypes";
