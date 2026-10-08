/**
 * B3-5 — Media transfer boundary for FILE_UPLOAD chunk orchestration.
 *
 * Consumes a validated FILE_UPLOAD source plan and orchestrates
 * sequential chunk uploads to a provider-issued upload_url via an
 * injected UploadExecutor.
 *
 * CRITICAL ISOLATION:
 *   - Does NOT use AuthenticatedTikTokTransport for chunk uploads.
 *   - Does NOT depend on TikTokAuthProvider.
 *   - Does NOT accept or construct Authorization headers.
 *   - The TikTok API access token can never reach the upload executor.
 *
 * Reuses existing B2 media-transfer validation authority
 * (validateUploadInboxInitRequest) for FILE_UPLOAD layout rules.
 *
 * WAIT_FOR_B3_6: final publish submission / status polling.
 */
import type { UploadExecutor } from './UploadExecutor';
export interface ChunkPlanEntry {
    readonly index: number;
    readonly startByte: number;
    readonly endByte: number;
    readonly contentLength: number;
}
export interface MediaTransferResult {
    readonly success: boolean;
    readonly uploadedChunks: number;
    readonly failedChunkIndex?: number;
    readonly errorMessage?: string;
}
export declare class TikTokMediaTransferBoundary {
    private readonly executor;
    constructor(executor: UploadExecutor);
    transfer(source: unknown, uploadUrl: string): Promise<MediaTransferResult>;
    private validateUploadUrl;
    private buildChunkPlan;
    private executeChunk;
}
