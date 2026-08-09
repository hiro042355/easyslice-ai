import type { UnifiedClipCandidateV1 } from "../clipCandidates";
import {
  CLIP_QUALITY_VERSION,
  type ClipQualityDimensionScoresV1,
  type ClipQualityReasonCodeV1,
  type ClipQualityScoreV1,
} from "./types";

export const CLIP_QUALITY_WEIGHTS_V1 = Object.freeze({
  hookStrength: 0.2,
  storyCompleteness: 0.24,
  standaloneValue: 0.18,
  payoffStrength: 0.16,
  informationDensity: 0.12,
  boundaryQuality: 0.1,
});

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const textOf = (candidate: UnifiedClipCandidateV1) => candidate.transcriptText?.trim() ?? "";
const startsQuestion = (text: string) => /^[^。.!！]{0,160}[?？]/u.test(text);
const startsContrast = (text: string) => /^(?:でも|しかし|実は|ところが|but\b|however\b|actually\b)/iu.test(text);
const startsDependent = (text: string) => /^(?:そして|それで|その|これ|あれ|また|so\b|and\b|then\b|this\b|that\b)/iu.test(text);
const endsComplete = (text: string) => /[。！？.!?]$/u.test(text);

export const scoreClipQualityV1 = (
  candidate: UnifiedClipCandidateV1
): ClipQualityScoreV1 => {
  const text = textOf(candidate);
  const question = startsQuestion(text);
  const contrast = startsContrast(text);
  const dependent = startsDependent(text);
  const complete = endsComplete(text);
  const sourceScore = candidate.sourceScore === undefined
    ? 50
    : Math.max(50, clampScore(candidate.sourceScore * 10));
  const hookStrength = clampScore(
    question ? 95 : contrast ? 85 : text.length > 0 && text.length <= 80 ? Math.max(60, sourceScore) : sourceScore
  );
  const storyCompleteness = candidate.storyReason === "question-answer-completion"
    ? 100
    : candidate.storyReason === "payoff-completion"
      ? 98
      : candidate.storyReason === "semantic-completion"
        ? 90
        : candidate.storyReason === "story-insufficient-fallback"
          ? 25
          : complete
            ? 70
            : 50;
  const standaloneValue = candidate.storyReason === "question-answer-completion"
    ? 100
    : dependent
      ? 25
      : question
        ? 20
        : complete
          ? 80
          : text.length === 0
            ? 50
            : 45;
  const payoffStrength = candidate.storyReason === "payoff-completion"
    ? 100
    : candidate.storyReason === "question-answer-completion"
      ? 90
      : candidate.storyReason === "semantic-completion"
        ? 60
        : 35;
  const density = text.length === 0 || candidate.duration <= 0
    ? 50
    : clampScore((text.replace(/\s/gu, "").length / candidate.duration) * 22);
  const boundaryQuality = candidate.endReason === "payoff-completion" ||
    candidate.endReason === "question-answer-completion"
    ? 100
    : candidate.endReason === "semantic-completion"
      ? 95
      : candidate.endReason === "adaptive-evidence"
        ? 70
        : candidate.endReason === "adaptive-target" ||
            candidate.storyReason === "story-insufficient-fallback"
          ? 30
          : 55;
  const dimensions: ClipQualityDimensionScoresV1 = Object.freeze({
    hookStrength,
    storyCompleteness,
    standaloneValue,
    payoffStrength,
    informationDensity: density,
    boundaryQuality,
  });
  const overall = clampScore(
    dimensions.hookStrength * CLIP_QUALITY_WEIGHTS_V1.hookStrength +
    dimensions.storyCompleteness * CLIP_QUALITY_WEIGHTS_V1.storyCompleteness +
    dimensions.standaloneValue * CLIP_QUALITY_WEIGHTS_V1.standaloneValue +
    dimensions.payoffStrength * CLIP_QUALITY_WEIGHTS_V1.payoffStrength +
    dimensions.informationDensity * CLIP_QUALITY_WEIGHTS_V1.informationDensity +
    dimensions.boundaryQuality * CLIP_QUALITY_WEIGHTS_V1.boundaryQuality
  );
  const reasons: ClipQualityReasonCodeV1[] = [];
  if (question) reasons.push("strong-question-hook");
  if (contrast) reasons.push("strong-contrast-hook");
  if (storyCompleteness >= 90) reasons.push("complete-story-unit");
  if (candidate.storyReason === "question-answer-completion") reasons.push("contains-answer");
  if (candidate.storyReason === "payoff-completion") reasons.push("payoff-complete");
  if (standaloneValue >= 80) reasons.push("self-contained");
  if (density >= 70) reasons.push("dense-information");
  if (boundaryQuality >= 90) reasons.push("strong-boundary");
  if (dependent) reasons.push("weak-context-start");
  if (question && candidate.storyReason !== "question-answer-completion") reasons.push("unresolved-question");
  if (boundaryQuality <= 30) reasons.push("fallback-end");
  if (density < 30) reasons.push("low-information-density");
  if (storyCompleteness <= 25) reasons.push("incomplete-story");
  return Object.freeze({
    qualityVersion: CLIP_QUALITY_VERSION,
    stableCandidateId: candidate.stableCandidateId,
    dimensions,
    overall,
    reasonCodes: Object.freeze(reasons),
  });
};
