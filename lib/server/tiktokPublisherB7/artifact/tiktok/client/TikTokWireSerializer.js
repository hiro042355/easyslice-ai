"use strict";
/**
 * B2 — Explicit wire serialization for TikTok Content Posting API requests.
 *
 * Builds allowlisted TikTok wire payloads from internal DTOs.
 * Converts internal camelCase fields to documented snake_case wire fields.
 * Only documented fields are included — arbitrary extra properties are never
 * forwarded to the wire.
 *
 * DIRECT POST wire body (per official docs):
 *   post_info: { title, privacy_level, disable_duet, disable_comment,
 *                disable_stitch, video_cover_timestamp_ms }
 *   source_info: { source, video_size, chunk_size, total_chunk_count | video_url }
 *
 * UPLOAD-TO-INBOX wire body (per official docs):
 *   source_info: { source, video_size, chunk_size, total_chunk_count | video_url }
 *   (NO post_info, NO privacy, NO creator metadata)
 *
 * WAIT_FOR_CANONICAL_NEXCUT: full field coverage, brand info.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeDirectPostWireBody = serializeDirectPostWireBody;
exports.serializeUploadInboxWireBody = serializeUploadInboxWireBody;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isFiniteInteger(v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}
/**
 * Serialize a Direct Post init request into the documented TikTok wire format.
 * Only allowlisted fields are included.
 */
function serializeDirectPostWireBody(req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req;
    const body = {};
    // post_info (allowlisted)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pi = r === null || r === void 0 ? void 0 : r.postInfo;
    const postInfo = {};
    if (pi) {
        for (const [domain, wire] of [
            ['brandContentToggle', 'brand_content_toggle'],
            ['brandOrganicToggle', 'brand_organic_toggle'],
            ['isAigc', 'is_aigc'],
        ]) {
            if (typeof pi[domain] === 'boolean')
                postInfo[wire] = pi[domain];
        }
        if (typeof pi.title === 'string' && pi.title.trim() !== '') {
            postInfo.title = pi.title;
        }
        if (typeof pi.privacyLevel === 'string') {
            postInfo.privacy_level = pi.privacyLevel;
        }
        if (typeof pi.disableDuet === 'boolean') {
            postInfo.disable_duet = pi.disableDuet;
        }
        if (typeof pi.disableComment === 'boolean') {
            postInfo.disable_comment = pi.disableComment;
        }
        if (typeof pi.disableStitch === 'boolean') {
            postInfo.disable_stitch = pi.disableStitch;
        }
        if (isFiniteInteger(pi.videoCoverTimestampMs) && pi.videoCoverTimestampMs >= 0 && pi.videoCoverTimestampMs <= 2147483647) {
            postInfo.video_cover_timestamp_ms = pi.videoCoverTimestampMs;
        }
    }
    body.post_info = postInfo;
    // source_info (allowlisted)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const si = r === null || r === void 0 ? void 0 : r.sourceInfo;
    body.source_info = serializeSourceInfoWire(si);
    return body;
}
/**
 * Serialize an Upload-to-Inbox init request into the documented TikTok wire format.
 * Only source_info is included — NO post_info, NO privacy, NO creator metadata.
 */
function serializeUploadInboxWireBody(req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req;
    const body = {};
    // source_info only — no post_info, no privacy, no creatorInfo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const si = r === null || r === void 0 ? void 0 : r.sourceInfo;
    body.source_info = serializeSourceInfoWire(si);
    return body;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSourceInfoWire(si) {
    const sourceInfo = {};
    if (!si || typeof si.source !== 'string') {
        return sourceInfo;
    }
    sourceInfo.source = si.source;
    if (si.source === 'FILE_UPLOAD') {
        if (isFiniteInteger(si.videoSize) && si.videoSize > 0) {
            sourceInfo.video_size = si.videoSize;
        }
        if (isFiniteInteger(si.chunkSize) && si.chunkSize > 0) {
            sourceInfo.chunk_size = si.chunkSize;
        }
        if (isFiniteInteger(si.totalChunkCount) && si.totalChunkCount > 0) {
            sourceInfo.total_chunk_count = si.totalChunkCount;
        }
    }
    else if (si.source === 'PULL_FROM_URL') {
        if (typeof si.videoUrl === 'string' && si.videoUrl.trim() !== '') {
            sourceInfo.video_url = si.videoUrl;
        }
    }
    return sourceInfo;
}
