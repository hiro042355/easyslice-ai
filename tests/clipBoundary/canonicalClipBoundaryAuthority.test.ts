import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIP_BOUNDARY_DECISION_VERSION,
  decideCanonicalClipBoundary,
} from "../../lib/clipBoundary";

test("selects the closest available evidence to the adaptive target", () => {
  const decision = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 10,
    sourceDurationSeconds: 120,
    evidence: [
      { kind: "subtitle-timing", second: 28 },
      { kind: "subtitle-timing", second: 43 },
    ],
  });

  assert.deepEqual(decision, {
    decisionVersion: CLIP_BOUNDARY_DECISION_VERSION,
    start: 10,
    end: 43,
    duration: 33,
    endAuthority: "adaptive-evidence",
    selectedEvidenceKind: "subtitle-timing",
  });
});

test("keeps candidate lead-in policy inside the canonical authority", () => {
  const summary = decideCanonicalClipBoundary({
    candidateKind: "summary-highlight",
    anchorSecond: 20,
    evidence: [{ kind: "subtitle-timing", second: 44 }],
  });
  const audio = decideCanonicalClipBoundary({
    candidateKind: "audio-energy",
    anchorSecond: 20,
    evidence: [{ kind: "audio-window", second: 50 }],
  });

  assert.equal(summary.start, 15);
  assert.equal(audio.start, 17);
});

test("uses the source boundary when the source ends before the target", () => {
  const decision = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 42,
    sourceDurationSeconds: 55,
  });

  assert.equal(decision.end, 55);
  assert.equal(decision.duration, 13);
  assert.equal(decision.endAuthority, "source-duration");
});

test("keeps a candidate at source end inside a positive source boundary", () => {
  const decision = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 55,
    sourceDurationSeconds: 55,
  });

  assert.equal(decision.start, 54);
  assert.equal(decision.end, 55);
  assert.equal(decision.duration, 1);
});

test("uses the adaptive target deterministically when no boundary evidence exists", () => {
  const input = {
    candidateKind: "requested-range" as const,
    anchorSecond: 7,
  };

  assert.deepEqual(
    decideCanonicalClipBoundary(input),
    decideCanonicalClipBoundary(input)
  );
  assert.equal(decideCanonicalClipBoundary(input).end, 37);
});

test("preserves an explicit requested end instead of applying adaptive policy", () => {
  const decision = decideCanonicalClipBoundary({
    candidateKind: "requested-range",
    anchorSecond: 12,
    evidence: [{ kind: "requested-end", second: 24.5 }],
  });

  assert.equal(decision.start, 12);
  assert.equal(decision.end, 24.5);
  assert.equal(decision.duration, 12.5);
  assert.equal(decision.endAuthority, "requested-end");
});

test("returns a frozen immutable decision", () => {
  const decision = decideCanonicalClipBoundary({
    candidateKind: "subtitle-highlight",
    anchorSecond: 0,
  });

  assert.equal(Object.isFrozen(decision), true);
});
