"use strict";
/**
 * B2 — TikTok Content Posting API endpoint constants (B2 scope only).
 *
 * Only documented B2 endpoints are represented here.
 * Deprecated Share Video endpoints are intentionally absent.
 *
 * WAIT_FOR_CANONICAL_NEXCUT: additional endpoints, versioning policy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIKTOK_ENDPOINTS = exports.TIKTOK_API_BASE = void 0;
exports.TIKTOK_API_BASE = 'https://open.tiktokapis.com';
exports.TIKTOK_ENDPOINTS = {
    creatorInfoQuery: '/v2/post/publish/creator_info/query/',
    directPostVideoInit: '/v2/post/publish/video/init/',
    uploadInboxVideoInit: '/v2/post/publish/inbox/video/init/',
    statusFetch: '/v2/post/publish/status/fetch/',
};
