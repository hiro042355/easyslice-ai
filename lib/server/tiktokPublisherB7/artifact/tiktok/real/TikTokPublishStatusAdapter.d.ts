/**
 * B3-6 — Publish Status real-provider adapter.
 *
 * Fetches publish status for a single publish_id through the
 * AuthenticatedTikTokTransport, reusing the existing B2 status
 * parser and correlation validation authority.
 *
 * The adapter:
 *   - validates the publish_id correlation BEFORE transport
 *   - sends a POST to the official status fetch endpoint
 *   - delegates response parsing to parseStatusResponse (B2 authority)
 *   - preserves request correlation on every result (success and failure)
 *
 * The adapter does NOT:
 *   - accept access tokens
 *   - construct Authorization headers
 *   - call the auth provider directly
 *   - call global fetch
 *   - use the B3-5 UploadExecutor
 *   - implement polling, retry, or scheduling
 *
 * WAIT_FOR_B3_7: orchestrator / final publish composition.
 */
import { TikTokPublishStatus } from '../contracts/TikTokStatusContracts';
import type { AuthenticatedTikTokTransport } from './AuthenticatedTikTokTransport';
export interface PublishStatusAdapterResult {
    readonly publishId: string;
    readonly status: TikTokPublishStatus;
    readonly failureReason?: string;
    readonly providerLogId?: string;
    readonly correlationConflict?: boolean;
    readonly httpStatus: number;
    readonly validationErrors?: readonly string[];
}
export declare class TikTokPublishStatusAdapter {
    private readonly transport;
    constructor(transport: AuthenticatedTikTokTransport);
    /**
     * Fetch publish status for a single publish_id.
     *
     * One invocation = one status request. No polling, no retry.
     *
     * @param publishId - The publish_id correlation identifier (required, non-empty)
     */
    fetchStatus(publishId: string): Promise<PublishStatusAdapterResult>;
}
