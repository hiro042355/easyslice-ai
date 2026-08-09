import assert from "node:assert/strict";
import test from "node:test";
import { decideCanonicalClipBoundary } from "../../lib/clipBoundary";
import { createUnifiedClipCandidate } from "../../lib/clipCandidates";
import { createClipEditPlanV1 } from "../../lib/clipEditing";
import { CLIP_PLATFORM_PROFILES_V1, createPlatformAwareClipEditPlanV1, decidePlatformAwareClipBoundaryV1, resolveClipPlatformProfileV1, scorePlatformAwareClipQualityV1, selectPlatformAwareClipPortfolioV1, type ClipPlatformTargetV1 } from "../../lib/clipPlatform";
import { scoreClipQualityV2, selectIntelligentClipPortfolioV1 } from "../../lib/clipRanking";

const targets: readonly ClipPlatformTargetV1[] = ["generic-short", "youtube-shorts", "tiktok", "instagram-reels"];
const candidate = (text: string, start: number, story: "semantic-completion" | "question-answer-completion" | "story-insufficient-fallback" = "semantic-completion", score = 8) => createUnifiedClipCandidate({ sourceType: "subtitle", start, end: start + 30, transcriptText: text, reason: text, sourceScore: score, storyReason: story, storyEvidenceVersion: "1.0", sourceContextEvidence: { evidenceVersion: "1.0", sourceType: "upload", sourceId: "source", relevance: 60, transcriptRelevance: 60, primaryTerms: Object.freeze([text.split(" ")[0] ?? text]) } });

test("profiles expose the exact versioned target union and are deeply readonly", () => {
  assert.deepEqual(Object.keys(CLIP_PLATFORM_PROFILES_V1).sort(), [...targets].sort());
  for (const target of targets) {
    const profile = resolveClipPlatformProfileV1(target);
    assert.equal(profile.version, "1.0");
    assert.equal(profile.target, target);
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.qualityWeights), true);
  }
});

test("quality and portfolio weights sum to one for every profile", () => {
  for (const target of targets) {
    const profile = resolveClipPlatformProfileV1(target);
    assert.ok(Math.abs(Object.values(profile.qualityWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    assert.ok(Math.abs(Object.values(profile.portfolioWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  }
});

test("omitted target resolves to generic and exactly preserves current Quality V2", () => {
  const value = candidate("complete useful explanation.", 0);
  assert.strictEqual(resolveClipPlatformProfileV1(), CLIP_PLATFORM_PROFILES_V1["generic-short"]);
  assert.equal(scorePlatformAwareClipQualityV1(value).platformAdjustedQuality, scoreClipQualityV2(value).overall);
  assert.deepEqual(selectPlatformAwareClipPortfolioV1([value]).selection, selectIntelligentClipPortfolioV1([value]));
});

test("duration profiles remain bounded and only provide policy to canonical authority", () => {
  const input = { candidateKind: "subtitle-highlight" as const, anchorSecond: 10, sourceDurationSeconds: 200, evidence: [] };
  assert.deepEqual(decidePlatformAwareClipBoundaryV1(input), decideCanonicalClipBoundary(input));
  assert.equal(decidePlatformAwareClipBoundaryV1(input, "youtube-shorts").duration, 36);
  assert.equal(decidePlatformAwareClipBoundaryV1(input, "tiktok").duration, 25);
  assert.equal(decidePlatformAwareClipBoundaryV1(input, "instagram-reels").duration, 30);
  for (const target of targets) {
    const decision = decidePlatformAwareClipBoundaryV1({ ...input, anchorSecond: 195 }, target);
    assert.ok(decision.start >= 0 && decision.end <= 200 && decision.end > decision.start);
  }
});

test("story evidence remains primary over duration proximity for every platform", () => {
  const input = { candidateKind: "subtitle-highlight" as const, anchorSecond: 0, sourceDurationSeconds: 90, evidence: [], storySegments: [{ startSeconds: 0, text: "Question?" }, { startSeconds: 20, text: "Answer." }, { startSeconds: 38, text: "Conclusion." }] };
  for (const target of targets) assert.notEqual(decidePlatformAwareClipBoundaryV1(input, target).storyReason, undefined);
});

test("platform quality differences stay small and never rescue a weak candidate past the existing floor", () => {
  const hook = candidate("Why does this work?", 0, "story-insufficient-fallback", 8);
  const story = candidate("The explanation has a complete answer.", 40, "question-answer-completion", 8);
  assert.ok(scorePlatformAwareClipQualityV1(hook, "tiktok").platformAdjustedQuality >= scorePlatformAwareClipQualityV1(hook, "youtube-shorts").platformAdjustedQuality);
  assert.ok(scorePlatformAwareClipQualityV1(story, "youtube-shorts").platformAdjustedQuality >= scorePlatformAwareClipQualityV1(story, "tiktok").platformAdjustedQuality);
  const weak = candidate("x", 80, "story-insufficient-fallback", 0);
  for (const target of targets) assert.equal(selectPlatformAwareClipPortfolioV1([weak], target).selection.selected.length, 0);
});

test("portfolio preserves membership, duplicate rules, floor, and final count while allowing ordering evidence", () => {
  const values = [candidate("hook topic?", 0), candidate("hook topic?", 1), candidate("complete answer.", 40, "question-answer-completion"), candidate("another payoff.", 80)];
  const baseline = selectIntelligentClipPortfolioV1(values);
  for (const target of targets) {
    const result = selectPlatformAwareClipPortfolioV1(values, target);
    assert.deepEqual(new Set(result.selection.selected.map((item) => item.candidate.stableCandidateId)), new Set(baseline.selected.map((item) => item.candidate.stableCandidateId)));
    assert.deepEqual(result.selection.duplicateGroups, baseline.duplicateGroups);
    assert.ok(result.selection.selected.length <= 5);
    assert.ok(result.evidence.every((item) => item.platformTarget === target && item.platformReasonCodes.length > 0));
  }
});

test("hook and filler adapters preserve strict context, QA, ratio, and generic behavior", () => {
  const input = { start: 0, end: 30, subtitles: [{ start: 0, end: 1, text: "um" }, { start: 4.5, end: 8, text: "Why?", storyCritical: true }, { start: 10, end: 12, text: "Answer." }] };
  assert.deepEqual(createPlatformAwareClipEditPlanV1(input), createClipEditPlanV1(input));
  for (const target of targets) {
    const profile = resolveClipPlatformProfileV1(target);
    const plan = createPlatformAwareClipEditPlanV1(input, target);
    assert.ok(plan.hookDecision.shiftSeconds <= profile.hookPolicy.maxStartShiftSeconds);
    assert.ok(plan.evidence.removedRatio <= 0.2);
    assert.equal(plan.hookDecision.reason, "hook-change-rejected-context-risk");
  }
});

test("source type and distribution target remain independent", () => {
  for (const sourceType of ["upload", "youtube"] as const) for (const target of ["youtube-shorts", "tiktok"] as const) {
    const value = createUnifiedClipCandidate({ sourceType: "subtitle", start: 0, end: 30, transcriptText: "complete story.", sourceContextEvidence: { evidenceVersion: "1.0", sourceType, sourceId: `${sourceType}-id`, relevance: 50, transcriptRelevance: 50, primaryTerms: [] } });
    assert.equal(scorePlatformAwareClipQualityV1(value, target).platformTarget, target);
    assert.equal(value.sourceContextEvidence?.sourceType, sourceType);
  }
});

test("profiles and adapters are deterministic and contain no popularity, analytics, IO, clock, or random authority", async () => {
  const fs = await import("node:fs/promises");
  const sources = await Promise.all(["profiles.ts", "platformOptimization.ts"].map((file) => fs.readFile(new URL(`../../lib/clipPlatform/${file}`, import.meta.url), "utf8")));
  for (const source of sources) assert.doesNotMatch(source, /viral|algorithm|analytics|fetch\(|OpenAI|LLM|Date\.now|new Date|Math\.random|database|postgres/i);
  const value = candidate("complete story.", 0);
  for (const target of targets) assert.deepEqual(scorePlatformAwareClipQualityV1(value, target), scorePlatformAwareClipQualityV1(value, target));
});
