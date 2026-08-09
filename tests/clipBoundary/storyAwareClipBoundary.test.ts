import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClipStoryEvidenceV1,
  decideCanonicalClipBoundary,
} from "../../lib/clipBoundary";

const decide = (
  segments: readonly Readonly<{ startSeconds: number; text: string }>[],
  sourceDurationSeconds = 90
) =>
  decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 0,
    sourceDurationSeconds,
    storySegments: segments,
    evidence: segments.map((segment) => ({
      kind: "subtitle-timing" as const,
      second: segment.startSeconds,
    })),
  });

test("prefers a Japanese semantic completion before 30 seconds", () => {
  const result = decide([
    { startSeconds: 0, text: "背景を説明します" },
    { startSeconds: 12, text: "ここで話は完結します。" },
    { startSeconds: 24, text: "次の話題です" },
  ]);
  assert.equal(result.end, 24);
  assert.equal(result.storyReason, "semantic-completion");
});

test("prefers a Japanese completion after 30 over an incomplete timing boundary", () => {
  const result = decide([
    { startSeconds: 0, text: "説明を始めます" },
    { startSeconds: 30, text: "まだ話の途中" },
    { startSeconds: 34, text: "結論です。" },
    { startSeconds: 38, text: "次です" },
  ]);
  assert.equal(result.end, 38);
});

test("supports English completion before and after the preferred duration", () => {
  const short = decide([
    { startSeconds: 0, text: "This starts here" },
    { startSeconds: 15, text: "This completes the point." },
    { startSeconds: 25, text: "Next" },
  ]);
  const long = decide([
    { startSeconds: 0, text: "This starts here" },
    { startSeconds: 30, text: "Still continuing" },
    { startSeconds: 36, text: "This completes the point!" },
    { startSeconds: 42, text: "Next" },
  ]);
  assert.equal(short.end, 25);
  assert.equal(long.end, 42);
});

test("punctuation-less text falls back to adaptive timing", () => {
  const result = decide([
    { startSeconds: 0, text: "no punctuation" },
    { startSeconds: 30, text: "still continuing" },
    { startSeconds: 60, text: "more" },
  ]);
  assert.equal(result.end, 30);
  assert.equal(result.storyReason, "story-insufficient-fallback");
});

test("chooses story priority before duration proximity", () => {
  const result = decide([
    { startSeconds: 0, text: "始まり" },
    { startSeconds: 22, text: "普通の完了。" },
    { startSeconds: 28, text: "しかし、展開します" },
    { startSeconds: 37, text: "答えが出ました。" },
    { startSeconds: 44, text: "次" },
  ]);
  assert.equal(result.end, 44);
  assert.equal(result.storyReason, "payoff-completion");
});

test("does not end on a question alone and includes the following answer", () => {
  const result = decide([
    { startSeconds: 0, text: "なぜ必要ですか？" },
    { startSeconds: 25, text: "理由はこれです。" },
    { startSeconds: 39, text: "次" },
  ]);
  assert.equal(result.end, 39);
  assert.equal(result.storyReason, "question-answer-completion");
});

test("bounds an answer beyond maximum duration", () => {
  const result = decide([
    { startSeconds: 0, text: "Why does it matter?" },
    { startSeconds: 30, text: "The answer continues" },
    { startSeconds: 65, text: "It ends here." },
    { startSeconds: 75, text: "Next" },
  ], 100);
  assert.equal(result.end, 30);
  assert.ok(result.duration <= 60);
});

test("detects transition phrases only at an explicit phrase boundary", () => {
  const evidence = buildClipStoryEvidenceV1([
    { startSeconds: 0, text: "however, this turns" },
    { startSeconds: 10, text: "somehow this does not" },
    { startSeconds: 20, text: "しかし、ここで変わる" },
  ], 30);
  assert.equal(evidence.units[0]?.evidenceType, "contrast");
  assert.equal(evidence.units[1]?.evidenceType, "statement");
  assert.equal(evidence.units[2]?.evidenceType, "contrast");
});

test("recognizes a completed conclusion as payoff evidence", () => {
  const result = decide([
    { startSeconds: 0, text: "説明" },
    { startSeconds: 35, text: "結局、これが答えです。" },
    { startSeconds: 44, text: "次" },
  ]);
  assert.equal(result.end, 44);
  assert.equal(result.storyReason, "payoff-completion");
});

test("accepts an explicit AI end only when it matches story completion", () => {
  const segments = [
    { startSeconds: 0, text: "説明中" },
    { startSeconds: 30, text: "まだ途中" },
    { startSeconds: 38, text: "完了です。" },
    { startSeconds: 45, text: "次" },
  ];
  const valid = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 0,
    sourceDurationSeconds: 90,
    storySegments: segments,
    evidence: [{ kind: "explicit-ai-end", second: 45 }],
  });
  const midSentence = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 0,
    sourceDurationSeconds: 90,
    storySegments: segments,
    evidence: [{ kind: "explicit-ai-end", second: 30 }],
  });
  assert.equal(valid.selectedEvidenceKind, "explicit-ai-end");
  assert.equal(midSentence.end, 45);
  assert.notEqual(midSentence.selectedEvidenceKind, "explicit-ai-end");
});

test("refines a mid-utterance start within the bounded window", () => {
  const result = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 13,
    sourceDurationSeconds: 60,
    storySegments: [
      { startSeconds: 10, text: "utterance in progress" },
      { startSeconds: 25, text: "It completes." },
      { startSeconds: 31, text: "Next" },
    ],
  });
  assert.equal(result.start, 10);
});

test("does not make a wide backwards start adjustment", () => {
  const result = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 19,
    sourceDurationSeconds: 70,
    storySegments: [
      { startSeconds: 10, text: "long utterance" },
      { startSeconds: 25, text: "It completes." },
      { startSeconds: 32, text: "Next" },
    ],
  });
  assert.equal(result.start, 19);
});

test("never refines before source start", () => {
  const result = decideCanonicalClipBoundary({
    candidateKind: "summary-highlight",
    anchorSecond: 2,
    sourceDurationSeconds: 20,
    storySegments: [{ startSeconds: 0, text: "Short source." }],
  });
  assert.equal(result.start, 0);
  assert.equal(result.end, 20);
});

test("preserves maximum duration while selecting story boundaries", () => {
  const result = decide([
    { startSeconds: 0, text: "start" },
    { startSeconds: 59, text: "Within limit." },
    { startSeconds: 60, text: "Next" },
  ], 120);
  assert.equal(result.end, 60);
  assert.equal(result.duration, 60);
});

test("is deterministic and does not mutate story input", () => {
  const segments = Object.freeze([
    Object.freeze({ startSeconds: 0, text: "Question?" }),
    Object.freeze({ startSeconds: 20, text: "Answer." }),
    Object.freeze({ startSeconds: 27, text: "Next" }),
  ]);
  const first = decide(segments);
  const second = decide(segments);
  assert.deepEqual(first, second);
  assert.equal(segments[0]?.text, "Question?");
});

test("returns deeply frozen story evidence collections", () => {
  const evidence = buildClipStoryEvidenceV1([
    { startSeconds: 0, text: "Complete." },
    { startSeconds: 20, text: "Next" },
  ]);
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.units), true);
  assert.equal(Object.isFrozen(evidence.boundaryCandidates), true);
  assert.equal(Object.isFrozen(evidence.units[0]?.segmentIndexes), true);
});
