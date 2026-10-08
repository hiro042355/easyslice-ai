"use strict";
/**
 * B2 — Init response parser for Direct Post and Upload-to-Inbox.
 *
 * Parses the TikTok init response envelope conservatively.
 *
 * STRICT SUCCESS ENVELOPE:
 *   Success is permitted ONLY when:
 *     1. error object exists
 *     2. error.code is a string
 *     3. error.code === "ok"
 *   If the error envelope is missing, null, empty, or has non-string/non-"ok" code,
 *   the result is NEVER success.
 *
 * FILE_UPLOAD init: requires publish_id AND upload_url on success.
 * PULL_FROM_URL init: requires publish_id; upload_url not required.
 *
 * Malformed "success" payloads map to failure-safe results.
 *
 * WAIT_FOR_CANONICAL_NEXCUT: full response validation, retry semantics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFileUploadInitResponse = parseFileUploadInitResponse;
exports.parsePullFromUrlInitResponse = parsePullFromUrlInitResponse;
const TikTokStatusContracts_1 = require("./TikTokStatusContracts");
/**
 * Parse an init response for a FILE_UPLOAD source.
 * Requires publish_id AND upload_url for success.
 */
function parseFileUploadInitResponse(raw) {
    return parseInitResponse(raw, true);
}
/**
 * Parse an init response for a PULL_FROM_URL source.
 * Requires publish_id; upload_url is optional.
 */
function parsePullFromUrlInitResponse(raw) {
    return parseInitResponse(raw, false);
}
function parseInitResponse(raw, requireUploadUrl) {
    if (!isObject(raw)) {
        return { outcome: 'failure', publishId: '', errorMessage: 'response is not an object' };
    }
    const root = raw;
    // Check error envelope — must be valid success envelope for success
    if (!(0, TikTokStatusContracts_1.isValidSuccessEnvelope)(raw)) {
        const error = root.error;
        if (isObject(error)) {
            const errorObj = error;
            const code = errorObj.code;
            if (typeof code === 'string' && code !== 'ok') {
                const message = typeof errorObj.message === 'string' ? errorObj.message : 'unknown error';
                return { outcome: 'failure', publishId: '', errorMessage: message };
            }
        }
        // Missing/malformed envelope (not a valid success envelope, but no explicit error code)
        return { outcome: 'failure', publishId: '', errorMessage: 'missing or invalid success envelope' };
    }
    // Valid success envelope — extract data
    const data = root.data;
    if (!isObject(data)) {
        return { outcome: 'failure', publishId: '', errorMessage: 'missing data object' };
    }
    const d = data;
    const publishId = typeof d.publish_id === 'string' ? d.publish_id : '';
    if (!publishId) {
        return { outcome: 'failure', publishId: '', errorMessage: 'missing publish_id' };
    }
    const uploadUrl = typeof d.upload_url === 'string' ? d.upload_url : undefined;
    if (requireUploadUrl && !uploadUrl) {
        return { outcome: 'failure', publishId, errorMessage: 'FILE_UPLOAD init missing required upload_url' };
    }
    return { outcome: 'success', publishId, uploadUrl };
}
function isObject(v) {
    return typeof v === 'object' && v !== null;
}
