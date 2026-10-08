/**
 * B2 — TikTok Content Posting API endpoint constants (B2 scope only).
 *
 * Only documented B2 endpoints are represented here.
 * Deprecated Share Video endpoints are intentionally absent.
 *
 * WAIT_FOR_CANONICAL_NEXCUT: additional endpoints, versioning policy.
 */
export declare const TIKTOK_API_BASE = "https://open.tiktokapis.com";
export declare const TIKTOK_ENDPOINTS: {
    readonly creatorInfoQuery: "/v2/post/publish/creator_info/query/";
    readonly directPostVideoInit: "/v2/post/publish/video/init/";
    readonly uploadInboxVideoInit: "/v2/post/publish/inbox/video/init/";
    readonly statusFetch: "/v2/post/publish/status/fetch/";
};
export type TikTokEndpointPath = (typeof TIKTOK_ENDPOINTS)[keyof typeof TIKTOK_ENDPOINTS];
