/**
 * B3-5 — Injectable upload executor port for media transfer.
 *
 * This interface is SEPARATE from HttpExecutor (B3-2). Media transfer
 * uses a provider-issued upload_url that must NOT receive the TikTok
 * API Bearer Authorization header. A distinct executor boundary
 * enforces this isolation architecturally.
 *
 * No real network calls are made in B3-5. No dependencies are added.
 * A future production upload executor (NOT in this slice) would
 * implement this interface.
 */
export interface ChunkPayload {
    readonly chunkIndex: number;
    readonly startByte: number;
    readonly endByte: number;
    readonly contentLength: number;
}
export interface UploadExecutorRequest {
    readonly url: string;
    readonly method: 'PUT';
    readonly headers: Record<string, string>;
    readonly payload: ChunkPayload;
}
export interface UploadExecutorResponse {
    readonly status: number;
    readonly headers: Record<string, string>;
}
export interface UploadExecutor {
    upload(request: UploadExecutorRequest): Promise<UploadExecutorResponse>;
}
