export const CLIP_EDIT_PLAN_VERSION = "1.0" as const;

export type ClipEditSegmentRoleV1 = "hook" | "context" | "development" | "payoff" | "retained" | "transition";
export type ClipHookActionV1 = "keep-original-start" | "trim-weak-lead-in" | "start-at-stronger-utterance";
export type ClipEditReasonCodeV1 =
  | "original-hook-strong" | "trimmed-weak-lead-in" | "stronger-utterance-start"
  | "hook-change-rejected-context-risk" | "leading-silence" | "trailing-silence"
  | "long-pause-compressed" | "isolated-filler-removed"
  | "removal-rejected-story-risk" | "removal-rejected-ratio-limit";

export type ClipTimedTextV1 = Readonly<{ start: number; end: number; text: string; storyCritical?: boolean }>;
export type ClipEditingPolicyV1 = Readonly<{ hookWindowSeconds: number; maximumHookShiftSeconds: number; removableGapSeconds: number; preservedPauseSeconds: number; maximumRemovedRatio: number; minimumFinalDurationSeconds: number }>;
export type ClipEditSegmentV1 = Readonly<{ sourceStart: number; sourceEnd: number; outputStart: number; outputEnd: number; role: ClipEditSegmentRoleV1 }>;
export type ClipTimelineMappingV1 = ClipEditSegmentV1;
export type ClipHookDecisionV1 = Readonly<{ action: ClipHookActionV1; originalStart: number; editedStart: number; shiftSeconds: number; reason: ClipEditReasonCodeV1 }>;
export type ClipRemovalDecisionV1 = Readonly<{ kind: "subtitle-gap" | "isolated-filler"; sourceStart: number; sourceEnd: number; removedDuration: number; applied: boolean; reason: ClipEditReasonCodeV1 }>;
export type ClipEditEvidenceV1 = Readonly<{ originalDuration: number; finalDuration: number; removedDuration: number; removedRatio: number; hookAction: ClipHookActionV1; removalCount: number; reasonCodes: readonly ClipEditReasonCodeV1[] }>;
export type ClipEditPlanV1 = Readonly<{ version: typeof CLIP_EDIT_PLAN_VERSION; originalStart: number; originalEnd: number; outputDuration: number; segments: readonly ClipEditSegmentV1[]; hookDecision: ClipHookDecisionV1; removalDecisions: readonly ClipRemovalDecisionV1[]; timingMap: readonly ClipTimelineMappingV1[]; evidence: ClipEditEvidenceV1 }>;

export type ClipEditInputV1 = Readonly<{ start: number; end: number; subtitles: readonly ClipTimedTextV1[]; storyReason?: string; contiguousOnly?: boolean; policy?: ClipEditingPolicyV1 }>;
