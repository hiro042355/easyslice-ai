import { projectReferenceWorkflowView } from "@/lib/workflowUi/referenceWorkflowViewProjector";
import type { WorkflowUiControllerResult, WorkflowUiState } from "@/lib/workflowUi/types";
import type { ReferenceWorkflowHookCommandResult, ReferenceWorkflowHookEnvironmentSnapshot, ReferenceWorkflowHookViewState } from "./referenceWorkflowHookTypes";

const safeEnvironment = (value: ReferenceWorkflowHookEnvironmentSnapshot): ReferenceWorkflowHookEnvironmentSnapshot => ({ online: value.online === true, visibility: value.visibility === "hidden" ? "hidden" : "visible" });
const freezePublicView = <T,>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const nested of Object.values(value as Record<string, unknown>)) freezePublicView(nested); Object.freeze(value); } return value; };
const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ak = Object.keys(a as object), bk = Object.keys(b as object);
  return ak.length === bk.length && ak.every(k => Object.prototype.hasOwnProperty.call(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

export function createReferenceWorkflowHookView(state: WorkflowUiState, environment: ReferenceWorkflowHookEnvironmentSnapshot): ReferenceWorkflowHookViewState {
  const core = projectReferenceWorkflowView(state), env = safeEnvironment(environment);
  const focusTargetHint = core.displayStatus === "failed" ? "error-heading" : core.displayStatus === "cancelled" ? "cancelled-heading" : core.isTerminal ? "result-heading" : undefined;
  return freezePublicView({ ...core, viewVersion: "1.0" as const, ...env, accessibility: { ariaBusy: core.isBusy, liveMessageKey: core.messageKey, statusRole: core.displayStatus === "failed" ? "alert" as const : "status" as const, focusTargetHint } });
}

export function createReferenceWorkflowSemanticSnapshotCache(initialState: WorkflowUiState, initialEnvironment: ReferenceWorkflowHookEnvironmentSnapshot) {
  let view = createReferenceWorkflowHookView(initialState, initialEnvironment);
  return Object.freeze({ getSnapshot: () => view, update(state: WorkflowUiState, environment: ReferenceWorkflowHookEnvironmentSnapshot) { try { const next = createReferenceWorkflowHookView(state, environment); if (!same(view, next)) view = next; } catch { return view; } return view; } });
}

export function mapReferenceWorkflowCommandResult(result: WorkflowUiControllerResult, view: ReferenceWorkflowHookViewState): ReferenceWorkflowHookCommandResult {
  const status = result.status === "disposed" ? "disposed" : result.status === "preempted" ? "preempted" : result.status === "terminal-replayed" ? "terminal-replayed" : result.status === "conflict" ? "conflict" : view.isTerminal ? (view.displayStatus === "failed" ? "failed" : "completed") : view.serverStatus === "pending-upload" || view.serverStatus === "pending-generation" ? "pending" : "accepted";
  return { resultVersion: "1.0", status, messageKey: result.status === "conflict" ? result.error.messageKey : view.messageKey, state: view };
}

export const createReferenceWorkflowSafeCommandFailure = (status: "not-ready" | "invalid" | "failed", view: ReferenceWorkflowHookViewState): ReferenceWorkflowHookCommandResult => ({ resultVersion: "1.0", status, messageKey: status === "not-ready" ? "workflow.inputNotReady" : status === "invalid" ? "workflow.requestInvalid" : "workflow.internalError", state: view });

export function createReferenceWorkflowTimerGeneration() { let generation = 0; return Object.freeze({ next: () => ++generation, isCurrent: (value: number) => value === generation }); }
