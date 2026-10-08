"use strict";
/**
 * B3-8 — Real provider composition root.
 *
 * Single authoritative wiring location for all B3 real-provider
 * components. Injects external capabilities (auth provider, HTTP
 * executor, upload executor) and constructs the dependency graph:
 *
 *   TikTokAuthProvider
 *          |
 *          v
 *   AuthenticatedTikTokTransport (one shared instance)
 *          |
 *          +---------------------------+
 *          |                           |
 *          v                           v
 *   TikTokCreatorInfoAdapter   TikTokDirectPostInitAdapter
 *                                       |
 *                                       v
 *                          TikTokDirectPostWorkflowOrchestrator
 *                                       |
 *                         +-------------+--------------+
 *                         |                            |
 *                         v                            v
 *          TikTokMediaTransferBoundary     TikTokPublishStatusAdapter
 *                         |
 *                         v
 *                   UploadExecutor
 *
 * The composition root does NOT implement protocol behavior, OAuth,
 * production executors, polling, retry, or credential loading.
 *
 * WAIT_FOR_B3_9: Upload Inbox / multi-source composition.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTikTokRealProviderComposition = createTikTokRealProviderComposition;
const TikTokEndpoints_1 = require("../client/TikTokEndpoints");
const AuthenticatedTikTokTransport_1 = require("./AuthenticatedTikTokTransport");
const TikTokCreatorInfoAdapter_1 = require("./TikTokCreatorInfoAdapter");
const TikTokDirectPostInitAdapter_1 = require("./TikTokDirectPostInitAdapter");
const TikTokMediaTransferBoundary_1 = require("./TikTokMediaTransferBoundary");
const TikTokPublishStatusAdapter_1 = require("./TikTokPublishStatusAdapter");
const TikTokDirectPostWorkflowOrchestrator_1 = require("./TikTokDirectPostWorkflowOrchestrator");
/**
 * Wire all B3 real-provider components from injected dependencies.
 *
 * One AuthenticatedTikTokTransport is constructed and shared among
 * all authenticated API adapters. The UploadExecutor is wired only
 * into TikTokMediaTransferBoundary — never into the authenticated
 * transport — preserving upload token isolation.
 */
function createTikTokRealProviderComposition(deps) {
    const config = {
        apiBase: TikTokEndpoints_1.TIKTOK_API_BASE,
        authProvider: deps.authProvider,
        timeoutMs: deps.timeoutMs,
        retryPolicy: deps.retryPolicy,
    };
    const transport = new AuthenticatedTikTokTransport_1.AuthenticatedTikTokTransport(config, deps.httpExecutor);
    const creatorInfo = new TikTokCreatorInfoAdapter_1.TikTokCreatorInfoAdapter(transport);
    const initAdapter = new TikTokDirectPostInitAdapter_1.TikTokDirectPostInitAdapter(transport);
    const mediaTransfer = new TikTokMediaTransferBoundary_1.TikTokMediaTransferBoundary(deps.uploadExecutor);
    const statusAdapter = new TikTokPublishStatusAdapter_1.TikTokPublishStatusAdapter(transport);
    const directPostWorkflow = new TikTokDirectPostWorkflowOrchestrator_1.TikTokDirectPostWorkflowOrchestrator(initAdapter, mediaTransfer, statusAdapter);
    return { creatorInfo, directPostWorkflow };
}
