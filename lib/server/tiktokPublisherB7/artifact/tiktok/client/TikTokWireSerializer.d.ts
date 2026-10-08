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
/**
 * Serialize a Direct Post init request into the documented TikTok wire format.
 * Only allowlisted fields are included.
 */
export declare function serializeDirectPostWireBody(req: unknown): Record<string, unknown>;
/**
 * Serialize an Upload-to-Inbox init request into the documented TikTok wire format.
 * Only source_info is included — NO post_info, NO privacy, NO creator metadata.
 */
export declare function serializeUploadInboxWireBody(req: unknown): Record<string, unknown>;
