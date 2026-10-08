"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TikTokCreatorInfoAdapter = void 0;
const TikTokEndpoints_1 = require("../client/TikTokEndpoints");
const TikTokCreatorInfoParser_1 = require("../contracts/TikTokCreatorInfoParser");
class TikTokCreatorInfoAdapter {
    constructor(transport) {
        this.transport = transport;
    }
    async queryCreatorInfo() {
        var _a;
        const response = await this.transport.request({
            method: 'POST',
            path: TikTokEndpoints_1.TIKTOK_ENDPOINTS.creatorInfoQuery,
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        });
        if (!(response.status >= 200 && response.status < 300)) {
            return {
                success: false,
                errorMessage: 'Creator Info HTTP request was unsuccessful',
                httpStatus: response.status,
            };
        }
        const parsed = (0, TikTokCreatorInfoParser_1.parseCreatorInfoResponse)(response.body);
        if (parsed.outcome !== 'success' || !parsed.creatorInfo) {
            return {
                success: false,
                errorMessage: (_a = parsed.errorMessage) !== null && _a !== void 0 ? _a : 'creator info parse failure',
                httpStatus: response.status,
            };
        }
        return {
            success: true,
            creatorInfo: parsed.creatorInfo,
            httpStatus: response.status,
        };
    }
}
exports.TikTokCreatorInfoAdapter = TikTokCreatorInfoAdapter;
