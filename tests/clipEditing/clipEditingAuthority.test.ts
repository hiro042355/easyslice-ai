import assert from "node:assert/strict";
import test from "node:test";
import { CLIP_EDIT_POLICY_V1, createClipEditPlanV1, projectEditedPortfolioToLegacyClipsV1, remapTimedTextV1 } from "../../lib/clipEditing";
import { createUnifiedClipCandidate, createUnifiedClipCandidatePool } from "../../lib/clipCandidates";
import { selectIntelligentClipPortfolioV1 } from "../../lib/clipRanking";

const input = (subtitles: Array<{ start: number; end: number; text: string; storyCritical?: boolean }>, extra = {}) => ({ start: 10, end: 40, subtitles, ...extra });

test("strong original hook is retained deterministically", () => {
  const value = input([{ start: 10, end: 12, text: "なぜこれは重要ですか？" }]);
  const first = createClipEditPlanV1(value);
  const second = createClipEditPlanV1(value);
  assert.deepEqual(first, second);
  assert.equal(first.hookDecision.action, "keep-original-start");
  assert.equal(first.outputDuration, 30);
});

for (const [language, filler] of [["Japanese", "えっと"], ["English", "um"]] as const) test(`${language} weak lead-in is trimmed`, () => {
  const plan = createClipEditPlanV1(input([
    { start: 10, end: 11, text: filler },
    { start: 12, end: 16, text: "方法を変えると結果も変わります" },
  ]));
  assert.equal(plan.hookDecision.action, "trim-weak-lead-in");
  assert.equal(plan.hookDecision.editedStart, 12);
});

test("question and contrast become stronger utterance starts", () => {
  for (const text of ["なぜ失敗するのでしょう？", "しかし結果は逆でした"]) {
    const plan = createClipEditPlanV1(input([{ start: 10, end: 11, text: "えー" }, { start: 13, end: 16, text }]));
    assert.equal(plan.hookDecision.action, "start-at-stronger-utterance");
  }
});

test("hook candidate outside shift limit is ignored", () => {
  const plan = createClipEditPlanV1(input([{ start: 10, end: 11, text: "えー" }, { start: 16, end: 18, text: "なぜ？" }]));
  assert.equal(plan.hookDecision.action, "keep-original-start");
});

test("context-dependent and story-critical utterances are protected", () => {
  for (const candidate of [{ start: 12, end: 14, text: "それが答えです" }, { start: 12, end: 14, text: "答えです", storyCritical: true }]) {
    const plan = createClipEditPlanV1(input([{ start: 10, end: 11, text: "えー" }, candidate]));
    assert.equal(plan.hookDecision.reason, "hook-change-rejected-context-risk");
  }
});

test("long subtitle gap retains a natural pause and maps a contiguous output", () => {
  const plan = createClipEditPlanV1(input([{ start: 10, end: 12, text: "前半" }, { start: 13, end: 15, text: "後半" }]));
  assert.equal(plan.removalDecisions[0]?.removedDuration, 0.6);
  assert.equal(plan.segments[1]?.outputStart, 2.4);
  assert.equal(plan.outputDuration, 29.4);
});

test("short natural pause is preserved", () => {
  const plan = createClipEditPlanV1(input([{ start: 10, end: 12, text: "前半" }, { start: 12.5, end: 15, text: "後半" }]));
  assert.equal(plan.removalDecisions.length, 0);
});

test("contiguous production mode never removes an internal gap", () => {
  const plan = createClipEditPlanV1(input([{ start: 10, end: 12, text: "前半" }, { start: 15, end: 17, text: "後半" }], { contiguousOnly: true }));
  assert.equal(plan.removalDecisions.length, 0);
  assert.equal(plan.segments.length, 1);
});

test("removal ratio and minimum duration protect aggressive edits", () => {
  const plan = createClipEditPlanV1({ start: 0, end: 16, subtitles: [{ start: 0, end: 1, text: "本文" }, { start: 10, end: 12, text: "続き" }] });
  assert.equal(plan.removalDecisions[0]?.applied, false);
  assert.equal(plan.removalDecisions[0]?.reason, "removal-rejected-ratio-limit");
});

test("timeline invariants and immutable copies hold", () => {
  const source = [{ start: 10, end: 12, text: "本文" }];
  const plan = createClipEditPlanV1(input(source));
  source[0]!.text = "changed";
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.segments), true);
  assert.equal(plan.segments.reduce((sum, segment) => sum + segment.outputEnd - segment.outputStart, 0), plan.outputDuration);
  assert.ok(plan.segments.every((segment) => segment.outputStart >= 0 && segment.sourceStart >= plan.originalStart && segment.sourceEnd <= plan.originalEnd));
  assert.equal(CLIP_EDIT_POLICY_V1.maximumHookShiftSeconds, 5);
});

test("subtitle and translation use the same timing map and omit removed spans", () => {
  const plan = createClipEditPlanV1(input([{ start: 10, end: 12, text: "前半" }, { start: 13, end: 15, text: "後半" }]));
  const subtitles = [{ start: 10, end: 12, text: "前半" }, { start: 12.5, end: 12.7, text: "削除" }, { start: 13, end: 15, text: "後半" }];
  const translations = subtitles.map((item) => ({ ...item, text: `T:${item.text}` }));
  const mappedSubtitles = remapTimedTextV1(subtitles, plan);
  const mappedTranslations = remapTimedTextV1(translations, plan);
  assert.deepEqual(mappedTranslations.map(({ start, end }) => ({ start, end })), mappedSubtitles.map(({ start, end }) => ({ start, end })));
  assert.ok(mappedSubtitles.every((item) => item.end <= plan.outputDuration));
  assert.equal(mappedSubtitles.some((item) => item.text === "削除"), false);
});

test("isolated filler is removed but meaningful and story-critical text is retained", () => {
  const removed = createClipEditPlanV1(input([{ start: 10, end: 12, text: "本文" }, { start: 13, end: 13.4, text: "えっと" }, { start: 14, end: 16, text: "続き" }]));
  assert.equal(removed.removalDecisions.find((item) => item.kind === "isolated-filler")?.applied, true);
  const meaningful = createClipEditPlanV1(input([{ start: 10, end: 12, text: "本文" }, { start: 13, end: 15, text: "まあ結果は良かった" }]));
  assert.equal(meaningful.removalDecisions.some((item) => item.kind === "isolated-filler"), false);
  const critical = createClipEditPlanV1(input([{ start: 10, end: 12, text: "質問" }, { start: 13, end: 13.4, text: "えっと", storyCritical: true }]));
  assert.equal(critical.removalDecisions.find((item) => item.kind === "isolated-filler")?.reason, "removal-rejected-story-risk");
});

test("authority has no network, model, clock, random, database, or boundary dependency", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../lib/clipEditing/clipEditingAuthority.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /fetch\(|LLM|OpenAI|TTS|Date\.now|new Date|Math\.random|database|postgres|decideCanonicalClipBoundary/);
});

test("production projection edits only the selected clip presentation boundary", () => {
  const candidate = createUnifiedClipCandidate({ sourceType: "subtitle", start: 10, end: 40, title: "clip", reason: "reason", sourceScore: 99, transcriptText: "えっと なぜ重要ですか？", storyReason: "question-answer-completion", storyEvidenceVersion: "1.0" });
  const selection = selectIntelligentClipPortfolioV1(createUnifiedClipCandidatePool([candidate]));
  const clips = projectEditedPortfolioToLegacyClipsV1(selection, [{ second: 10, text: "えっと" }, { second: 12, text: "なぜ重要ですか？" }]);
  assert.equal(clips[0]?.start, "12");
  assert.equal(clips[0]?.end, "40");
  assert.equal(candidate.start, 10);
  assert.equal(candidate.end, 40);
});
