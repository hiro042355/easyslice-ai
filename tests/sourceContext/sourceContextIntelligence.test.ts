import assert from "node:assert/strict";
import test from "node:test";
import { createUnifiedClipCandidate } from "../../lib/clipCandidates";
import { scoreClipQualityV1, scoreClipQualityV2, selectIntelligentClipPortfolioV1 } from "../../lib/clipRanking";
import { createVideoSourceContextV1, enrichClipCandidateWithSourceContextV1, parseYouTubeVideoIdV1, scoreSourceContextRelevanceV1 } from "../../lib/sourceContext";

const candidate = (text: string, start = 0, score = 8) => createUnifiedClipCandidate({ sourceType: "subtitle", start, end: start + 30, transcriptText: text, reason: text, sourceScore: score, storyReason: "semantic-completion", storyEvidenceVersion: "1.0" });

test("parses stable IDs from existing YouTube URL forms without retaining the URL", () => {
  assert.equal(parseYouTubeVideoIdV1("https://www.youtube.com/watch?v=abc123XYZ_-"), "abc123XYZ_-");
  assert.equal(parseYouTubeVideoIdV1("https://youtu.be/abc123XYZ_-?t=2"), "abc123XYZ_-");
  assert.equal(parseYouTubeVideoIdV1("https://example.com/watch?v=abc123XYZ_-"), undefined);
});

test("creates immutable versioned YouTube and upload source contexts", () => {
  for (const sourceType of ["youtube", "upload"] as const) {
    const value = createVideoSourceContextV1({ sourceType, sourceId: `${sourceType}-id`, durationSeconds: 120 });
    assert.equal(value.version, "1.0");
    assert.equal(value.sourceType, sourceType);
    assert.equal(Object.isFrozen(value), true);
    assert.equal(value.title, undefined);
  }
});

test("extracts deterministic repeated Japanese and English global terms", () => {
  const transcript = [
    { startSeconds: 0, text: "AI editing improves video editing" },
    { startSeconds: 30, text: "動画編集では編集設計が重要です" },
    { startSeconds: 60, text: "AI editing and 動画編集" },
  ];
  const first = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "abc", durationSeconds: 90, transcript });
  const second = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "abc", durationSeconds: 90, transcript });
  assert.deepEqual(first, second);
  assert.ok(first.topicTerms?.includes("editing"));
  assert.ok(first.topicTerms?.some((term) => /編集/u.test(term)));
  assert.equal(first.transcriptSummaryEvidence?.segmentCount, 3);
  assert.equal(first.coverageWindows?.length, 4);
});

test("repeated terms outrank rare terms and relevance stays normalized", () => {
  const context = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 60, transcript: [{ startSeconds: 0, text: "editing editing editing tangent" }] });
  assert.equal(context.transcriptSummaryEvidence?.recurringTerms[0]?.term, "editing");
  assert.equal(context.topicTerms?.includes("tangent"), false);
  const strong = scoreSourceContextRelevanceV1(candidate("editing workflow"), context);
  const weak = scoreSourceContextRelevanceV1(candidate("cooking recipe"), context);
  assert.ok(strong.relevance > weak.relevance);
  assert.ok(strong.relevance >= 0 && strong.relevance <= 100);
});

test("empty transcript produces no fabricated topic evidence", () => {
  const context = createVideoSourceContextV1({ sourceType: "upload", sourceId: "file.mp4", durationSeconds: 0, transcript: [] });
  assert.equal(context.topicTerms, undefined);
  assert.equal(context.transcriptSummaryEvidence, undefined);
});

test("title is optional and limited to twenty percent of relevance", () => {
  const context = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 60, title: "Perfect Viral Topic", transcript: [{ startSeconds: 0, text: "editing editing" }] });
  const titleOnly = scoreSourceContextRelevanceV1(candidate("perfect viral topic"), context);
  assert.ok(titleOnly.relevance <= 20);
  const absent = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 60, transcript: [{ startSeconds: 0, text: "editing editing" }] });
  assert.equal(scoreSourceContextRelevanceV1(candidate("editing"), absent).titleRelevance, undefined);
});

test("description and chapters are additive, copied, and map by candidate time", () => {
  const chapters = [{ title: "Intro", startSeconds: 0, endSeconds: 30 }, { title: "Main", startSeconds: 30 }];
  const context = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 60, description: "description", chapters });
  chapters[1]!.title = "changed";
  const evidence = scoreSourceContextRelevanceV1(candidate("main", 35), context);
  assert.equal(context.description, "description");
  assert.equal(evidence.chapter?.title, "Main");
});

test("candidate enrichment preserves boundary, input, and copy isolation", () => {
  const original = candidate("editing editing");
  const context = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 60, transcript: [{ startSeconds: 0, text: "editing editing" }] });
  const enriched = enrichClipCandidateWithSourceContextV1(original, context);
  assert.notStrictEqual(enriched, original);
  assert.equal(enriched.start, original.start);
  assert.equal(enriched.end, original.end);
  assert.equal(original.sourceContextEvidence, undefined);
  assert.equal(Object.isFrozen(enriched.sourceContextEvidence?.primaryTerms), true);
});

test("Quality V2 uses secondary ten-percent context and V1 remains unchanged", () => {
  const original = candidate("editing editing");
  const context = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 60, transcript: [{ startSeconds: 0, text: "editing editing" }] });
  const enriched = enrichClipCandidateWithSourceContextV1(original, context);
  assert.deepEqual(scoreClipQualityV1(enriched), scoreClipQualityV1(original));
  assert.equal(scoreClipQualityV2(original).overall, scoreClipQualityV1(original).overall);
  assert.equal(scoreClipQualityV2(enriched).qualityVersion, "2.0");
  const weakTitleMatch = enrichClipCandidateWithSourceContextV1(candidate("viral topic", 40, 0), createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 80, title: "viral topic" }));
  assert.ok(scoreClipQualityV2(weakTitleMatch).overall < scoreClipQualityV2(enriched).overall);
});

test("portfolio keeps duplicate, quality floor, count, and no-context semantics", () => {
  const candidates = [candidate("editing editing", 0), candidate("editing editing", 1), candidate("different chapter topic", 50)];
  const baseline = selectIntelligentClipPortfolioV1(candidates);
  const again = selectIntelligentClipPortfolioV1(candidates);
  assert.deepEqual(baseline, again);
  assert.ok(baseline.selected.length <= 5);
  assert.equal(baseline.duplicateGroups.length > 0, true);
});

test("context diversity is tertiary and does not mutate candidates", () => {
  const context = createVideoSourceContextV1({ sourceType: "youtube", sourceId: "id", durationSeconds: 120, transcript: [{ startSeconds: 0, text: "editing editing workflow workflow creator creator" }] });
  const inputs = [candidate("editing editing", 0), candidate("workflow workflow", 40), candidate("creator creator", 80)];
  const enriched = inputs.map((item) => enrichClipCandidateWithSourceContextV1(item, context));
  const selection = selectIntelligentClipPortfolioV1(enriched);
  assert.ok(selection.selected.every((item) => item.quality.overall >= 45));
  assert.ok(inputs.every((item) => item.sourceContextEvidence === undefined));
});

test("context engine performs no network, LLM, embedding, clock, random, or database work", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../lib/sourceContext/sourceContextEngine.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /fetch\(|OpenAI|LLM|embedding|Date\.now|new Date|Math\.random|database|postgres/i);
});

test("existing YouTube info request preserves context metadata without adding a provider call", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../app/api/youtube-info/route.ts", import.meta.url), "utf8"));
  for (const field of ["sourceId", "description", "chapters", "duration", "title"]) assert.match(source, new RegExp(field));
  assert.equal((source.match(/\bexec\s*\(/gu) ?? []).length, 1);
  assert.equal((source.match(/\bfetch\s*\(/gu) ?? []).length, 0);
});
