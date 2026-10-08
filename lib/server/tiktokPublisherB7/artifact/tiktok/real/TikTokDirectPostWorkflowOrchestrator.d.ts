/**
 * B3-7 — Direct Post workflow orchestrator.
 *
 * Composes existing B3 adapters into a deterministic workflow:
 *   1. Direct Post initialization (B3-4)
 *   2. FILE_UPLOAD media transfer (B3-5) — only for FILE_UPLOAD sources
 *   3. Optional one-shot status fetch (B3-6) — only when explicitly requested
 *
 * The orchestrator does NOT:
 *   - re-validate creator authority, request layout, or chunk plans
 *   - accept access tokens or construct Authorization
 *   - call TikTokAuthProvider, global fetch, or production executors
 *   - implement polling, retry, or scheduling
 *   - invent a final-submit endpoint
 *
 * Each existing adapter owns its own validation/authority. The orchestrator
 * only coordinates stage ordering and short-circuits on failure.
 *
 * WAIT_FOR_B3_8: Upload Inbox / multi-source orchestration.
 */
import type { TikTokCreatorInfo } from '../contracts/DirectPostContracts';
import type { TikTokCreatorInfoData } from '../contracts/TikTokCreatorInfoParser';
import type { TikTokDirectPostInitAdapter, DirectPostInitAdapterResult } from './TikTokDirectPostInitAdapter';
import type { TikTokMediaTransferBoundary, MediaTransferResult } from './TikTokMediaTransferBoundary';
import type { TikTokPublishStatusAdapter, PublishStatusAdapterResult } from './TikTokPublishStatusAdapter';
export type WorkflowStage = 'init_rejected' | 'init_failed' | 'init_succeeded' | 'transfer_failed' | 'transfer_succeeded' | 'pull_from_url_accepted' | 'status_fetched' | 'status_failed';
export type WorkflowSourceMode = 'FILE_UPLOAD' | 'PULL_FROM_URL' | 'unknown';
export interface WorkflowStatusResult {
    readonly status: PublishStatusAdapterResult['status'];
    readonly publishId: string;
    readonly failureReason?: string;
    readonly correlationConflict?: boolean;
    readonly httpStatus: number;
}
export interface DirectPostWorkflowResult {
    readonly stage: WorkflowStage;
    readonly sourceMode: WorkflowSourceMode;
    readonly publishId: string;
    readonly initResult?: DirectPostInitAdapterResult;
    readonly transferResult?: MediaTransferResult;
    readonly statusResult?: WorkflowStatusResult;
    readonly errorMessage?: string;
}
export interface WorkflowOptions {
    readonly fetchStatus?: boolean;
}
export declare class TikTokDirectPostWorkflowOrchestrator {
    private readonly initAdapter;
    private readonly mediaTransfer;
    private readonly statusAdapter;
    constructor(initAdapter: TikTokDirectPostInitAdapter, mediaTransfer: TikTokMediaTransferBoundary, statusAdapter: TikTokPublishStatusAdapter);
    /** req must include B3 actualVideoDurationSec; init owns validation for both sources. */
    execute(req: unknown, creatorInfo: TikTokCreatorInfo | TikTokCreatorInfoData | null | undefined, options?: WorkflowOptions): Promise<DirectPostWorkflowResult>;
    private fetchOneShotStatus;
}
