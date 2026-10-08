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
export type TikTokPublishStatus = 'processing' | 'incomplete' | 'success' | 'failure' | 'unknown';
export interface ParsedStatusResult {
    readonly publishId: string;
    readonly status: TikTokPublishStatus;
    readonly failureReason?: string;
    readonly providerLogId?: string;
    readonly correlationConflict?: boolean;
}
/**
 * Check whether the TikTok response envelope is a valid success envelope.
 * Returns true only when:
 *   - error exists and is an object
 *   - error.code is a string
 *   - error.code === "ok"
 */
export declare function isValidSuccessEnvelope(raw: unknown): boolean;
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
export declare function parseStatusResponse(raw: unknown, requestPublishId?: string): ParsedStatusResult;
