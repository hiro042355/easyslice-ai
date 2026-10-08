"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCreatorInfoResponse = parseCreatorInfoResponse;
const TikTokStatusContracts_1 = require("./TikTokStatusContracts");
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
function parseCreatorInfoResponse(raw) {
    if (!isObject(raw)) {
        return { outcome: 'failure', errorMessage: 'response is not an object' };
    }
    // Must have valid success envelope
    if (!(0, TikTokStatusContracts_1.isValidSuccessEnvelope)(raw)) {
        const error = raw.error;
        if (isObject(error)) {
            const errorObj = error;
            const code = errorObj.code;
            if (typeof code === 'string' && code !== 'ok') {
                const message = typeof errorObj.message === 'string' ? errorObj.message : 'unknown error';
                return { outcome: 'failure', errorMessage: message };
            }
        }
        return { outcome: 'failure', errorMessage: 'missing or invalid success envelope' };
    }
    const data = raw.data;
    if (!isObject(data)) {
        return { outcome: 'failure', errorMessage: 'missing data object' };
    }
    const d = data;
    // Required: creator_username
    const creatorUsername = typeof d.creator_username === 'string' ? d.creator_username : '';
    if (!creatorUsername) {
        return { outcome: 'failure', errorMessage: 'missing creator_username' };
    }
    // Required: privacy_level_options — must be an array of strings.
    // Empty arrays and non-string entries do NOT authorize any privacy selection.
    const rawPrivacyOptions = d.privacy_level_options;
    if (!Array.isArray(rawPrivacyOptions)) {
        return { outcome: 'failure', errorMessage: 'missing or invalid privacy_level_options' };
    }
    // Reject if any entry is non-string — malformed options authorize nothing
    const allStrings = rawPrivacyOptions.every((v) => typeof v === 'string');
    if (!allStrings) {
        return { outcome: 'failure', errorMessage: 'privacy_level_options contains non-string entries' };
    }
    const privacyLevelOptions = rawPrivacyOptions;
    // Required capability fields must be actual booleans; malformed data is rejected.
    if (typeof d.comment_disabled !== 'boolean' || typeof d.duet_disabled !== 'boolean' || typeof d.stitch_disabled !== 'boolean') {
        return { outcome: 'failure', errorMessage: 'missing or invalid interaction capability fields' };
    }
    const commentDisabled = d.comment_disabled;
    const duetDisabled = d.duet_disabled;
    const stitchDisabled = d.stitch_disabled;
    // N4: Required duration must satisfy the official int32 field type.
    // Must be finite, integer, positive, and not exceed int32 maximum (2147483647).
    const INT32_MAX = 2147483647;
    const rawDuration = d.max_video_post_duration_sec;
    if (typeof rawDuration !== 'number' ||
        !Number.isFinite(rawDuration) ||
        !Number.isInteger(rawDuration) ||
        rawDuration <= 0 ||
        rawDuration > INT32_MAX) {
        return { outcome: 'failure', errorMessage: 'missing or invalid max_video_post_duration_sec' };
    }
    const maxVideoPostDurationSec = rawDuration;
    // Optional fields
    const creatorAvatarUrl = typeof d.creator_avatar_url === 'string' ? d.creator_avatar_url : undefined;
    const creatorNickname = typeof d.creator_nickname === 'string' ? d.creator_nickname : undefined;
    return {
        outcome: 'success',
        creatorInfo: {
            creatorAvatarUrl,
            creatorUsername,
            creatorNickname,
            privacyLevelOptions,
            commentDisabled,
            duetDisabled,
            stitchDisabled,
            maxVideoPostDurationSec,
        },
    };
}
function isObject(v) {
    return typeof v === 'object' && v !== null;
}
