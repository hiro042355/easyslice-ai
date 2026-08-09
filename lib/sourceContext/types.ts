export const VIDEO_SOURCE_CONTEXT_VERSION = "1.0" as const;
export const CLIP_CONTEXT_EVIDENCE_VERSION = "1.0" as const;

export type VideoSourceTypeV1 = "upload" | "youtube";
export type VideoSourceChapterV1 = Readonly<{ title: string; startSeconds: number; endSeconds?: number }>;
export type TranscriptContextTermV1 = Readonly<{ term: string; count: number; normalizedFrequency: number }>;
export type TranscriptCoverageWindowV1 = Readonly<{ startSeconds: number; endSeconds: number; segmentCount: number }>;
export type TranscriptSummaryEvidenceV1 = Readonly<{ segmentCount: number; characterCount: number; recurringTerms: readonly TranscriptContextTermV1[]; coverageWindows: readonly TranscriptCoverageWindowV1[] }>;
export type VideoSourceContextV1 = Readonly<{ version: typeof VIDEO_SOURCE_CONTEXT_VERSION; sourceType: VideoSourceTypeV1; sourceId: string; durationSeconds: number; title?: string; description?: string; chapters?: readonly VideoSourceChapterV1[]; transcriptSummaryEvidence?: TranscriptSummaryEvidenceV1; topicTerms?: readonly string[]; coverageWindows?: readonly TranscriptCoverageWindowV1[] }>;
export type SourceContextEvidenceV1 = Readonly<{ evidenceVersion: typeof CLIP_CONTEXT_EVIDENCE_VERSION; sourceType: VideoSourceTypeV1; sourceId: string; relevance: number; transcriptRelevance: number; titleRelevance?: number; primaryTerms: readonly string[]; chapter?: VideoSourceChapterV1 }>;
export type SourceTranscriptSegmentV1 = Readonly<{ startSeconds: number; text: string }>;
export type ContextEnrichedClipCandidateV1<T> = Readonly<{ candidate: T; sourceContextEvidence: SourceContextEvidenceV1 }>;
