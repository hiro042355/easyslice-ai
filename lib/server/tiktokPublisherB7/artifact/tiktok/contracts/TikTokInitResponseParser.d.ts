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
export type InitParseOutcome = 'success' | 'failure';
export interface ParsedInitResponse {
    readonly outcome: InitParseOutcome;
    readonly publishId: string;
    readonly uploadUrl?: string;
    readonly errorMessage?: string;
}
/**
 * Parse an init response for a FILE_UPLOAD source.
 * Requires publish_id AND upload_url for success.
 */
export declare function parseFileUploadInitResponse(raw: unknown): ParsedInitResponse;
/**
 * Parse an init response for a PULL_FROM_URL source.
 * Requires publish_id; upload_url is optional.
 */
export declare function parsePullFromUrlInitResponse(raw: unknown): ParsedInitResponse;
