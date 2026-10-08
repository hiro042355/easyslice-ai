/**
 * B2 — Source mode discriminated union for TikTok video publishing.
 *
 * Per official TikTok Content Posting API, the source_info object uses:
 *   - source: "FILE_UPLOAD" or "PULL_FROM_URL"
 *   - FILE_UPLOAD: video_size, chunk_size, total_chunk_count
 *   - PULL_FROM_URL: video_url
 *
 * WAIT_FOR_CANONICAL_NEXCUT: chunked upload details, resumable upload contract.
 */
export type TikTokSourceMode = 'FILE_UPLOAD' | 'PULL_FROM_URL';
export interface FileUploadSource {
    readonly source: 'FILE_UPLOAD';
    readonly videoSize: number;
    readonly chunkSize: number;
    readonly totalChunkCount: number;
}
export interface PullFromUrlSource {
    readonly source: 'PULL_FROM_URL';
    readonly videoUrl: string;
}
export type TikTokVideoSource = FileUploadSource | PullFromUrlSource;
