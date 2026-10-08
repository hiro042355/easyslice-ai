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
import { TikTokCreatorInfo } from '../contracts/DirectPostContracts';
export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: readonly string[];
}
/**
 * Validate a Direct Post init request, optionally against authoritative Creator Info.
 *
 * If creatorInfo is provided, the privacy level must be in the creator's
 * privacy_level_options, and interaction restrictions (duet/comment/stitch
 * disabled) are enforced: if the creator has an interaction disabled, the
 * request must not try to enable it (disable_* must be true or omitted).
 */
export declare function validateDirectPostInitRequest(req: unknown, creatorInfo?: TikTokCreatorInfo | null): ValidationResult;
export declare function validateUploadInboxInitRequest(req: unknown): ValidationResult;
/**
 * Validate that a status fetch correlation ID is non-empty and valid.
 */
export declare function validateStatusCorrelation(publishId: unknown): ValidationResult;
/**
 * M2: Validate that a Creator Info context is a complete, well-formed object.
 * Unknown/incomplete creator authority must not authorize publishing.
 */
export declare function validateCreatorInfo(creatorInfo: unknown): ValidationResult;
