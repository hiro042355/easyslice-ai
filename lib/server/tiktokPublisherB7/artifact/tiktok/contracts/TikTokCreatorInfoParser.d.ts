/**
 * B2 — Creator Info response parser.
 *
 * Parses the TikTok Creator Info response conservatively against the current
 * official contract. Provider-returned options are authoritative — unknown
 * values are never converted into approval.
 *
 * Documented response fields (per official TikTok Content Posting API):
 *   data.creator_avatar_url, data.creator_username, data.creator_nickname,
 *   data.privacy_level_options, data.comment_disabled, data.duet_disabled,
 *   data.stitch_disabled, data.max_video_post_duration_sec
 *   error.code, error.message, error.log_id
 *
 * WAIT_FOR_CANONICAL_NEXCUT: full creator capability coverage.
 */
export interface ParsedCreatorInfo {
    readonly outcome: 'success' | 'failure';
    readonly creatorInfo?: TikTokCreatorInfoData;
    readonly errorMessage?: string;
}
export interface TikTokCreatorInfoData {
    readonly creatorAvatarUrl?: string;
    readonly creatorUsername: string;
    readonly creatorNickname?: string;
    readonly privacyLevelOptions: readonly string[];
    readonly commentDisabled: boolean;
    readonly duetDisabled: boolean;
    readonly stitchDisabled: boolean;
    readonly maxVideoPostDurationSec: number;
}
/**
 * Parsed capability field result — distinguishes a valid boolean from
 * a missing/malformed value so the validator never treats unknown data
 * as "not restricted" (false).
 */
export interface ParsedCapability {
    readonly value: boolean;
    readonly valid: boolean;
}
/**
 * Parse a Creator Info response body conservatively.
 *
 * Success requires:
 *   1. Valid success envelope (error.code === "ok")
 *   2. data object with required fields
 *
 * Unknown privacy level options are preserved as-is (strings) — the validator
 * checks requests against them, and unknown values are never approved.
 */
export declare function parseCreatorInfoResponse(raw: unknown): ParsedCreatorInfo;
