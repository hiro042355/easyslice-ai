export const CLIP_BOUNDARY_DECISION_VERSION = "1.0" as const;

export type ClipBoundaryCandidateKind =
  | "subtitle-highlight"
  | "summary-highlight"
  | "audio-energy"
  | "requested-range";

export type ClipBoundaryEvidenceKind =
  | "subtitle-timing"
  | "audio-window"
  | "requested-end";

export type ClipBoundaryEvidence = Readonly<{
  kind: ClipBoundaryEvidenceKind;
  second: number;
}>;

export type CanonicalClipBoundaryInput = Readonly<{
  candidateKind: ClipBoundaryCandidateKind;
  anchorSecond: number;
  sourceDurationSeconds?: number;
  evidence?: readonly ClipBoundaryEvidence[];
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
}>;

const MIN_ADAPTIVE_DURATION_SECONDS = 15;
const TARGET_ADAPTIVE_DURATION_SECONDS = 30;
const MAX_ADAPTIVE_DURATION_SECONDS = 60;

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

export const decideCanonicalClipBoundary = (
  input: CanonicalClipBoundaryInput
): ClipBoundaryDecision => {
  const sourceDuration = normalizeSourceDuration(input.sourceDurationSeconds);
  const anchor = normalizeNonNegativeSecond(input.anchorSecond);
  const unclampedStart = Math.max(0, anchor - START_LEAD_IN_SECONDS[input.candidateKind]);
  const start = sourceDuration === undefined
    ? unclampedStart
    : Math.min(unclampedStart, Math.max(0, sourceDuration - 1));
  const evidence = (input.evidence ?? []).filter(
    (item) => Number.isFinite(item.second) && item.second > start
  );
  const requestedEnd = evidence
    .filter((item) => item.kind === "requested-end")
    .sort((left, right) => left.second - right.second)[0];

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
    });
  }

  const targetEnd = start + TARGET_ADAPTIVE_DURATION_SECONDS;
  const maximumEnd = sourceDuration === undefined
    ? start + MAX_ADAPTIVE_DURATION_SECONDS
    : Math.min(start + MAX_ADAPTIVE_DURATION_SECONDS, sourceDuration);
  const minimumEnd = Math.min(start + MIN_ADAPTIVE_DURATION_SECONDS, maximumEnd);
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
    });
  }

  const end = Math.min(targetEnd, maximumEnd);
  return Object.freeze({
    decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
    start,
    end,
    duration: end - start,
    endAuthority: "adaptive-target",
  });
};
