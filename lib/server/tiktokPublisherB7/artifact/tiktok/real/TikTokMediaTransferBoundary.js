"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokMediaTransferBoundary = void 0;
const B2RequestValidator_1 = require("../validation/B2RequestValidator");
function isValidationFailed(v) {
    return !v.valid;
}
class TikTokMediaTransferBoundary {
    constructor(executor) {
        this.executor = executor;
    }
    async transfer(source, uploadUrl) {
        // 1. Reject non-FILE_UPLOAD sources
        if (!source || typeof source !== 'object') {
            return { success: false, uploadedChunks: 0, errorMessage: 'source is required' };
        }
        const s = source;
        if (s.source !== 'FILE_UPLOAD') {
            return {
                success: false,
                uploadedChunks: 0,
                errorMessage: 'PULL_FROM_URL is not supported by this transfer boundary',
            };
        }
        // 2. Validate FILE_UPLOAD layout using existing B2 authority
        const validation = (0, B2RequestValidator_1.validateUploadInboxInitRequest)({ sourceInfo: source });
        if (isValidationFailed(validation)) {
            return {
                success: false,
                uploadedChunks: 0,
                errorMessage: validation.errors.join('; '),
            };
        }
        // 3. Validate upload URL safety
        const urlError = this.validateUploadUrl(uploadUrl);
        if (urlError) {
            return { success: false, uploadedChunks: 0, errorMessage: urlError };
        }
        // 4. Build deterministic chunk plan
        const videoSize = s.videoSize;
        const chunkSize = s.chunkSize;
        const totalChunkCount = s.totalChunkCount;
        const plan = this.buildChunkPlan(videoSize, chunkSize, totalChunkCount);
        // 5. Execute chunks sequentially with fail-closed
        let uploaded = 0;
        for (const chunk of plan) {
            try {
                const response = await this.executeChunk(chunk, uploadUrl, videoSize);
                if (response.status < 200 || response.status >= 300) {
                    return {
                        success: false,
                        uploadedChunks: uploaded,
                        failedChunkIndex: chunk.index,
                        errorMessage: `chunk ${chunk.index} upload failed with status ${response.status}`,
                    };
                }
                uploaded++;
            }
            catch (_a) {
                return {
                    success: false,
                    uploadedChunks: uploaded,
                    failedChunkIndex: chunk.index,
                    errorMessage: `chunk ${chunk.index} upload threw an error`,
                };
            }
        }
        return { success: true, uploadedChunks: uploaded };
    }
    validateUploadUrl(url) {
        if (!url || url.trim() === '') {
            return 'upload URL is empty';
        }
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch (_a) {
            return 'upload URL is malformed';
        }
        if (parsed.protocol !== 'https:') {
            return 'upload URL must use HTTPS';
        }
        if (parsed.username !== '' || parsed.password !== '') {
            return 'upload URL must not contain embedded credentials';
        }
        return null;
    }
    buildChunkPlan(videoSize, chunkSize, totalChunkCount) {
        const plan = [];
        for (let i = 0; i < totalChunkCount; i++) {
            const startByte = i * chunkSize;
            const endByte = i === totalChunkCount - 1 ? videoSize - 1 : (i + 1) * chunkSize - 1;
            const contentLength = endByte - startByte + 1;
            plan.push({ index: i, startByte, endByte, contentLength });
        }
        return plan;
    }
    async executeChunk(chunk, uploadUrl, videoSize) {
        const request = {
            url: uploadUrl,
            method: 'PUT',
            headers: {
                'Content-Range': `bytes ${chunk.startByte}-${chunk.endByte}/${videoSize}`,
                'Content-Length': chunk.contentLength.toString(),
            },
            payload: {
                chunkIndex: chunk.index,
                startByte: chunk.startByte,
                endByte: chunk.endByte,
                contentLength: chunk.contentLength,
            },
        };
        return this.executor.upload(request);
    }
}
exports.TikTokMediaTransferBoundary = TikTokMediaTransferBoundary;
