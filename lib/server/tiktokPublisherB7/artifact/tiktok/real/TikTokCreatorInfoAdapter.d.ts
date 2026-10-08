/**
 * B3-3 — Creator Info real-provider adapter.
 *
 * Bridges the B3-2 AuthenticatedTikTokTransport to the existing B2
 * Creator Info parser. The adapter:
 *   - issues the Creator Info request through the authenticated transport
 *   - delegates parsing to parseCreatorInfoResponse (B2 authority)
 *   - returns the parsed result without duplicating parsing logic
 *
 * The adapter does NOT:
 *   - accept access tokens
 *   - construct Authorization headers
 *   - call the auth provider directly
 *   - call global fetch
 *   - instantiate a production HTTP executor
 *
 * WAIT_FOR_B3_4: Direct Post / orchestrator composition.
 */
import { TikTokCreatorInfoData } from '../contracts/TikTokCreatorInfoParser';
import type { AuthenticatedTikTokTransport } from './AuthenticatedTikTokTransport';
export interface CreatorInfoAdapterResult {
    readonly success: boolean;
    readonly creatorInfo?: TikTokCreatorInfoData;
    readonly errorMessage?: string;
    readonly httpStatus: number;
}
export declare class TikTokCreatorInfoAdapter {
    private readonly transport;
    constructor(transport: AuthenticatedTikTokTransport);
    queryCreatorInfo(): Promise<CreatorInfoAdapterResult>;
}
