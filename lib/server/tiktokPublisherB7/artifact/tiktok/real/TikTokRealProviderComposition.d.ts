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
import type { TikTokAuthProvider } from './TikTokAuthProvider';
import type { TikTokProviderConfig } from './TikTokProviderConfig';
import type { HttpExecutor } from './HttpExecutor';
import type { UploadExecutor } from './UploadExecutor';
import { TikTokCreatorInfoAdapter } from './TikTokCreatorInfoAdapter';
import { TikTokDirectPostWorkflowOrchestrator } from './TikTokDirectPostWorkflowOrchestrator';
export interface TikTokRealCompositionDependencies {
    readonly authProvider: TikTokAuthProvider;
    readonly httpExecutor: HttpExecutor;
    readonly uploadExecutor: UploadExecutor;
    readonly timeoutMs: number;
    readonly retryPolicy: TikTokProviderConfig['retryPolicy'];
}
export interface TikTokRealComposition {
    readonly creatorInfo: TikTokCreatorInfoAdapter;
    readonly directPostWorkflow: TikTokDirectPostWorkflowOrchestrator;
}
/**
 * Wire all B3 real-provider components from injected dependencies.
 *
 * One AuthenticatedTikTokTransport is constructed and shared among
 * all authenticated API adapters. The UploadExecutor is wired only
 * into TikTokMediaTransferBoundary — never into the authenticated
 * transport — preserving upload token isolation.
 */
export declare function createTikTokRealProviderComposition(deps: TikTokRealCompositionDependencies): TikTokRealComposition;
