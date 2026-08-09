import type { UnifiedClipCandidateV1 } from "../clipCandidates";
import { CLIP_CONTEXT_EVIDENCE_VERSION, VIDEO_SOURCE_CONTEXT_VERSION, type SourceContextEvidenceV1, type SourceTranscriptSegmentV1, type TranscriptContextTermV1, type VideoSourceChapterV1, type VideoSourceContextV1, type VideoSourceTypeV1 } from "./types";

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/gu, " ").trim();
const termsOf = (value: string): string[] => {
  const normalized = normalize(value);
  const words = normalized.match(/[a-z0-9]{2,}/gu) ?? [];
  const japanese = normalized.replace(/[a-z0-9\s]/gu, "");
  const grams = Array.from(japanese).slice(0, -1).map((character, index) => character + Array.from(japanese)[index + 1]);
  return [...words, ...grams].filter((term) => term.length >= 2);
};
const scoreOverlap = (text: string, terms: readonly string[]) => {
  if (terms.length === 0) return 0;
  const values = new Set(termsOf(text));
  return Math.round(100 * terms.filter((term) => values.has(term)).length / terms.length);
};
const copyChapter = (chapter: VideoSourceChapterV1) => Object.freeze({ ...chapter });

export const parseYouTubeVideoIdV1 = (value: string): string | undefined => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "");
    const candidate = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : host === "youtube.com" || host.endsWith(".youtube.com")
        ? url.searchParams.get("v") ?? (/^\/(?:shorts|embed)\/([^/]+)/u.exec(url.pathname)?.[1])
        : undefined;
    return candidate && /^[A-Za-z0-9_-]{6,32}$/u.test(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
};

export const createVideoSourceContextV1 = (input: Readonly<{ sourceType: VideoSourceTypeV1; sourceId: string; durationSeconds: number; transcript?: readonly SourceTranscriptSegmentV1[]; title?: string; description?: string; chapters?: readonly VideoSourceChapterV1[] }>): VideoSourceContextV1 => {
  if (!input.sourceId.trim() || !Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) throw new TypeError("invalid-source-context");
  const transcript = [...(input.transcript ?? [])].sort((left, right) => left.startSeconds - right.startSeconds);
  const counts = new Map<string, number>();
  for (const term of termsOf(transcript.map((segment) => segment.text).join(" "))) counts.set(term, (counts.get(term) ?? 0) + 1);
  const maximum = Math.max(1, ...counts.values());
  const recurringTerms: TranscriptContextTermV1[] = [...counts]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([term, count]) => Object.freeze({ term, count, normalizedFrequency: Math.round(100 * count / maximum) }));
  const windowSize = input.durationSeconds > 0 ? Math.max(1, input.durationSeconds / 4) : 1;
  const coverageWindows = Array.from({ length: input.durationSeconds > 0 ? 4 : 0 }, (_, index) => Object.freeze({ startSeconds: index * windowSize, endSeconds: Math.min(input.durationSeconds, (index + 1) * windowSize), segmentCount: transcript.filter((segment) => segment.startSeconds >= index * windowSize && segment.startSeconds < (index + 1) * windowSize).length }));
  const summary = transcript.length === 0 ? undefined : Object.freeze({ segmentCount: transcript.length, characterCount: transcript.reduce((sum, segment) => sum + normalize(segment.text).length, 0), recurringTerms: Object.freeze(recurringTerms), coverageWindows: Object.freeze(coverageWindows) });
  return Object.freeze({ version: VIDEO_SOURCE_CONTEXT_VERSION, sourceType: input.sourceType, sourceId: input.sourceId, durationSeconds: input.durationSeconds, ...(input.title ? { title: input.title } : {}), ...(input.description ? { description: input.description } : {}), ...(input.chapters ? { chapters: Object.freeze(input.chapters.map(copyChapter)) } : {}), ...(summary ? { transcriptSummaryEvidence: summary, topicTerms: Object.freeze(recurringTerms.map((term) => term.term)), coverageWindows: summary.coverageWindows } : {}) });
};

export const scoreSourceContextRelevanceV1 = (candidate: UnifiedClipCandidateV1, context: VideoSourceContextV1): SourceContextEvidenceV1 => {
  const terms = context.topicTerms ?? [];
  const transcriptRelevance = scoreOverlap(candidate.transcriptText ?? candidate.reason ?? "", terms);
  const titleRelevance = context.title ? scoreOverlap(candidate.transcriptText ?? candidate.reason ?? "", termsOf(context.title)) : undefined;
  const relevance = titleRelevance === undefined ? transcriptRelevance : Math.round(transcriptRelevance * 0.8 + titleRelevance * 0.2);
  const chapter = context.chapters?.find((item, index, chapters) => candidate.start >= item.startSeconds && candidate.start < (item.endSeconds ?? chapters[index + 1]?.startSeconds ?? context.durationSeconds));
  return Object.freeze({ evidenceVersion: CLIP_CONTEXT_EVIDENCE_VERSION, sourceType: context.sourceType, sourceId: context.sourceId, relevance, transcriptRelevance, ...(titleRelevance === undefined ? {} : { titleRelevance }), primaryTerms: Object.freeze(terms.filter((term) => termsOf(candidate.transcriptText ?? candidate.reason ?? "").includes(term)).slice(0, 3)), ...(chapter ? { chapter: copyChapter(chapter) } : {}) });
};

export const enrichClipCandidateWithSourceContextV1 = (candidate: UnifiedClipCandidateV1, context: VideoSourceContextV1): UnifiedClipCandidateV1 => Object.freeze({ ...candidate, sourceContextEvidence: scoreSourceContextRelevanceV1(candidate, context) });
export const enrichClipCandidatesWithSourceContextV1 = (candidates: readonly UnifiedClipCandidateV1[], context: VideoSourceContextV1): readonly UnifiedClipCandidateV1[] => Object.freeze(candidates.map((candidate) => enrichClipCandidateWithSourceContextV1(candidate, context)));
