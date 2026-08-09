import {
  CLIP_STORY_EVIDENCE_VERSION,
  type ClipStoryEvidenceV1,
  type ClipStorySegmentV1,
  type StoryBoundaryCandidateV1,
  type StoryEvidenceTypeV1,
  type StoryRoleV1,
  type StoryUnitV1,
} from "./storyBoundaryTypes";

const COMPLETE_PUNCTUATION = /[。！？.!?]$/u;
const QUESTION_PUNCTUATION = /[？?]$/u;
const JAPANESE_CONTRAST = /^(?:でも|しかし|実は|ところが)(?:[、,\s]|$)/u;
const JAPANESE_CONCLUSION = /^(?:だから|結局)(?:[、,\s]|$)/u;
const ENGLISH_CONTRAST = /^(?:but|however|actually)(?:\b|[,;:])/iu;
const ENGLISH_CONCLUSION = /^(?:so|therefore|the point is)(?:\b|[,;:])/iu;

const freezeList = <T>(values: readonly T[]) => Object.freeze([...values]);

const isComplete = (text: string) => COMPLETE_PUNCTUATION.test(text.trim());
const isQuestion = (text: string) => QUESTION_PUNCTUATION.test(text.trim());
const isContrast = (text: string) =>
  JAPANESE_CONTRAST.test(text.trim()) || ENGLISH_CONTRAST.test(text.trim());
const isConclusion = (text: string) =>
  JAPANESE_CONCLUSION.test(text.trim()) || ENGLISH_CONCLUSION.test(text.trim());

const classifyUnit = (text: string): Readonly<{
  evidenceType: StoryEvidenceTypeV1;
  role: StoryRoleV1;
}> => {
  if (isQuestion(text)) {
    return { evidenceType: "question", role: "hook-candidate" };
  }
  if (isConclusion(text) && isComplete(text)) {
    return { evidenceType: "conclusion", role: "payoff-candidate" };
  }
  if (isContrast(text)) {
    return { evidenceType: "contrast", role: "development" };
  }
  if (isComplete(text)) {
    return { evidenceType: "completion", role: "completion" };
  }
  return { evidenceType: "statement", role: "context" };
};

export const buildClipStoryEvidenceV1 = (
  segments: readonly ClipStorySegmentV1[],
  sourceDurationSeconds?: number
): ClipStoryEvidenceV1 => {
  const normalized = segments
    .map((segment, segmentIndex) => ({
      segmentIndex,
      startSeconds: Number(segment.startSeconds),
      text: String(segment.text ?? "").trim(),
    }))
    .filter(
      (segment) =>
        Number.isFinite(segment.startSeconds) &&
        segment.startSeconds >= 0 &&
        segment.text.length > 0
    )
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds || left.segmentIndex - right.segmentIndex
    );

  const units: StoryUnitV1[] = normalized.map((segment, index) => {
    const nextStart = normalized[index + 1]?.startSeconds;
    const sourceEnd =
      sourceDurationSeconds !== undefined &&
      Number.isFinite(sourceDurationSeconds) &&
      sourceDurationSeconds > segment.startSeconds
        ? sourceDurationSeconds
        : undefined;
    const endSeconds = nextStart ?? sourceEnd ?? segment.startSeconds;
    const classification = classifyUnit(segment.text);
    return Object.freeze({
      startSeconds: segment.startSeconds,
      endSeconds,
      text: segment.text,
      evidenceType: classification.evidenceType,
      role: classification.role,
      segmentIndexes: freezeList([segment.segmentIndex]),
    });
  });

  const boundaryCandidates: StoryBoundaryCandidateV1[] = [];
  units.forEach((unit, index) => {
    if (unit.endSeconds <= unit.startSeconds) return;

    if (unit.evidenceType === "conclusion") {
      boundaryCandidates.push(Object.freeze({
        endSeconds: unit.endSeconds,
        reason: "payoff-completion",
        role: "payoff-candidate",
        segmentIndexes: freezeList(unit.segmentIndexes),
      }));
      return;
    }

    if (unit.evidenceType === "completion") {
      const previous = units[index - 1];
      const questionAnswer = previous?.evidenceType === "question";
      const afterTurn = previous?.evidenceType === "contrast";
      boundaryCandidates.push(Object.freeze({
        endSeconds: unit.endSeconds,
        reason: questionAnswer
          ? "question-answer-completion"
          : afterTurn
            ? "payoff-completion"
            : "semantic-completion",
        role: questionAnswer || afterTurn ? "payoff-candidate" : "completion",
        segmentIndexes: freezeList([
          ...(questionAnswer || afterTurn ? previous.segmentIndexes : []),
          ...unit.segmentIndexes,
        ]),
      }));
    }
  });

  return Object.freeze({
    storyEvidenceVersion: CLIP_STORY_EVIDENCE_VERSION,
    units: freezeList(units),
    boundaryCandidates: freezeList(boundaryCandidates),
  });
};
