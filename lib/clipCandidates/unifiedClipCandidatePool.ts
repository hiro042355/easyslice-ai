import { CLIP_FINAL_SELECTION_POLICY_V1 } from "./clipSelectionPolicy";
import {
  UNIFIED_CLIP_CANDIDATE_VERSION,
  type ClipCandidateInputV1,
  type ClipCandidateSourceType,
  type LegacyClipCandidateV1,
  type UnifiedClipCandidateV1,
} from "./types";

const SOURCE_ORDER: readonly ClipCandidateSourceType[] = [
  "subtitle",
  "summary",
  "ai-highlight",
  "audio-energy",
];

const normalizeText = (value: string | undefined) =>
  value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";

const encodeStablePart = (value: string | number) =>
  encodeURIComponent(String(value));

const createStableCandidateId = (input: ClipCandidateInputV1) => {
  const sourceIdentity = input.segmentIndexes?.length
    ? `segments:${input.segmentIndexes.join(",")}`
    : `text:${normalizeText(input.transcriptText ?? input.reason ?? input.title)}`;
  return [
    "clip-candidate-v1",
    input.sourceType,
    sourceIdentity,
    input.start,
    input.end,
  ].map(encodeStablePart).join(":");
};

const copyIndexes = (indexes: readonly number[] | undefined) =>
  indexes === undefined ? undefined : Object.freeze([...indexes]);

export const createUnifiedClipCandidate = (
  input: ClipCandidateInputV1
): UnifiedClipCandidateV1 => {
  if (!Number.isFinite(input.start) || !Number.isFinite(input.end) || input.end <= input.start) {
    throw new TypeError("clip candidate requires finite increasing boundaries");
  }
  return Object.freeze({
    candidateVersion: UNIFIED_CLIP_CANDIDATE_VERSION,
    stableCandidateId: createStableCandidateId(input),
    sourceType: input.sourceType,
    start: input.start,
    end: input.end,
    duration: input.end - input.start,
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.sourceScore === undefined ? {} : { sourceScore: input.sourceScore }),
    ...(input.transcriptText === undefined
      ? {}
      : { transcriptText: input.transcriptText }),
    ...(input.segmentIndexes === undefined
      ? {}
      : { segmentIndexes: copyIndexes(input.segmentIndexes) }),
    ...(input.storyReason === undefined ? {} : { storyReason: input.storyReason }),
    ...(input.storyEvidenceVersion === undefined
      ? {}
      : { storyEvidenceVersion: input.storyEvidenceVersion }),
    ...(input.startReason === undefined ? {} : { startReason: input.startReason }),
    ...(input.endReason === undefined ? {} : { endReason: input.endReason }),
    ...(input.sourceContextEvidence === undefined
      ? {}
      : { sourceContextEvidence: Object.freeze({ ...input.sourceContextEvidence, primaryTerms: Object.freeze([...input.sourceContextEvidence.primaryTerms]), ...(input.sourceContextEvidence.chapter ? { chapter: Object.freeze({ ...input.sourceContextEvidence.chapter }) } : {}) }) }),
  });
};

const comparePoolOrder = (
  left: UnifiedClipCandidateV1,
  right: UnifiedClipCandidateV1
) => left.start - right.start || left.stableCandidateId.localeCompare(right.stableCandidateId);

export const createUnifiedClipCandidatePool = (
  candidates: readonly UnifiedClipCandidateV1[]
): readonly UnifiedClipCandidateV1[] => {
  const queues = new Map(
    SOURCE_ORDER.map((sourceType) => [
      sourceType,
      candidates.filter((candidate) => candidate.sourceType === sourceType).sort(comparePoolOrder),
    ])
  );
  const result: UnifiedClipCandidateV1[] = [];
  let offset = 0;
  while (
    result.length < CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit &&
    SOURCE_ORDER.some((sourceType) => (queues.get(sourceType)?.length ?? 0) > offset)
  ) {
    for (const sourceType of SOURCE_ORDER) {
      const candidate = queues.get(sourceType)?.[offset];
      if (candidate) result.push(candidate);
      if (result.length === CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit) break;
    }
    offset += 1;
  }
  return Object.freeze([...result]);
};

export const selectLegacyFinalClips = (
  candidates: readonly UnifiedClipCandidateV1[]
): readonly LegacyClipCandidateV1[] =>
  Object.freeze(
    candidates
      .slice(0, CLIP_FINAL_SELECTION_POLICY_V1.finalClipCount)
      .map((candidate) => Object.freeze({
        start: String(candidate.start),
        end: String(candidate.end),
        title: candidate.title ?? "",
        reason: candidate.reason ?? "",
        score: candidate.sourceScore ?? 0,
      }))
  );
