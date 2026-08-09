import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIP_FINAL_SELECTION_POLICY_V1,
  CLIP_SELECTION_POLICY_VERSION,
  UNIFIED_CLIP_CANDIDATE_VERSION,
  createUnifiedClipCandidate,
  createUnifiedClipCandidatePool,
  selectLegacyFinalClips,
  type ClipCandidateSourceType,
} from "../../lib/clipCandidates";

const candidate = (
  sourceType: ClipCandidateSourceType,
  start: number,
  score = 5
) => createUnifiedClipCandidate({
  sourceType,
  start,
  end: start + 20,
  reason: `${sourceType} reason ${start}`,
  title: `${sourceType} title`,
  sourceScore: score,
  transcriptText: `${sourceType} transcript ${start}`,
});

test("defines one versioned final count and larger pool limit", () => {
  assert.equal(CLIP_FINAL_SELECTION_POLICY_V1.policyVersion, CLIP_SELECTION_POLICY_VERSION);
  assert.equal(CLIP_FINAL_SELECTION_POLICY_V1.finalClipCount, 5);
  assert.equal(CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit, 10);
  assert.ok(
    CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit >
      CLIP_FINAL_SELECTION_POLICY_V1.finalClipCount
  );
  assert.equal(CLIP_FINAL_SELECTION_POLICY_V1.orderingOwner, "portfolio-selector");
});

test("creates a versioned candidate with stable deterministic identity", () => {
  const input = {
    sourceType: "subtitle" as const,
    start: 10,
    end: 35,
    transcriptText: "Same transcript.",
    segmentIndexes: [2, 3] as const,
  };
  const first = createUnifiedClipCandidate(input);
  const second = createUnifiedClipCandidate(input);
  assert.equal(first.candidateVersion, UNIFIED_CLIP_CANDIDATE_VERSION);
  assert.equal(first.stableCandidateId, second.stableCandidateId);
});

test("different sources produce different stable identities", () => {
  const subtitle = candidate("subtitle", 0);
  const summary = candidate("summary", 0);
  assert.notEqual(subtitle.stableCandidateId, summary.stableCandidateId);
});

test("preserves boundaries and derives duration without mutation", () => {
  const result = createUnifiedClipCandidate({
    sourceType: "ai-highlight",
    start: 2.5,
    end: 42,
  });
  assert.equal(result.start, 2.5);
  assert.equal(result.end, 42);
  assert.equal(result.duration, 39.5);
});

test("preserves story, boundary, transcript, and segment evidence", () => {
  const result = createUnifiedClipCandidate({
    sourceType: "subtitle",
    start: 0,
    end: 24,
    transcriptText: "Complete story.",
    segmentIndexes: [0, 1],
    storyReason: "semantic-completion",
    storyEvidenceVersion: "1.0",
    startReason: "candidate-anchor",
    endReason: "semantic-completion",
  });
  assert.equal(result.transcriptText, "Complete story.");
  assert.deepEqual(result.segmentIndexes, [0, 1]);
  assert.equal(result.storyReason, "semantic-completion");
  assert.equal(result.storyEvidenceVersion, "1.0");
  assert.equal(result.startReason, "candidate-anchor");
  assert.equal(result.endReason, "semantic-completion");
});

test("preserves optional absence instead of fabricating evidence", () => {
  const result = createUnifiedClipCandidate({
    sourceType: "audio-energy",
    start: 0,
    end: 30,
  });
  assert.equal("storyReason" in result, false);
  assert.equal("segmentIndexes" in result, false);
  assert.equal("transcriptText" in result, false);
});

test("copies segment indexes for isolation", () => {
  const indexes = [1, 2];
  const result = createUnifiedClipCandidate({
    sourceType: "subtitle",
    start: 0,
    end: 30,
    segmentIndexes: indexes,
  });
  indexes.push(3);
  assert.deepEqual(result.segmentIndexes, [1, 2]);
  assert.equal(Object.isFrozen(result.segmentIndexes), true);
});

test("rejects invalid boundary shapes", () => {
  assert.throws(
    () => createUnifiedClipCandidate({ sourceType: "summary", start: 5, end: 5 }),
    TypeError
  );
});

test("merges multiple sources in deterministic source-balanced order", () => {
  const input = [
    candidate("audio-energy", 3),
    candidate("subtitle", 2),
    candidate("summary", 1),
    candidate("subtitle", 0),
  ];
  const first = createUnifiedClipCandidatePool(input);
  const second = createUnifiedClipCandidatePool([...input].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.sourceType), [
    "subtitle",
    "summary",
    "audio-energy",
    "subtitle",
  ]);
});

test("applies only the candidate pool limit", () => {
  const input = Array.from({ length: 14 }, (_, index) =>
    candidate("subtitle", index * 21)
  );
  const result = createUnifiedClipCandidatePool(input);
  assert.equal(result.length, 10);
});

test("pool construction does not quality-rank, deduplicate, or mutate boundaries", () => {
  const lower = candidate("subtitle", 0, 1);
  const higher = candidate("subtitle", 30, 10);
  const exactCopy = createUnifiedClipCandidate({
    sourceType: lower.sourceType,
    start: lower.start,
    end: lower.end,
    reason: lower.reason,
    sourceScore: lower.sourceScore,
  });
  const result = createUnifiedClipCandidatePool([higher, exactCopy, lower]);
  assert.equal(result[0]?.sourceScore, 1);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(({ start, end }) => ({ start, end })), [
    { start: 0, end: 20 },
    { start: 0, end: 20 },
    { start: 30, end: 50 },
  ]);
});

test("legacy adapter maintains five outputs and original shape", () => {
  const input = Array.from({ length: 8 }, (_, index) =>
    candidate("ai-highlight", index * 21, 8 - index)
  );
  const result = selectLegacyFinalClips(createUnifiedClipCandidatePool(input));
  assert.equal(result.length, 5);
  assert.deepEqual(Object.keys(result[0] ?? {}).sort(), [
    "end",
    "reason",
    "score",
    "start",
    "title",
  ]);
});

test("legacy adapter does not mutate candidate boundaries", () => {
  const input = candidate("summary", 12);
  const result = selectLegacyFinalClips([input]);
  assert.equal(result[0]?.start, "12");
  assert.equal(result[0]?.end, "32");
  assert.equal(input.start, 12);
  assert.equal(input.end, 32);
});
