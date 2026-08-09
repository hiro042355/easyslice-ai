import type { UnifiedClipCandidateV1 } from "../clipCandidates";
import {
  CLIP_SIMILARITY_VERSION,
  type ClipDuplicateClassificationV1,
  type ClipSimilarityScoreV1,
} from "./types";

export const CLIP_DUPLICATE_THRESHOLD_V1 = 85;
export const CLIP_SIMILAR_THRESHOLD_V1 = 70;

const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100)));
const jaccard = (left: ReadonlySet<string>, right: ReadonlySet<string>) => {
  if (left.size === 0 && right.size === 0) return undefined;
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? undefined : percent(intersection / union);
};

const normalizedText = (value: string | undefined) =>
  value?.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "") ?? "";

const shingles = (value: string) => {
  const size = value.length < 4 ? 2 : 3;
  const result = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  if (value.length > 0 && result.size === 0) result.add(value);
  return result;
};

const classify = (score: number): ClipDuplicateClassificationV1 =>
  score >= CLIP_DUPLICATE_THRESHOLD_V1
    ? "duplicate"
    : score >= CLIP_SIMILAR_THRESHOLD_V1
      ? "similar"
      : "distinct";

export const scoreClipSimilarityV1 = (
  left: UnifiedClipCandidateV1,
  right: UnifiedClipCandidateV1
): ClipSimilarityScoreV1 => {
  const intersection = Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  const temporal = percent(intersection / Math.min(left.duration, right.duration));
  const leftText = normalizedText(left.transcriptText);
  const rightText = normalizedText(right.transcriptText);
  const text = leftText && rightText
    ? jaccard(shingles(leftText), shingles(rightText))
    : undefined;
  const segments = left.segmentIndexes && right.segmentIndexes
    ? jaccard(new Set(left.segmentIndexes.map(String)), new Set(right.segmentIndexes.map(String)))
    : undefined;
  const components = [
    { score: temporal, weight: 0.45 },
    ...(text === undefined ? [] : [{ score: text, weight: 0.4 }]),
    ...(segments === undefined ? [] : [{ score: segments, weight: 0.15 }]),
  ];
  const combined = Math.round(
    components.reduce((sum, component) => sum + component.score * component.weight, 0) /
      components.reduce((sum, component) => sum + component.weight, 0)
  );
  const sameBoundaries = left.start === right.start && left.end === right.end;
  const sameSegments =
    left.segmentIndexes !== undefined &&
    right.segmentIndexes !== undefined &&
    left.segmentIndexes.length > 0 &&
    left.segmentIndexes.length === right.segmentIndexes.length &&
    left.segmentIndexes.every((value, index) => value === right.segmentIndexes?.[index]);
  const nearIdentical =
    Math.abs(left.start - right.start) <= 1 &&
    Math.abs(left.end - right.end) <= 1 &&
    (text ?? 0) >= 90;
  const hardDuplicate =
    left.stableCandidateId === right.stableCandidateId ||
    sameBoundaries ||
    sameSegments ||
    nearIdentical;
  return Object.freeze({
    similarityVersion: CLIP_SIMILARITY_VERSION,
    leftCandidateId: left.stableCandidateId,
    rightCandidateId: right.stableCandidateId,
    temporal,
    ...(text === undefined ? {} : { text }),
    ...(segments === undefined ? {} : { segments }),
    combined: hardDuplicate ? Math.max(CLIP_DUPLICATE_THRESHOLD_V1, combined) : combined,
    classification: hardDuplicate ? "duplicate" : classify(combined),
    hardDuplicate,
  });
};
