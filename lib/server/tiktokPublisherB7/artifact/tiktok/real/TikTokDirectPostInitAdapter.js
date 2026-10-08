"use strict";
/**
 * B3-4 — Direct Post initialization real-provider adapter.
 *
 * Bridges the B3-2 AuthenticatedTikTokTransport to the existing B2
 * Direct Post validation, serialization, and init-response parsing
 * authority.
 *
 * The adapter:
 *   - requires validated Creator Info context (mandatory, no fallback)
 *   - validates the creator context BEFORE transport (reuse B2 validator)
 *   - validates the Direct Post init request BEFORE transport (reuse B2 validator)
 *   - serializes using the existing B2 wire serializer
 *   - calls ONLY the official Direct Post init endpoint
 *   - delegates response parsing to the existing B2 init response parser
 *   - returns a deterministic result preserving publish_id and upload_url
 *
 * The adapter does NOT:
 *   - accept access tokens
 *   - construct Authorization headers
 *   - call the auth provider directly
 *   - call global fetch
 *   - implement media upload, submit, or status polling
 *
 * WAIT_FOR_B3_5: media transfer adapter using the returned upload_url.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokDirectPostInitAdapter = void 0;
const TikTokEndpoints_1 = require("../client/TikTokEndpoints");
const B2RequestValidator_1 = require("../validation/B2RequestValidator");
const TikTokWireSerializer_1 = require("../client/TikTokWireSerializer");
const TikTokInitResponseParser_1 = require("../contracts/TikTokInitResponseParser");
function isValidationFailed(v) {
    return !v.valid;
}
function sourceModeOf(req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const si = req === null || req === void 0 ? void 0 : req.sourceInfo;
    return typeof (si === null || si === void 0 ? void 0 : si.source) === 'string' ? si.source : '';
}
class TikTokDirectPostInitAdapter {
    constructor(transport) {
        this.transport = transport;
    }
    /**
     * Initialize a Direct Post.
     *
     * @param req          - B3 request including required actualVideoDurationSec
     * @param creatorInfo  - Validated Creator Info context (mandatory, no fallback)
     *
     * Validation failures (creator context or request) are rejected BEFORE
     * transport, resulting in zero HTTP executor calls.
     */
    async initDirectPost(req, creatorInfo) {
        var _a;
        // 1. Validate creator context BEFORE transport
        const creatorValidation = (0, B2RequestValidator_1.validateCreatorInfo)(creatorInfo);
        if (isValidationFailed(creatorValidation)) {
            return {
                success: false,
                publishId: '',
                validationErrors: creatorValidation.errors,
                httpStatus: 0,
            };
        }
        // 2. Validate Direct Post request BEFORE transport
        const requestValidation = (0, B2RequestValidator_1.validateDirectPostInitRequest)(req, creatorInfo !== null && creatorInfo !== void 0 ? creatorInfo : null);
        if (isValidationFailed(requestValidation)) {
            return {
                success: false,
                publishId: '',
                validationErrors: requestValidation.errors,
                httpStatus: 0,
            };
        }
        // B3 media-input authority applies to both source modes, before auth/HTTP.
        const actualDuration = req.actualVideoDurationSec;
        if (typeof actualDuration !== 'number' ||
            !Number.isFinite(actualDuration) ||
            actualDuration <= 0 ||
            actualDuration > creatorInfo.maxVideoPostDurationSec) {
            return {
                success: false,
                publishId: '',
                validationErrors: ['actualVideoDurationSec must be finite, positive, and within the creator maximum'],
                httpStatus: 0,
            };
        }
        // 3. Serialize using existing B2 authority
        const wireBody = (0, TikTokWireSerializer_1.serializeDirectPostWireBody)(req);
        // 4. Call official endpoint through authenticated transport
        const response = await this.transport.request({
            method: 'POST',
            path: TikTokEndpoints_1.TIKTOK_ENDPOINTS.directPostVideoInit,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: wireBody,
        });
        if (!(response.status >= 200 && response.status < 300)) {
            return {
                success: false,
                publishId: '',
                errorMessage: 'Direct Post init HTTP request was unsuccessful',
                httpStatus: response.status,
            };
        }
        // 5. Parse response using existing B2 parser (source-mode aware)
        const source = sourceModeOf(req);
        const parsed = source === 'FILE_UPLOAD'
            ? (0, TikTokInitResponseParser_1.parseFileUploadInitResponse)(response.body)
            : (0, TikTokInitResponseParser_1.parsePullFromUrlInitResponse)(response.body);
        if (parsed.outcome !== 'success') {
            return {
                success: false,
                publishId: parsed.publishId,
                errorMessage: (_a = parsed.errorMessage) !== null && _a !== void 0 ? _a : 'init parse failure',
                httpStatus: response.status,
            };
        }
        return {
            success: true,
            publishId: parsed.publishId,
            uploadUrl: parsed.uploadUrl,
            httpStatus: response.status,
        };
    }
}
exports.TikTokDirectPostInitAdapter = TikTokDirectPostInitAdapter;
