"use strict";
/**
 * B3-6 — Publish Status real-provider adapter.
 *
 * Fetches publish status for a single publish_id through the
 * AuthenticatedTikTokTransport, reusing the existing B2 status
 * parser and correlation validation authority.
 *
 * The adapter:
 *   - validates the publish_id correlation BEFORE transport
 *   - sends a POST to the official status fetch endpoint
 *   - delegates response parsing to parseStatusResponse (B2 authority)
 *   - preserves request correlation on every result (success and failure)
 *
 * The adapter does NOT:
 *   - accept access tokens
 *   - construct Authorization headers
 *   - call the auth provider directly
 *   - call global fetch
 *   - use the B3-5 UploadExecutor
 *   - implement polling, retry, or scheduling
 *
 * WAIT_FOR_B3_7: orchestrator / final publish composition.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokPublishStatusAdapter = void 0;
const TikTokEndpoints_1 = require("../client/TikTokEndpoints");
const B2RequestValidator_1 = require("../validation/B2RequestValidator");
const TikTokStatusContracts_1 = require("../contracts/TikTokStatusContracts");
function isValidationFailed(v) {
    return !v.valid;
}
class TikTokPublishStatusAdapter {
    constructor(transport) {
        this.transport = transport;
    }
    /**
     * Fetch publish status for a single publish_id.
     *
     * One invocation = one status request. No polling, no retry.
     *
     * @param publishId - The publish_id correlation identifier (required, non-empty)
     */
    async fetchStatus(publishId) {
        // 1. Validate correlation BEFORE transport
        const validation = (0, B2RequestValidator_1.validateStatusCorrelation)(publishId);
        if (isValidationFailed(validation)) {
            return {
                publishId: typeof publishId === 'string' ? publishId : '',
                status: 'unknown',
                httpStatus: 0,
                validationErrors: validation.errors,
            };
        }
        // 2. Construct request body per official contract
        const body = { publish_id: publishId };
        // 3. Send through authenticated transport
        const response = await this.transport.request({
            method: 'POST',
            path: TikTokEndpoints_1.TIKTOK_ENDPOINTS.statusFetch,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body,
        });
        if (!(response.status >= 200 && response.status < 300)) {
            // Retain parser-owned failure/correlation metadata, never semantic success.
            const parsed = (0, TikTokStatusContracts_1.parseStatusResponse)(response.body, publishId);
            return {
                publishId,
                status: parsed.status === 'failure' ? 'failure' : 'unknown',
                failureReason: parsed.failureReason,
                providerLogId: parsed.providerLogId,
                correlationConflict: parsed.correlationConflict,
                httpStatus: response.status,
            };
        }
        // 4. Parse using existing B2 status parser authority
        const parsed = (0, TikTokStatusContracts_1.parseStatusResponse)(response.body, publishId);
        return {
            publishId: parsed.publishId,
            status: parsed.status,
            failureReason: parsed.failureReason,
            providerLogId: parsed.providerLogId,
            correlationConflict: parsed.correlationConflict,
            httpStatus: response.status,
        };
    }
}
exports.TikTokPublishStatusAdapter = TikTokPublishStatusAdapter;
