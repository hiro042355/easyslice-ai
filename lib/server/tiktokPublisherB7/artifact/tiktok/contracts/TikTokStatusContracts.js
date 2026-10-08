"use strict";
/**
 * B2 — Status fetch response DTO and parser.
 *
 * Per official TikTok Content Posting API, documented status values are:
 *   PROCESSING_DOWNLOAD  — TikTok is downloading from the URL
 *   PROCESSING_UPLOAD    — File upload in progress
 *   SEND_TO_USER_INBOX   — Draft sent to creator's inbox (upload mode only)
 *   PUBLISH_COMPLETE     — Successfully posted
 *   FAILED               — Processing failed, check fail_reason
 *
 * The parser conservatively maps these to processing/incomplete/success/failure.
 * Unknown provider status values are preserved as an explicit safe unknown
 * representation — never inferred as success.
 *
 * STRICT SUCCESS ENVELOPE:
 *   Success is permitted ONLY when:
 *     1. error object exists
 *     2. error.code is a string
 *     3. error.code === "ok"
 *   If the error envelope is missing, null, empty, or has non-string/non-"ok" code,
 *   the result is NEVER success.
 *
 * CORRELATION:
 *   The request publish_id is passed in and preserved on every result.
 *   If the response echoes a contradictory publish_id, the result is conservatively
 *   treated as a correlation conflict (never success).
 *
 * WAIT_FOR_CANONICAL_NEXCUT: full status lifecycle, review status semantics.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidSuccessEnvelope = isValidSuccessEnvelope;
exports.parseStatusResponse = parseStatusResponse;
/**
 * Check whether the TikTok response envelope is a valid success envelope.
 * Returns true only when:
 *   - error exists and is an object
 *   - error.code is a string
 *   - error.code === "ok"
 */
function isValidSuccessEnvelope(raw) {
    if (!isObject(raw))
        return false;
    const error = raw.error;
    if (!isObject(error))
        return false;
    const code = error.code;
    return typeof code === 'string' && code === 'ok';
}
/**
 * Parse a raw status-fetch response body into a conservative ParsedStatusResult.
 *
 * @param raw       - The parsed JSON response body.
 * @param requestPublishId - The publish_id from the request context (correlation).
 *
 * Rules:
 *   1. If the error envelope is not a valid success envelope, never return success.
 *   2. Unknown status strings map to 'unknown' — never to 'success'.
 *   3. The request publish_id is always preserved on the result.
 *   4. If the response echoes a different publish_id, it's a correlation conflict (never success).
 */
function parseStatusResponse(raw, requestPublishId) {
    const correlationId = typeof requestPublishId === 'string' ? requestPublishId : '';
    if (!isObject(raw)) {
        return { publishId: correlationId, status: 'unknown' };
    }
    const root = raw;
    const error = root.error;
    const data = root.data;
    let errorLogId;
    // Check error envelope — must be valid success envelope for any success
    if (isObject(error)) {
        const errorObj = error;
        const errorCode = errorObj.code;
        errorLogId = extractLogId(errorObj);
        if (typeof errorCode === 'string' && errorCode !== 'ok') {
            // Explicit provider error — map to failure, never success
            const failReason = typeof errorObj.message === 'string' ? errorObj.message : undefined;
            return {
                publishId: correlationId,
                status: 'failure',
                failureReason: failReason,
                providerLogId: errorLogId,
            };
        }
    }
    // If error envelope is not a valid success envelope, never success
    if (!isValidSuccessEnvelope(raw)) {
        const dataLogId = extractLogIdFromData(data);
        return {
            publishId: correlationId,
            status: 'unknown',
            providerLogId: dataLogId !== null && dataLogId !== void 0 ? dataLogId : errorLogId,
        };
    }
    // Valid success envelope — require a documented data object
    if (!isObject(data)) {
        return { publishId: correlationId, status: 'unknown' };
    }
    const r = data;
    const echoedPublishId = typeof r.publish_id === 'string' ? r.publish_id : '';
    const failureReason = typeof r.fail_reason === 'string' ? r.fail_reason : undefined;
    const dataLogId = extractLogId(r);
    const providerLogId = dataLogId !== null && dataLogId !== void 0 ? dataLogId : errorLogId;
    // Correlation check: if request publish_id is provided and response echoes a different one, conflict
    if (correlationId && echoedPublishId && echoedPublishId !== correlationId) {
        return {
            publishId: correlationId,
            status: 'unknown',
            correlationConflict: true,
            providerLogId,
        };
    }
    // Use request correlation as authoritative; echoed ID is optional
    const publishId = correlationId || echoedPublishId;
    const rawStatus = typeof r.status === 'string' ? r.status : '';
    let status;
    switch (rawStatus) {
        case 'PROCESSING_DOWNLOAD':
        case 'PROCESSING_UPLOAD':
            status = 'processing';
            break;
        case 'SEND_TO_USER_INBOX':
            status = 'incomplete';
            break;
        case 'PUBLISH_COMPLETE':
            // H1: No validated request correlation = no successful status result.
            // Omitted, empty, or whitespace-only correlation must not produce success.
            if (!correlationId || correlationId.trim() === '') {
                status = 'unknown';
            }
            else {
                status = 'success';
            }
            break;
        case 'FAILED':
            status = 'failure';
            break;
        default:
            status = 'unknown';
            break;
    }
    return { publishId, status, failureReason, providerLogId };
}
function extractLogId(obj) {
    if (typeof obj.log_id === 'string')
        return obj.log_id;
    if (typeof obj.logid === 'string')
        return obj.logid;
    return undefined;
}
function extractLogIdFromData(data) {
    if (isObject(data)) {
        return extractLogId(data);
    }
    return undefined;
}
function isObject(v) {
    return typeof v === 'object' && v !== null;
}
