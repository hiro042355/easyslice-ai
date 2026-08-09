import { CLIP_EDIT_PLAN_VERSION, type ClipEditInputV1, type ClipEditPlanV1, type ClipEditReasonCodeV1, type ClipEditSegmentV1, type ClipHookDecisionV1, type ClipRemovalDecisionV1, type ClipTimedTextV1 } from "./types";

export const CLIP_EDIT_POLICY_V1 = Object.freeze({ hookWindowSeconds: 10, maximumHookShiftSeconds: 5, removableGapSeconds: 0.6, preservedPauseSeconds: 0.4, maximumRemovedRatio: 0.2, minimumFinalDurationSeconds: 15 });
const fillers = /^(?:えー+|えっと+|あの+|その+|まあ+|um+|uh+|erm+)[、,。.！!？?\s]*$/iu;
const strongHook = /[?？]|^(?:でも|しかし|実は|ところが|but\b|however\b|actually\b)/iu;
const weakContext = /^(?:これ|それ|あれ|この|その|彼|彼女|they\b|this\b|that\b|it\b)/iu;

const round = (value: number) => Math.round(value * 1000) / 1000;
const freeze = <T>(values: T[]) => Object.freeze(values);
const relevant = (input: ClipEditInputV1) => input.subtitles
  .filter((item) => item.end > input.start && item.start < input.end)
  .map((item) => Object.freeze({ ...item, start: Math.max(input.start, item.start), end: Math.min(input.end, item.end) }))
  .sort((a, b) => a.start - b.start || a.end - b.end);

const decideHook = (input: ClipEditInputV1, subtitles: readonly ClipTimedTextV1[]): ClipHookDecisionV1 => {
  const policy = input.policy ?? CLIP_EDIT_POLICY_V1;
  const original = subtitles[0];
  if (!original || !fillers.test(original.text.trim())) return Object.freeze({ action: "keep-original-start", originalStart: input.start, editedStart: input.start, shiftSeconds: 0, reason: "original-hook-strong" });
  const candidate = subtitles.find((item, index) => index > 0 && item.start - input.start <= policy.hookWindowSeconds && item.start - input.start <= policy.maximumHookShiftSeconds && !fillers.test(item.text.trim()));
  if (!candidate || candidate.storyCritical || weakContext.test(candidate.text.trim())) return Object.freeze({ action: "keep-original-start", originalStart: input.start, editedStart: input.start, shiftSeconds: 0, reason: "hook-change-rejected-context-risk" });
  const action = strongHook.test(candidate.text.trim()) ? "start-at-stronger-utterance" : "trim-weak-lead-in";
  return Object.freeze({ action, originalStart: input.start, editedStart: candidate.start, shiftSeconds: round(candidate.start - input.start), reason: action === "start-at-stronger-utterance" ? "stronger-utterance-start" : "trimmed-weak-lead-in" });
};

export const createClipEditPlanV1 = (input: ClipEditInputV1): ClipEditPlanV1 => {
  if (!Number.isFinite(input.start) || !Number.isFinite(input.end) || input.end <= input.start) throw new Error("invalid-clip-boundary");
  const subtitles = relevant(input);
  const policy = input.policy ?? CLIP_EDIT_POLICY_V1;
  const hookDecision = decideHook(input, subtitles);
  const removalDecisions: ClipRemovalDecisionV1[] = [];
  if (!input.contiguousOnly) for (let index = 1; index < subtitles.length; index += 1) {
    const previous = subtitles[index - 1]!; const current = subtitles[index]!;
    const gap = current.start - previous.end;
    if (gap > policy.removableGapSeconds) removalDecisions.push({ kind: "subtitle-gap", sourceStart: round(previous.end + policy.preservedPauseSeconds), sourceEnd: current.start, removedDuration: round(gap - policy.preservedPauseSeconds), applied: true, reason: "long-pause-compressed" });
    if (fillers.test(current.text.trim())) removalDecisions.push({ kind: "isolated-filler", sourceStart: current.start, sourceEnd: current.end, removedDuration: round(current.end - current.start), applied: !current.storyCritical, reason: current.storyCritical ? "removal-rejected-story-risk" : "isolated-filler-removed" });
  }
  const originalDuration = input.end - input.start;
  const proposed = hookDecision.shiftSeconds + removalDecisions.reduce((sum, item) => sum + item.removedDuration, 0);
  const limit = Math.min(originalDuration * policy.maximumRemovedRatio, Math.max(0, originalDuration - policy.minimumFinalDurationSeconds));
  if (proposed > limit) for (const item of removalDecisions) Object.assign(item, { applied: false, reason: "removal-rejected-ratio-limit" as ClipEditReasonCodeV1 });
  const removedIntervals = removalDecisions.filter((item) => item.applied).sort((left, right) => left.sourceStart - right.sourceStart);
  const retained: Array<{ start: number; end: number }> = [];
  let cursor = hookDecision.editedStart;
  for (const removal of removedIntervals) { if (removal.sourceStart > cursor) retained.push({ start: cursor, end: removal.sourceStart }); cursor = Math.max(cursor, removal.sourceEnd); }
  if (cursor < input.end) retained.push({ start: cursor, end: input.end });
  let outputCursor = 0;
  const segments: ClipEditSegmentV1[] = retained.map((segment, index) => { const duration = segment.end - segment.start; const mapped = Object.freeze({ sourceStart: round(segment.start), sourceEnd: round(segment.end), outputStart: round(outputCursor), outputEnd: round(outputCursor + duration), role: index === 0 ? "hook" as const : "retained" as const }); outputCursor += duration; return mapped; });
  const removedDuration = round(originalDuration - outputCursor);
  const reasons = freeze([hookDecision.reason, ...removalDecisions.map((item) => item.reason)]);
  return Object.freeze({ version: CLIP_EDIT_PLAN_VERSION, originalStart: input.start, originalEnd: input.end, outputDuration: round(outputCursor), segments: freeze(segments), hookDecision, removalDecisions: freeze(removalDecisions.map((item) => Object.freeze(item))), timingMap: freeze([...segments]), evidence: Object.freeze({ originalDuration: round(originalDuration), finalDuration: round(outputCursor), removedDuration, removedRatio: round(removedDuration / originalDuration), hookAction: hookDecision.action, removalCount: removalDecisions.filter((item) => item.applied).length, reasonCodes: reasons }) });
};

export const remapTimedTextV1 = (items: readonly ClipTimedTextV1[], plan: ClipEditPlanV1): readonly ClipTimedTextV1[] => freeze(items.flatMap((item) => plan.timingMap.flatMap((mapping) => { const start = Math.max(item.start, mapping.sourceStart); const end = Math.min(item.end, mapping.sourceEnd); return end <= start ? [] : [Object.freeze({ ...item, start: round(mapping.outputStart + start - mapping.sourceStart), end: round(mapping.outputStart + end - mapping.sourceStart) })]; })));
