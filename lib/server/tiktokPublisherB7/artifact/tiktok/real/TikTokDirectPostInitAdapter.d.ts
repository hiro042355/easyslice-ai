/**
 * B3-4 — Direct Post initialization real-provider adapter.
 *
 * Bridges the B3-2 AuthenticatedTikTokTransport to the existing B2
 * Direct Post validation, serialization, and init-response parsing
 * authority.
 *
 * The adapter:
 *   - requires validated Creator Info context (mandatory, no fallback)
 *   - validates the creator context BEFORE transport (reuse B2 validator)
 *   - validates the Direct Post init request BEFORE transport (reuse B2 validator)
 *   - serializes using the existing B2 wire serializer
 *   - calls ONLY the official Direct Post init endpoint
 *   - delegates response parsing to the existing B2 init response parser
 *   - returns a deterministic result preserving publish_id and upload_url
 *
 * The adapter does NOT:
 *   - accept access tokens
 *   - construct Authorization headers
 *   - call the auth provider directly
 *   - call global fetch
 *   - implement media upload, submit, or status polling
 *
 * WAIT_FOR_B3_5: media transfer adapter using the returned upload_url.
 */
import type { DirectPostInitRequest, TikTokCreatorInfo } from '../contracts/DirectPostContracts';
import type { TikTokCreatorInfoData } from '../contracts/TikTokCreatorInfoParser';
import type { AuthenticatedTikTokTransport } from './AuthenticatedTikTokTransport';
/** B3-only media input; never serialized into the TikTok wire request. */
export interface RealDirectPostInitRequest extends DirectPostInitRequest {
    /**
     * Actual duration in seconds, supplied by the trusted publication/media caller
     * for the same video identified by sourceInfo, including PULL_FROM_URL.
     * Must be finite and positive. Fractional seconds are compared without rounding.
     * This adapter does not measure media or infer duration from bytes/URLs.
     */
    readonly actualVideoDurationSec: number;
}
export interface DirectPostInitAdapterResult {
    readonly success: boolean;
    readonly publishId: string;
    readonly uploadUrl?: string;
    readonly errorMessage?: string;
    readonly validationErrors?: readonly string[];
    readonly httpStatus: number;
}
export declare class TikTokDirectPostInitAdapter {
    private readonly transport;
    constructor(transport: AuthenticatedTikTokTransport);
    /**
     * Initialize a Direct Post.
     *
     * @param req          - B3 request including required actualVideoDurationSec
     * @param creatorInfo  - Validated Creator Info context (mandatory, no fallback)
     *
     * Validation failures (creator context or request) are rejected BEFORE
     * transport, resulting in zero HTTP executor calls.
     */
    initDirectPost(req: unknown, creatorInfo: TikTokCreatorInfo | TikTokCreatorInfoData | null | undefined): Promise<DirectPostInitAdapterResult>;
}
