import assert from "node:assert/strict";
import test from "node:test";

import { createUnifiedClipCandidate } from "../../lib/clipCandidates";
import {
  CLIP_DUPLICATE_THRESHOLD_V1,
  CLIP_PORTFOLIO_VERSION,
  CLIP_QUALITY_FLOOR_V1,
  CLIP_QUALITY_VERSION,
  CLIP_QUALITY_WEIGHTS_V1,
  CLIP_SIMILAR_THRESHOLD_V1,
  createClipDuplicateGroupsV1,
  projectPortfolioToLegacyClipsV1,
  scoreClipQualityV1,
  scoreClipSimilarityV1,
  selectClipDuplicateRepresentativesV1,
  selectIntelligentClipPortfolioV1,
} from "../../lib/clipRanking";

const makeCandidate = (input: Readonly<{
  start: number;
  end?: number;
  text: string;
  score?: number;
  storyReason?: "semantic-completion" | "question-answer-completion" | "payoff-completion" | "story-insufficient-fallback";
  endReason?: "semantic-completion" | "question-answer-completion" | "payoff-completion" | "adaptive-target";
  segments?: readonly number[];
}>) => createUnifiedClipCandidate({
  sourceType: "subtitle",
  start: input.start,
  end: input.end ?? input.start + 25,
  transcriptText: input.text,
  reason: input.text,
  title: `clip-${input.start}`,
  sourceScore: input.score ?? 5,
  storyReason: input.storyReason,
  storyEvidenceVersion: input.storyReason ? "1.0" : undefined,
  startReason: "candidate-anchor",
  endReason: input.endReason,
  segmentIndexes: input.segments,
});

test("quality contract is versioned, bounded, readonly, and deterministic", () => {
  const candidate = makeCandidate({
    start: 0,
    text: "Why does this matter? Here is the complete answer.",
    storyReason: "question-answer-completion",
    endReason: "question-answer-completion",
  });
  const first = scoreClipQualityV1(candidate);
  const second = scoreClipQualityV1(candidate);
  assert.equal(first.qualityVersion, CLIP_QUALITY_VERSION);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.ok(Object.values(first.dimensions).every((value) => Number.isInteger(value) && value >= 0 && value <= 100));
  assert.ok(first.overall >= 0 && first.overall <= 100);
  assert.equal(Object.values(CLIP_QUALITY_WEIGHTS_V1).reduce((sum, value) => sum + value, 0), 1);
});

test("question, contrast, story, payoff, and fallback evidence affect fixed dimensions", () => {
  const question = scoreClipQualityV1(makeCandidate({
    start: 0,
    text: "Why is this important? The answer is complete.",
    storyReason: "question-answer-completion",
    endReason: "question-answer-completion",
  }));
  const contrast = scoreClipQualityV1(makeCandidate({
    start: 30,
    text: "However, this changes the conclusion.",
    storyReason: "payoff-completion",
    endReason: "payoff-completion",
  }));
  const fallback = scoreClipQualityV1(makeCandidate({
    start: 60,
    text: "and this keeps going",
    storyReason: "story-insufficient-fallback",
    endReason: "adaptive-target",
  }));
  assert.ok(question.dimensions.hookStrength > fallback.dimensions.hookStrength);
  assert.ok(question.dimensions.storyCompleteness > fallback.dimensions.storyCompleteness);
  assert.ok(contrast.dimensions.payoffStrength > fallback.dimensions.payoffStrength);
  assert.ok(question.dimensions.standaloneValue > fallback.dimensions.standaloneValue);
  assert.ok(question.dimensions.boundaryQuality > fallback.dimensions.boundaryQuality);
  assert.ok(question.overall > fallback.overall);
  assert.ok(question.reasonCodes.includes("contains-answer"));
  assert.ok(contrast.reasonCodes.includes("payoff-complete"));
  assert.ok(fallback.reasonCodes.includes("fallback-end"));
});

test("information density is deterministic without inventing missing text", () => {
  const dense = scoreClipQualityV1(makeCandidate({ start: 0, text: "Dense useful facts complete the thought." }));
  const sparse = scoreClipQualityV1(makeCandidate({ start: 30, text: "short", end: 60 }));
  const unavailable = scoreClipQualityV1(createUnifiedClipCandidate({
    sourceType: "audio-energy",
    start: 0,
    end: 30,
    sourceScore: 7,
  }));
  assert.ok(dense.dimensions.informationDensity > sparse.dimensions.informationDensity);
  assert.equal(unavailable.dimensions.informationDensity, 50);
});

test("similarity handles exact IDs, boundaries, temporal overlap, and distant wording", () => {
  const first = makeCandidate({ start: 0, text: "The same complete explanation.", segments: [1, 2] });
  const same = makeCandidate({ start: 0, text: "The same complete explanation.", segments: [1, 2] });
  const near = makeCandidate({ start: 1, text: "The same complete explanation!", segments: [1, 2] });
  const distant = makeCandidate({ start: 100, text: "The same complete explanation." });
  assert.equal(scoreClipSimilarityV1(first, same).classification, "duplicate");
  assert.equal(scoreClipSimilarityV1(first, near).classification, "duplicate");
  assert.equal(scoreClipSimilarityV1(first, distant).classification, "distinct");
  assert.equal(scoreClipSimilarityV1(first, same).temporal, 100);
});

test("supports Japanese and English character-shingle similarity", () => {
  const japaneseA = makeCandidate({ start: 0, text: "重要な結論はここにあります。" });
  const japaneseB = makeCandidate({ start: 2, text: "重要な結論はここにあります！" });
  const englishA = makeCandidate({ start: 40, text: "This is the important conclusion." });
  const englishB = makeCandidate({ start: 42, text: "This is an important conclusion!" });
  assert.ok((scoreClipSimilarityV1(japaneseA, japaneseB).text ?? 0) >= 85);
  assert.ok((scoreClipSimilarityV1(englishA, englishB).text ?? 0) >= 70);
});

test("normalizes missing segment evidence instead of treating it as similarity", () => {
  const left = makeCandidate({ start: 0, text: "alpha complete." });
  const right = makeCandidate({ start: 40, text: "beta complete." });
  const result = scoreClipSimilarityV1(left, right);
  assert.equal(result.segments, undefined);
  assert.equal(result.classification, "distinct");
});

test("fixes duplicate and similar thresholds", () => {
  assert.equal(CLIP_DUPLICATE_THRESHOLD_V1, 85);
  assert.equal(CLIP_SIMILAR_THRESHOLD_V1, 70);
  const base = makeCandidate({ start: 0, end: 100, text: "abcdefghij" });
  const duplicateEdge = makeCandidate({ start: 15, end: 115, text: "abcdefghij" });
  const similarEdge = makeCandidate({ start: 30, end: 130, text: "abcdefghij" });
  assert.ok(scoreClipSimilarityV1(base, duplicateEdge).combined >= 85);
  assert.ok(scoreClipSimilarityV1(base, similarEdge).combined >= 70);
});

test("duplicate grouping uses duplicate edges transitively but not similar-only edges", () => {
  const first = makeCandidate({ start: 0, text: "same core explanation one." });
  const second = makeCandidate({ start: 1, text: "same core explanation one!" });
  const third = makeCandidate({ start: 2, text: "same core explanation one?" });
  const distinct = makeCandidate({ start: 80, text: "different topic complete." });
  const groups = createClipDuplicateGroupsV1([third, distinct, first, second]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.candidateIds.includes(first.stableCandidateId))?.candidateIds.length, 3);
  assert.deepEqual(groups, createClipDuplicateGroupsV1([third, distinct, first, second]));
});

test("representative selection follows quality and deterministic tie-breaks", () => {
  const weak = makeCandidate({
    start: 0,
    text: "Why? This is the complete answer.",
    score: 2,
    storyReason: "story-insufficient-fallback",
    endReason: "adaptive-target",
  });
  const strong = makeCandidate({
    start: 1,
    text: "Why? This is the complete answer.",
    score: 9,
    storyReason: "question-answer-completion",
    endReason: "question-answer-completion",
  });
  const groups = createClipDuplicateGroupsV1([weak, strong]);
  const qualities = new Map([weak, strong].map((item) => [item.stableCandidateId, scoreClipQualityV1(item)]));
  assert.equal(selectClipDuplicateRepresentativesV1([weak, strong], groups, qualities)[0]?.stableCandidateId, strong.stableCandidateId);
});

test("portfolio selects at most five, quality first, with evidence and no duplicates", () => {
  const candidates = [
    makeCandidate({ start: 0, text: "Why? Complete answer.", score: 10, storyReason: "question-answer-completion", endReason: "question-answer-completion" }),
    makeCandidate({ start: 1, text: "Why? Complete answer!", score: 9, storyReason: "question-answer-completion", endReason: "question-answer-completion" }),
    makeCandidate({ start: 40, text: "結局、答えです。", score: 8, storyReason: "payoff-completion", endReason: "payoff-completion" }),
    makeCandidate({ start: 80, text: "However, this is complete.", score: 8, storyReason: "semantic-completion", endReason: "semantic-completion" }),
    makeCandidate({ start: 120, text: "A distinct explanation is complete.", score: 7, storyReason: "semantic-completion", endReason: "semantic-completion" }),
    makeCandidate({ start: 160, text: "Another distinct story is complete.", score: 7, storyReason: "semantic-completion", endReason: "semantic-completion" }),
    makeCandidate({ start: 200, text: "Final distinct point is complete.", score: 7, storyReason: "semantic-completion", endReason: "semantic-completion" }),
  ];
  const result = selectIntelligentClipPortfolioV1(candidates);
  assert.equal(result.portfolioVersion, CLIP_PORTFOLIO_VERSION);
  assert.equal(result.selected.length, 5);
  assert.equal(result.selected[0]?.candidate.stableCandidateId, candidates[0]?.stableCandidateId);
  assert.equal(new Set(result.selected.map((item) => item.duplicateGroupId)).size, result.selected.length);
  assert.deepEqual(result.selected.map((item) => item.selectedRank), [1, 2, 3, 4, 5]);
  assert.ok(result.selected.every((item) => item.portfolioReasons.length > 0));
  assert.ok(result.rejected.some((item) => item.reason === "lower-quality-duplicate"));
});

test("quality floor rejects a weak diverse candidate and permits fewer results", () => {
  const strong = makeCandidate({ start: 0, text: "A complete standalone statement.", score: 9, storyReason: "semantic-completion", endReason: "semantic-completion" });
  const weak = makeCandidate({ start: 100, text: "and", score: 1, storyReason: "story-insufficient-fallback", endReason: "adaptive-target" });
  const result = selectIntelligentClipPortfolioV1([strong, weak]);
  assert.equal(result.selected.length, 1);
  assert.equal(result.rejected.find((item) => item.candidate.stableCandidateId === weak.stableCandidateId)?.reason, "below-quality-floor");
  assert.equal(CLIP_QUALITY_FLOOR_V1, 45);
});

test("portfolio selection is deterministic, copy-isolated, and candidate preserving", () => {
  const candidates = [
    makeCandidate({ start: 0, text: "First complete point.", score: 8, storyReason: "semantic-completion", endReason: "semantic-completion" }),
    makeCandidate({ start: 40, text: "Second complete point.", score: 8, storyReason: "semantic-completion", endReason: "semantic-completion" }),
  ];
  const first = selectIntelligentClipPortfolioV1(candidates);
  const second = selectIntelligentClipPortfolioV1(candidates);
  assert.deepEqual(first, second);
  assert.equal(first.selected[0]?.candidate.start, candidates[0]?.start);
  assert.equal(Object.isFrozen(first.selected), true);
  assert.equal(Object.isFrozen(first.rejected), true);
});

test("legacy projection preserves final output shape and boundaries", () => {
  const candidate = makeCandidate({ start: 12, end: 48, text: "Complete output.", score: 8, storyReason: "semantic-completion", endReason: "semantic-completion" });
  const output = projectPortfolioToLegacyClipsV1(selectIntelligentClipPortfolioV1([candidate]));
  assert.deepEqual(output[0], {
    start: "12",
    end: "48",
    title: "clip-12",
    reason: "Complete output.",
    score: 8,
  });
  assert.equal(candidate.start, 12);
  assert.equal(candidate.end, 48);
});
