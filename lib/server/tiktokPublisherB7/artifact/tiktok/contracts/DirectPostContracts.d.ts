/**
 * B2 — Direct Post DTOs for TikTok Content Posting API (video.publish scope).
 *
 * Direct Post represents an attempt to publish directly to the creator's
 * TikTok profile. It requires the video.publish scope.
 *
 * Per official docs, the init request body contains:
 *   - post_info: title, privacy_level, disable_duet, disable_comment,
 *     disable_stitch, video_cover_timestamp_ms
 *   - source_info: source mode + media fields
 *
 * Documented privacy levels:
 *   PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY, FOLLOWER_OF_CREATOR
 *
 * IMPORTANT: Direct Post initialization success is NOT publication success.
 * A successful init returns a publish_id and optionally an upload_url —
 * the post is not published until status fetch confirms PUBLISH_COMPLETE.
 *
 * WAIT_FOR_CANONICAL_NEXCUT: full field coverage, brand info, entropy handling.
 */
import { TikTokVideoSource } from './TikTokSourceMode';
export type TikTokPrivacyLevel = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY' | 'FOLLOWER_OF_CREATOR';
export interface TikTokCreatorInfo {
    readonly creatorAvatarUrl?: string;
    readonly creatorUsername: string;
    readonly creatorNickname?: string;
    readonly privacyLevelOptions: readonly string[];
    readonly commentDisabled: boolean;
    readonly duetDisabled: boolean;
    readonly stitchDisabled: boolean;
    readonly maxVideoPostDurationSec: number;
}
export interface DirectPostPostInfo {
    readonly brandContentToggle: boolean;
    readonly brandOrganicToggle?: boolean;
    readonly isAigc?: boolean;
    readonly title?: string;
    readonly privacyLevel: TikTokPrivacyLevel;
    readonly disableDuet?: boolean;
    readonly disableComment?: boolean;
    readonly disableStitch?: boolean;
    readonly videoCoverTimestampMs?: number;
}
export interface DirectPostInitRequest {
    readonly postInfo: DirectPostPostInfo;
    readonly sourceInfo: TikTokVideoSource;
}
export interface DirectPostInitResponse {
    readonly publishId: string;
    readonly uploadUrl?: string;
}
export interface CreatorInfoQueryRequest {
    readonly openId: string;
}
