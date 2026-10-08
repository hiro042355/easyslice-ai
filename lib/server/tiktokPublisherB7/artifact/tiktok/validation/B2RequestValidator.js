"use strict";
/**
 * B2 — Request validation for Direct Post and Upload-to-Inbox init requests.
 *
 * Validates DTOs before transport. Validation failures must not call transport.
 *
 * Per official TikTok Content Posting API:
 *   - Direct Post: post_info + source_info
 *   - Upload-to-Inbox: source_info only (no post_info, no privacy, no openId)
 *
 * CHUNK RULES (per official TikTok media-transfer documentation):
 *   - total_chunk_count = floor(video_size / chunk_size)
 *   - Each chunk must be at least 5 MB (5,242,880 bytes) and no greater than 64 MB (67,108,864 bytes)
 *   - The final chunk may be up to 128 MB (134,217,728 bytes) to absorb trailing bytes
 *   - Videos smaller than 5 MB must be uploaded as a single chunk (chunk_size = video_size)
 *   - Minimum 1 chunk, maximum 1000 chunks
 *   - All values must be finite positive integers
 *
 * WAIT_FOR_CANONICAL_NEXCUT: full field validation, cross-field rules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDirectPostInitRequest = validateDirectPostInitRequest;
exports.validateUploadInboxInitRequest = validateUploadInboxInitRequest;
exports.validateStatusCorrelation = validateStatusCorrelation;
exports.validateCreatorInfo = validateCreatorInfo;
const VALID_PRIVACY = [
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'SELF_ONLY',
    'FOLLOWER_OF_CREATOR',
];
// Official TikTok media-transfer documented bounds (in bytes)
const MIN_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB
const MAX_FINAL_CHUNK_SIZE = 128 * 1024 * 1024; // 128 MB
const MAX_TOTAL_CHUNK_COUNT = 1000; // 1000 chunks maximum
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB (official maximum video size)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFiniteInteger(v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isBoolean(v) {
    return typeof v === 'boolean';
}
/**
 * Validate a Direct Post init request, optionally against authoritative Creator Info.
 *
 * If creatorInfo is provided, the privacy level must be in the creator's
 * privacy_level_options, and interaction restrictions (duet/comment/stitch
 * disabled) are enforced: if the creator has an interaction disabled, the
 * request must not try to enable it (disable_* must be true or omitted).
 */
function validateDirectPostInitRequest(req, creatorInfo) {
    const errors = [];
    if (!req || typeof req !== 'object') {
        return { valid: false, errors: ['request is required'] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req;
    if (!r.postInfo || typeof r.postInfo !== 'object') {
        errors.push('postInfo is required');
    }
    else {
        errors.push(...validatePostInfo(r.postInfo, creatorInfo));
    }
    if (!r.sourceInfo || typeof r.sourceInfo !== 'object') {
        errors.push('sourceInfo is required');
    }
    else {
        errors.push(...validateSource(r.sourceInfo));
    }
    return { valid: errors.length === 0, errors };
}
function validateUploadInboxInitRequest(req) {
    const errors = [];
    if (!req || typeof req !== 'object') {
        return { valid: false, errors: ['request is required'] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req;
    // Upload-to-Inbox must NOT contain Direct Post-only fields
    if (r.postInfo !== undefined) {
        errors.push('postInfo must not be present in Upload-to-Inbox request');
    }
    if (r.privacyLevel !== undefined) {
        errors.push('privacyLevel must not be present in Upload-to-Inbox request');
    }
    if (r.creatorInfo !== undefined) {
        errors.push('creatorInfo must not be present in Upload-to-Inbox request');
    }
    if (!r.sourceInfo || typeof r.sourceInfo !== 'object') {
        errors.push('sourceInfo is required');
    }
    else {
        errors.push(...validateSource(r.sourceInfo));
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validate that a status fetch correlation ID is non-empty and valid.
 */
function validateStatusCorrelation(publishId) {
    if (typeof publishId !== 'string' || publishId.trim() === '') {
        return { valid: false, errors: ['publishId is required and must be a non-empty string'] };
    }
    return { valid: true, errors: [] };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateSource(source) {
    const errors = [];
    if (!source || typeof source !== 'object') {
        return ['sourceInfo must be an object'];
    }
    const mode = source.source;
    if (typeof mode !== 'string') {
        errors.push('sourceInfo.source is required');
        return errors;
    }
    if (mode === 'FILE_UPLOAD') {
        // Reject PULL_FROM_URL-only fields
        if (source.videoUrl !== undefined) {
            errors.push('FILE_UPLOAD must not contain videoUrl (PULL_FROM_URL field)');
        }
        if (!isFiniteInteger(source.videoSize) || source.videoSize <= 0) {
            errors.push('FILE_UPLOAD requires videoSize to be a positive finite integer');
        }
        if (!isFiniteInteger(source.chunkSize) || source.chunkSize <= 0) {
            errors.push('FILE_UPLOAD requires chunkSize to be a positive finite integer');
        }
        if (!isFiniteInteger(source.totalChunkCount) || source.totalChunkCount <= 0) {
            errors.push('FILE_UPLOAD requires totalChunkCount to be a positive finite integer');
        }
        // Full documented media-transfer constraints
        if (isFiniteInteger(source.videoSize) && source.videoSize > 0 &&
            isFiniteInteger(source.chunkSize) && source.chunkSize > 0 &&
            isFiniteInteger(source.totalChunkCount) && source.totalChunkCount > 0) {
            const vs = source.videoSize;
            const cs = source.chunkSize;
            const tc = source.totalChunkCount;
            // Small-file rule: videos under 5 MB must be a single chunk with chunk_size = video_size
            if (vs < MIN_CHUNK_SIZE) {
                if (tc !== 1) {
                    errors.push(`FILE_UPLOAD videos smaller than 5 MB must use totalChunkCount=1 (got ${tc})`);
                }
                if (cs !== vs) {
                    errors.push(`FILE_UPLOAD videos smaller than 5 MB must have chunkSize equal to videoSize (${vs}), got ${cs}`);
                }
            }
            else {
                // Videos >= 5 MB: chunk_size must be within 5 MB - 64 MB
                if (cs < MIN_CHUNK_SIZE) {
                    errors.push(`FILE_UPLOAD chunkSize must be at least ${MIN_CHUNK_SIZE} bytes (5 MB), got ${cs}`);
                }
                if (cs > MAX_CHUNK_SIZE) {
                    errors.push(`FILE_UPLOAD chunkSize must not exceed ${MAX_CHUNK_SIZE} bytes (64 MB), got ${cs}`);
                }
            }
            // Videos greater than 64 MB must use multiple chunks.
            if (vs > MAX_CHUNK_SIZE && tc < 2) {
                errors.push('FILE_UPLOAD videos greater than 64 MB must use multiple chunks');
            }
            // M1: Enforce official maximum video size (4 GB)
            if (vs > MAX_VIDEO_SIZE) {
                errors.push(`FILE_UPLOAD videoSize must not exceed ${MAX_VIDEO_SIZE} bytes (4 GB), got ${vs}`);
            }
            // Maximum chunk count
            if (tc > MAX_TOTAL_CHUNK_COUNT) {
                errors.push(`FILE_UPLOAD totalChunkCount must not exceed ${MAX_TOTAL_CHUNK_COUNT}, got ${tc}`);
            }
            // M1: Chunk count consistency: total_chunk_count = floor(video_size / chunk_size)
            // Do NOT clamp an invalid chunk count into validity via Math.max(1, ...).
            const expectedChunkCount = Math.floor(vs / cs);
            if (tc !== expectedChunkCount) {
                errors.push(`FILE_UPLOAD totalChunkCount must be ${expectedChunkCount} for the given videoSize and chunkSize`);
            }
            // Final chunk size must not exceed 128 MB
            const finalChunkSize = vs - cs * (tc - 1);
            if (finalChunkSize > MAX_FINAL_CHUNK_SIZE) {
                errors.push(`FILE_UPLOAD final chunk size (${finalChunkSize}) exceeds the maximum of ${MAX_FINAL_CHUNK_SIZE} bytes (128 MB)`);
            }
        }
    }
    else if (mode === 'PULL_FROM_URL') {
        // Reject FILE_UPLOAD-only fields
        if (source.videoSize !== undefined) {
            errors.push('PULL_FROM_URL must not contain videoSize (FILE_UPLOAD field)');
        }
        if (source.chunkSize !== undefined) {
            errors.push('PULL_FROM_URL must not contain chunkSize (FILE_UPLOAD field)');
        }
        if (source.totalChunkCount !== undefined) {
            errors.push('PULL_FROM_URL must not contain totalChunkCount (FILE_UPLOAD field)');
        }
        if (typeof source.videoUrl !== 'string' || source.videoUrl.trim() === '') {
            errors.push('PULL_FROM_URL requires a non-empty videoUrl string');
        }
        else {
            // Validate URL format
            let parsed;
            try {
                parsed = new URL(source.videoUrl);
            }
            catch (_a) {
                errors.push('PULL_FROM_URL videoUrl must be a valid URL');
                return errors;
            }
            if (parsed.protocol !== 'https:') {
                errors.push('PULL_FROM_URL videoUrl must use HTTPS');
            }
            if (parsed.protocol === 'javascript:' || parsed.protocol === 'data:') {
                errors.push('PULL_FROM_URL videoUrl must not use javascript: or data: protocol');
            }
        }
    }
    else {
        errors.push('sourceInfo.source must be FILE_UPLOAD or PULL_FROM_URL');
    }
    return errors;
}
/**
 * M2: Validate that a Creator Info context is a complete, well-formed object.
 * Unknown/incomplete creator authority must not authorize publishing.
 */
function validateCreatorInfo(creatorInfo) {
    const errors = [];
    if (!creatorInfo || typeof creatorInfo !== 'object') {
        return { valid: false, errors: ['creatorInfo is required'] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ci = creatorInfo;
    if (typeof ci.creatorUsername !== 'string' || ci.creatorUsername.trim() === '') {
        errors.push('creatorInfo.creatorUsername must be a non-empty string');
    }
    if (!Array.isArray(ci.privacyLevelOptions) || ci.privacyLevelOptions.length === 0) {
        errors.push('creatorInfo.privacyLevelOptions must be a non-empty array of strings');
    }
    else if (!ci.privacyLevelOptions.every((v) => typeof v === 'string')) {
        errors.push('creatorInfo.privacyLevelOptions must contain only strings');
    }
    if (typeof ci.commentDisabled !== 'boolean') {
        errors.push('creatorInfo.commentDisabled must be a boolean');
    }
    if (typeof ci.duetDisabled !== 'boolean') {
        errors.push('creatorInfo.duetDisabled must be a boolean');
    }
    if (typeof ci.stitchDisabled !== 'boolean') {
        errors.push('creatorInfo.stitchDisabled must be a boolean');
    }
    if (!isFiniteInteger(ci.maxVideoPostDurationSec) || ci.maxVideoPostDurationSec <= 0) {
        errors.push('creatorInfo.maxVideoPostDurationSec must be a positive finite integer');
    }
    return { valid: errors.length === 0, errors };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validatePostInfo(postInfo, creatorInfo) {
    const errors = [];
    if (!postInfo || typeof postInfo !== 'object') {
        return ['postInfo must be an object'];
    }
    // Title is optional per official contract — do not reject if omitted
    if (postInfo.title !== undefined && (typeof postInfo.title !== 'string' || postInfo.title.trim() === '')) {
        errors.push('postInfo.title must be a non-empty string if provided');
    }
    // Privacy level validation
    if (typeof postInfo.title === 'string' && postInfo.title.length > 2200) {
        errors.push('postInfo.title must not exceed 2200 UTF-16 code units');
    }
    if (!isBoolean(postInfo.brandContentToggle)) {
        errors.push('postInfo.brandContentToggle is required and must be a boolean');
    }
    for (const field of ['brandOrganicToggle', 'isAigc']) {
        if (postInfo[field] !== undefined && !isBoolean(postInfo[field])) {
            errors.push(`postInfo.${field} must be a boolean if provided`);
        }
    }
    if (postInfo.brandContentToggle === true && postInfo.privacyLevel === 'SELF_ONLY') {
        errors.push('branded content cannot use SELF_ONLY privacy');
    }
    if (typeof postInfo.privacyLevel !== 'string' || !VALID_PRIVACY.includes(postInfo.privacyLevel)) {
        errors.push('postInfo.privacyLevel must be one of: PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY, FOLLOWER_OF_CREATOR');
    }
    else if (creatorInfo) {
        // Authoritative creator info: privacy must be in creator's options.
        // Empty privacy options authorize NO privacy selection.
        if (creatorInfo.privacyLevelOptions.length === 0) {
            errors.push('creator has no available privacy_level_options; no privacy selection is permitted');
        }
        else if (!creatorInfo.privacyLevelOptions.includes(postInfo.privacyLevel)) {
            errors.push(`postInfo.privacyLevel ${postInfo.privacyLevel} is not available for this creator (allowed: ${creatorInfo.privacyLevelOptions.join(', ')})`);
        }
    }
    // Optional metadata: disableDuet, disableComment, disableStitch must be booleans if present
    if (postInfo.disableDuet !== undefined && !isBoolean(postInfo.disableDuet)) {
        errors.push('postInfo.disableDuet must be a boolean if provided');
    }
    if (postInfo.disableComment !== undefined && !isBoolean(postInfo.disableComment)) {
        errors.push('postInfo.disableComment must be a boolean if provided');
    }
    if (postInfo.disableStitch !== undefined && !isBoolean(postInfo.disableStitch)) {
        errors.push('postInfo.disableStitch must be a boolean if provided');
    }
    // videoCoverTimestampMs must be a finite non-negative integer if present
    if (postInfo.videoCoverTimestampMs !== undefined) {
        if (!isFiniteInteger(postInfo.videoCoverTimestampMs) || postInfo.videoCoverTimestampMs < 0 || postInfo.videoCoverTimestampMs > 2147483647) {
            errors.push('postInfo.videoCoverTimestampMs must be a non-negative finite integer if provided');
        }
    }
    // Interaction restriction enforcement from creator info
    if (creatorInfo) {
        if (creatorInfo.duetDisabled && postInfo.disableDuet === false) {
            errors.push('creator has duet disabled; cannot enable duet (disableDuet must be true or omitted)');
        }
        if (creatorInfo.commentDisabled && postInfo.disableComment === false) {
            errors.push('creator has comment disabled; cannot enable comments (disableComment must be true or omitted)');
        }
        if (creatorInfo.stitchDisabled && postInfo.disableStitch === false) {
            errors.push('creator has stitch disabled; cannot enable stitch (disableStitch must be true or omitted)');
        }
    }
    return errors;
}
