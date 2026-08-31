import { getReferenceWorkflowErrorMessageKey } from "./referenceWorkflowErrorMessages";
import { presentWorkflowAssets } from "./referenceWorkflowAssetPresenter";
import type { WorkflowUiState } from "./types";

export type ReferenceWorkflowViewCore = {
  operation?: "generate-vocal" | "generate-music" | "generate-mv";
  displayStatus: WorkflowUiState["kind"];
  serverStatus: WorkflowUiState["serverStatus"];
  activity: WorkflowUiState extends { activity: infer A } ? A : never;
  activeCommand: WorkflowUiState extends { activeCommand: infer C } ? C : never;
  assets: ReturnType<typeof presentWorkflowAssets>;
  messageKey: `workflow.${string}`;
  progress?: { stage: "upload" | "generation" | "ingestion"; percent?: number };
  retryAdvice?: { retryable: boolean; retryAfterClass?: "short" | "medium" | "long" };
  canStart: boolean;
  canPoll: boolean;
  canQueryResult: boolean;
  canCancel: boolean;
  canReset: boolean;
  isBusy: boolean;
  isTerminal: boolean;
  isPollingPaused: boolean;
};

const terminal = new Set(["completed", "degraded", "partial", "failed", "cancelled"]);
const messages: Record<WorkflowUiState["kind"], `workflow.${string}`> = {
  idle: "workflow.idle", starting: "workflow.starting", "pending-upload": "workflow.pendingUpload",
  "pending-generation": "workflow.pendingGeneration", cancelling: "workflow.cancelling",
  completed: "workflow.completed", degraded: "workflow.degraded", partial: "workflow.partial",
  failed: "workflow.failed", cancelled: "workflow.cancelled", "recovering-result": "workflow.recoveringResult",
};

export function projectReferenceWorkflowView(state: WorkflowUiState): ReferenceWorkflowViewCore {
  const pending = state.kind === "pending-upload" || state.kind === "pending-generation";
  const isTerminal = terminal.has(state.kind);
  const assets = state.kind === "completed" || state.kind === "degraded" || state.kind === "partial"
    ? presentWorkflowAssets(state.result.assets) : [];
  const messageKey = state.kind === "failed"
    ? getReferenceWorkflowErrorMessageKey(state.error.code) : messages[state.kind];
  const operation = state.kind === "starting" || state.kind === "pending-upload" || state.kind === "pending-generation" || state.kind === "cancelling" || state.kind === "recovering-result" || state.kind === "failed" ? state.operation : undefined;
  return {
    operation,
    displayStatus: state.kind,
    serverStatus: state.serverStatus,
    activity: state.kind === "idle" ? "idle" : state.activity,
    activeCommand: state.kind === "idle" ? "none" : state.activeCommand,
    assets,
    messageKey,
    progress: pending && state.progress ? { ...state.progress } : undefined,
    retryAdvice: pending && state.retryAdvice ? { ...state.retryAdvice } : undefined,
    canStart: state.kind === "idle",
    canPoll: pending && state.activeCommand === "none" && state.activity !== "requesting",
    canQueryResult: (pending || isTerminal) && state.activeCommand === "none",
    canCancel: pending && state.activeCommand !== "cancel",
    canReset: state.kind !== "starting" && state.kind !== "cancelling",
    isBusy: state.kind === "starting" || state.kind === "cancelling" || state.kind === "recovering-result" || (pending && state.activeCommand !== "none"),
    isTerminal,
    isPollingPaused: pending && state.activity === "paused",
  };
}
