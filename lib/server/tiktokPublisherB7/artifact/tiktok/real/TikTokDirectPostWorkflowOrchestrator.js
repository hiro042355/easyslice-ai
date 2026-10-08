"use strict";
/**
 * B3-7 — Direct Post workflow orchestrator.
 *
 * Composes existing B3 adapters into a deterministic workflow:
 *   1. Direct Post initialization (B3-4)
 *   2. FILE_UPLOAD media transfer (B3-5) — only for FILE_UPLOAD sources
 *   3. Optional one-shot status fetch (B3-6) — only when explicitly requested
 *
 * The orchestrator does NOT:
 *   - re-validate creator authority, request layout, or chunk plans
 *   - accept access tokens or construct Authorization
 *   - call TikTokAuthProvider, global fetch, or production executors
 *   - implement polling, retry, or scheduling
 *   - invent a final-submit endpoint
 *
 * Each existing adapter owns its own validation/authority. The orchestrator
 * only coordinates stage ordering and short-circuits on failure.
 *
 * WAIT_FOR_B3_8: Upload Inbox / multi-source orchestration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokDirectPostWorkflowOrchestrator = void 0;
function sourceModeOf(req) {
    if (!req || typeof req !== 'object')
        return 'unknown';
    const si = req.sourceInfo;
    if (!si || typeof si !== 'object')
        return 'unknown';
    const source = si.source;
    if (source === 'FILE_UPLOAD')
        return 'FILE_UPLOAD';
    if (source === 'PULL_FROM_URL')
        return 'PULL_FROM_URL';
    return 'unknown';
}
class TikTokDirectPostWorkflowOrchestrator {
    constructor(initAdapter, mediaTransfer, statusAdapter) {
        this.initAdapter = initAdapter;
        this.mediaTransfer = mediaTransfer;
        this.statusAdapter = statusAdapter;
    }
    /** req must include B3 actualVideoDurationSec; init owns validation for both sources. */
    async execute(req, creatorInfo, options) {
        const sourceMode = sourceModeOf(req);
        // 1. Initialization (always)
        const initResult = await this.initAdapter.initDirectPost(req, creatorInfo);
        if (!initResult.success) {
            return {
                stage: initResult.validationErrors ? 'init_rejected' : 'init_failed',
                sourceMode,
                publishId: initResult.publishId,
                initResult,
                errorMessage: initResult.validationErrors
                    ? initResult.validationErrors.join('; ')
                    : initResult.errorMessage,
            };
        }
        // 2. FILE_UPLOAD: media transfer after successful init
        if (sourceMode === 'FILE_UPLOAD') {
            if (!initResult.uploadUrl) {
                return {
                    stage: 'init_failed',
                    sourceMode,
                    publishId: initResult.publishId,
                    initResult,
                    errorMessage: 'FILE_UPLOAD init succeeded but no upload_url was provided',
                };
            }
            const sourceInfo = req.sourceInfo;
            const transferResult = await this.mediaTransfer.transfer(sourceInfo, initResult.uploadUrl);
            if (!transferResult.success) {
                return {
                    stage: 'transfer_failed',
                    sourceMode,
                    publishId: initResult.publishId,
                    initResult,
                    transferResult,
                    errorMessage: transferResult.errorMessage,
                };
            }
            // 3. Optional one-shot status fetch after successful transfer
            if ((options === null || options === void 0 ? void 0 : options.fetchStatus) && initResult.publishId) {
                const statusResult = await this.fetchOneShotStatus(initResult.publishId);
                return {
                    stage: statusResult.stage,
                    sourceMode,
                    publishId: initResult.publishId,
                    initResult,
                    transferResult,
                    statusResult: statusResult.result,
                };
            }
            return {
                stage: 'transfer_succeeded',
                sourceMode,
                publishId: initResult.publishId,
                initResult,
                transferResult,
            };
        }
        // PULL_FROM_URL: no media transfer
        if (sourceMode === 'PULL_FROM_URL') {
            // Optional one-shot status fetch after successful init
            if ((options === null || options === void 0 ? void 0 : options.fetchStatus) && initResult.publishId) {
                const statusResult = await this.fetchOneShotStatus(initResult.publishId);
                return {
                    stage: statusResult.stage,
                    sourceMode,
                    publishId: initResult.publishId,
                    initResult,
                    statusResult: statusResult.result,
                };
            }
            return {
                stage: 'pull_from_url_accepted',
                sourceMode,
                publishId: initResult.publishId,
                initResult,
            };
        }
        // Unknown source mode — init may have succeeded but we don't know what to do
        return {
            stage: 'init_succeeded',
            sourceMode: 'unknown',
            publishId: initResult.publishId,
            initResult,
            errorMessage: 'unknown source mode after successful init',
        };
    }
    async fetchOneShotStatus(publishId) {
        const statusResult = await this.statusAdapter.fetchStatus(publishId);
        const workflowStatus = {
            status: statusResult.status,
            publishId: statusResult.publishId,
            failureReason: statusResult.failureReason,
            correlationConflict: statusResult.correlationConflict,
            httpStatus: statusResult.httpStatus,
        };
        if (statusResult.status === 'unknown' || statusResult.status === 'failure') {
            return { stage: 'status_failed', result: workflowStatus };
        }
        return { stage: 'status_fetched', result: workflowStatus };
    }
}
exports.TikTokDirectPostWorkflowOrchestrator = TikTokDirectPostWorkflowOrchestrator;
