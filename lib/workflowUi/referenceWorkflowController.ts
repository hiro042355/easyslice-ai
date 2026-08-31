import type { WorkflowApiErrorCode, WorkflowApiResultDTO } from "@/lib/workflowApi/types";
import type { WorkflowUiApiClientResult, WorkflowUiController, WorkflowUiControllerDependencies, WorkflowUiControllerInput, WorkflowUiControllerResult, WorkflowUiEvent, WorkflowUiState, WorkflowUiWorkflowResultRecoverySession } from "./types";
import { createInitialWorkflowUiState, reduceWorkflowUiState } from "./workflowUiReducer";
import { compareWorkflowUiTerminalResults, copyWorkflowUi, createInitialPollState, createWorkflowUiError, validateWorkflowUiServiceResult } from "./workflowUiUtils";
import { migrateWorkflowUiSessionV1ToV2 } from "./referenceWorkflowSessionStore";
import { REFERENCE_WORKFLOW_UI_POLL_POLICY } from "./referenceWorkflowPollScheduler";

const RESULT_REFERENCE_TTL_MS = 30 * 60 * 1000;
const terminalKind = (kind: WorkflowUiState["kind"]) => ["completed", "degraded", "partial", "failed", "cancelled"].includes(kind);
const terminalBody = (state: WorkflowUiState): WorkflowApiResultDTO | undefined => state.kind === "completed" || state.kind === "degraded" || state.kind === "partial" || state.kind === "cancelled" ? state.result : state.kind === "failed" && state.resultReference ? { responseVersion: "1.0", status: "failed", operation: state.operation, error: { errorVersion: "1.0", code: state.error.code as WorkflowApiErrorCode, message: "Safe failure.", retryable: state.error.retryable }, resultReference: copyWorkflowUi(state.resultReference) } : undefined;

export function createReferenceWorkflowController(d: WorkflowUiControllerDependencies): WorkflowUiController {
  const pollPolicy = d.pollPolicy ?? REFERENCE_WORKFLOW_UI_POLL_POLICY;
  let state: WorkflowUiState = createInitialWorkflowUiState(), disposed = false, generation = 0, online = true, visible = true, workflowStartedAt = 0;
  type Active = { command: string; promise: Promise<WorkflowUiControllerResult>; generation: number; preemptible: boolean; preempted: boolean };
  let active: Active | undefined, pendingIntent: "none" | "reconcile" = "none";
  const listeners = new Set<(state: WorkflowUiState) => void>(), keys: { start?: string; pollUpload?: string; pollGeneration?: string; resultQuery?: string; cancel?: string } = {};
  const nextToken = () => generation = generation >= Number.MAX_SAFE_INTEGER ? 1 : generation + 1;
  const snapshot = () => copyWorkflowUi(state);
  const result = (): WorkflowUiControllerResult => disposed ? { status: "disposed", state: snapshot() } : { status: "completed", state: snapshot() };
  const replayed = (): WorkflowUiControllerResult => ({ status: "terminal-replayed", state: snapshot() });
  const conflict = (): WorkflowUiControllerResult => ({ status: "conflict", error: createWorkflowUiError("command-conflict"), state: snapshot() });
  const preempted = (): WorkflowUiControllerResult => ({ status: "preempted", state: snapshot() });
  const pending = () => state.kind === "pending-upload" || state.kind === "pending-generation" ? state : undefined;
  const pollBudgetAvailable = () => { const value = pending(); return !!value && value.poll.budget.attempts < pollPolicy.maxAttempts && value.poll.budget.elapsedMs < pollPolicy.maxElapsedMs && value.poll.budget.consecutiveNetworkFailures < pollPolicy.maxConsecutiveNetworkFailures; };
  const exhaustPollBudget = () => { const value = pending(); if (value) dispatch({ type: "POLL_BUDGET_EXHAUSTED", generation: value.generation, poll: d.pollScheduler.pause(value.poll) }); return conflict(); };
  const notify = () => { for (const listener of [...listeners]) try { listener(snapshot()); } catch {} };
  const dispatch = (event: WorkflowUiEvent) => { const output = reduceWorkflowUiState(state, event); state = output.state; if (output.status === "transitioned" && !disposed) notify(); return output; };
  const persistPending = () => { const value = pending(); if (!value) return; const createdAt = d.clock.nowUtc(); d.sessionStore.save({ sessionVersion: "2.0", operation: value.operation, reference: copyWorkflowUi(value.reference), lastServerStatus: value.serverStatus, pollAttempts: value.poll.budget.attempts, createdAt, expiresAt: d.clock.expiresAtUtc(d.sessionTtlMs) }); };
  const persistTerminal = (createdAt?: string, expiresAt?: string) => {
    if (!terminalKind(state.kind) || !("resultReference" in state) || !state.resultReference) { d.sessionStore.delete(); return; }
    const created = createdAt ?? d.clock.nowUtc(), expiry = expiresAt ?? d.clock.expiresAtUtc(RESULT_REFERENCE_TTL_MS);
    const terminalState = state as WorkflowUiState & { operation: WorkflowUiWorkflowResultRecoverySession["operation"]; resultReference: WorkflowUiWorkflowResultRecoverySession["reference"]; kind: WorkflowUiWorkflowResultRecoverySession["lastServerStatus"] };
    state = { ...terminalState, resultReferenceExpiresAt: expiry } as WorkflowUiState;
    d.sessionStore.save({ sessionVersion: "2.0", operation: terminalState.operation, reference: copyWorkflowUi(terminalState.resultReference), lastServerStatus: terminalState.kind, pollAttempts: 0, createdAt: created, expiresAt: expiry });
  };
  const safeCall = async (call: () => Promise<WorkflowUiApiClientResult>): Promise<WorkflowUiApiClientResult> => { try { return await call(); } catch { return { status: "network-error", error: createWorkflowUiError("network-unavailable", true) }; } };
  const drainReconcileIntent = () => { if (pendingIntent !== "reconcile" || disposed || active || !pending() || !online || !visible) return; pendingIntent = "none"; void controller.queryResult(); };
  const settle = (api: WorkflowUiApiClientResult, token: number, startCommand = false) => {
    if (disposed || token !== generation) return false;
    if (api.status === "response") dispatch({ type: "COMMAND_SUCCEEDED", generation: token, result: api.result });
    else if (api.status === "network-error") dispatch(startCommand ? { type: "REQUEST_ABORTED", generation: token } : { type: "COMMAND_FAILED", generation: token, error: api.error });
    else dispatch({ type: "REQUEST_ABORTED", generation: token });
    if (pending()) persistPending(); else if (terminalKind(state.kind)) persistTerminal();
    return true;
  };
  const begin = (command: string, work: () => Promise<WorkflowUiControllerResult>, preemptible = false) => {
    const record = {} as Active;
    let workPromise: Promise<WorkflowUiControllerResult>; try { workPromise = work(); } catch { workPromise = Promise.resolve(conflict()); }
    const promise = workPromise.then(value => record.preempted ? preempted() : value).catch(() => record.preempted ? preempted() : result()).finally(() => { if (active === record) { active = undefined; globalThis.queueMicrotask(drainReconcileIntent); } });
    Object.assign(record, { command, promise, generation, preemptible, preempted: false }); active = record; return promise;
  };
  const invoke = (command: string, work: () => Promise<WorkflowUiControllerResult>, preemptible = false) => disposed ? Promise.resolve(result()) : active ? active.command === command ? active.promise : Promise.resolve(conflict()) : begin(command, work, preemptible);
  const query = async (reference: object) => { keys.resultQuery ??= d.keyFactory.next("result-query"); const api = await safeCall(() => d.apiClient.queryResult({ request: { requestVersion: "1.0", reference: copyWorkflowUi(reference) }, idempotencyKey: keys.resultQuery! })); if (api.status === "response") keys.resultQuery = undefined; return api; };

  const controller: WorkflowUiController = {
    start(input: WorkflowUiControllerInput) { return invoke("start", async () => { if (state.kind !== "idle") return conflict(); const token = nextToken(); workflowStartedAt = d.clock.nowMs(); keys.start ??= d.keyFactory.next("start"); dispatch({ type: "START_REQUESTED", operation: input.operation, generation: token }); const api = await safeCall(() => d.apiClient.start({ request: copyWorkflowUi(input.request) as unknown as Record<string, unknown>, idempotencyKey: keys.start! })); settle(api, token, true); return result(); }); },
    pollUpload() { return invoke("poll-upload", async () => { if (state.kind !== "pending-upload" || state.activeCommand !== "none" || !online || !visible) return conflict(); if (!pollBudgetAvailable()) return exhaustPollBudget(); const before = copyWorkflowUi(state.poll), reference = copyWorkflowUi(state.reference), token = nextToken(), reserved = d.pollScheduler.recordAttempt(before, { elapsedMs: Math.max(0, d.clock.nowMs() - workflowStartedAt), networkFailure: false }); keys.pollUpload ??= d.keyFactory.next("poll-upload"); dispatch({ type: "POLL_STARTED", generation: token, poll: reserved }); const api = await safeCall(() => d.apiClient.pollUpload({ request: { requestVersion: "1.0", pendingReference: reference }, idempotencyKey: keys.pollUpload! })); if (api.status === "response") keys.pollUpload = undefined; const accepted = settle(api, token); if (accepted && pending()) { const updated = { ...reserved, budget: { ...reserved.budget, elapsedMs: Math.max(0, d.clock.nowMs() - workflowStartedAt), consecutiveNetworkFailures: api.status === "network-error" ? before.budget.consecutiveNetworkFailures + 1 : 0 } }; dispatch({ type: api.status === "response" ? "POLL_SCHEDULED" : "POLL_PAUSED", generation: token, poll: updated }); persistPending(); } return result(); }, true); },
    pollGeneration() { return invoke("poll-generation", async () => { if (state.kind !== "pending-generation" || state.activeCommand !== "none" || !online || !visible) return conflict(); if (!pollBudgetAvailable()) return exhaustPollBudget(); const before = copyWorkflowUi(state.poll), reference = copyWorkflowUi(state.reference), token = nextToken(), reserved = d.pollScheduler.recordAttempt(before, { elapsedMs: Math.max(0, d.clock.nowMs() - workflowStartedAt), networkFailure: false }); keys.pollGeneration ??= d.keyFactory.next("poll-generation"); dispatch({ type: "POLL_STARTED", generation: token, poll: reserved }); const api = await safeCall(() => d.apiClient.pollGeneration({ request: { requestVersion: "1.0", generationReference: reference }, idempotencyKey: keys.pollGeneration! })); if (api.status === "response") keys.pollGeneration = undefined; const accepted = settle(api, token); if (accepted && pending()) { const updated = { ...reserved, budget: { ...reserved.budget, elapsedMs: Math.max(0, d.clock.nowMs() - workflowStartedAt), consecutiveNetworkFailures: api.status === "network-error" ? before.budget.consecutiveNetworkFailures + 1 : 0 } }; dispatch({ type: api.status === "response" ? "POLL_SCHEDULED" : "POLL_PAUSED", generation: token, poll: updated }); persistPending(); } return result(); }, true); },
    queryResult() { return invoke("query-result", async () => {
      if (terminalKind(state.kind)) {
        if (!("resultReference" in state) || !state.resultReference || !terminalBody(state)) return conflict(); if (state.resultReferenceExpiresAt && d.clock.nowUtc() >= state.resultReferenceExpiresAt) { d.sessionStore.delete(); return conflict(); }
        const original = snapshot(); nextToken(); const api = await query(state.resultReference); if (disposed || generation !== active?.generation && active?.command !== "query-result") return result();
        if (api.status !== "response") return conflict(); const checked = validateWorkflowUiServiceResult(api.result); if (checked.status !== "valid" || checked.value.status !== "success") return conflict();
        const comparison = compareWorkflowUiTerminalResults(terminalBody(original), checked.value.body); return comparison.status === "same" ? replayed() : conflict();
      }
      const value = pending(); if (!value) return conflict(); const reference = copyWorkflowUi(value.reference), token = nextToken(); dispatch({ type: "RECOVERY_REQUESTED", generation: token }); const api = await query(reference); settle(api, token); return result();
    }, true); },
    cancel() { if (disposed) return Promise.resolve(result()); if (terminalKind(state.kind)) return Promise.resolve(replayed()); if (active?.command === "cancel") return active.promise; const value = pending(); const recoverOfPending = active?.command === "recover" && !!value; if (!value || active && !active.preemptible && !recoverOfPending) return Promise.resolve(conflict()); const previous = copyWorkflowUi(value), reference = copyWorkflowUi(value.reference); if (active) active.preempted = true; nextToken(); active = undefined; pendingIntent = "none"; return begin("cancel", async () => { const token = generation; keys.cancel ??= d.keyFactory.next("cancel"); dispatch({ type: "CANCEL_REQUESTED", generation: token }); const api = await safeCall(() => d.apiClient.cancel({ request: { requestVersion: "1.0", reference }, idempotencyKey: keys.cancel! })); if (api.status === "response" && api.result.status === "success" && api.result.body.status === "cancelled") { settle(api, token); d.sessionStore.delete(); return result(); } pendingIntent = "reconcile"; dispatch({ type: "CANCEL_PREEMPTION_FAILED", generation: token, previous, error: api.status === "network-error" ? api.error : createWorkflowUiError("workflow-conflict") }); persistPending(); return result(); }); },
    pausePolling(reason) { const value = pending(); if (!value) return conflict(); if (reason === "offline") online = false; else visible = false; dispatch({ type: reason === "offline" ? "NETWORK_OFFLINE" : "VISIBILITY_HIDDEN", generation: value.generation }); persistPending(); return result(); },
    resumePolling(reason) { if (reason === "online") online = true; else visible = true; if (!pending()) return Promise.resolve(conflict()); if (!online || !visible) return Promise.resolve(result()); if (active) { pendingIntent = "reconcile"; return Promise.resolve(result()); } pendingIntent = "none"; return controller.queryResult(); },
    recover() { return invoke("recover", async () => {
      const baseline = d.clock.nowUtc(), loaded = d.sessionStore.load(baseline); if (loaded.status !== "loaded") return conflict(); const migrated = migrateWorkflowUiSessionV1ToV2(loaded.session, baseline);
      if (migrated.status !== "migrated" && migrated.status !== "already-v2") { d.sessionStore.delete(); return conflict(); }
      const session = migrated.session, token = nextToken(); workflowStartedAt = d.clock.nowMs();
      if (session.reference.kind === "workflow-result") {
        dispatch({ type: "RESULT_RECOVERY_STARTED", operation: session.operation, generation: token, reference: copyWorkflowUi(session.reference), expiresAt: session.expiresAt });
        const api = await query(session.reference); if (disposed || token !== generation) return result();
        if (api.status !== "response") { dispatch({ type: "RESULT_RECOVERY_FAILED", generation: token }); return conflict(); }
        const checked = validateWorkflowUiServiceResult(api.result);
        if (checked.status !== "valid" || checked.value.status !== "success" || checked.value.body.status === "pending-upload" || checked.value.body.status === "pending-generation" || checked.value.body.operation !== session.operation || checked.value.body.resultReference.reference !== session.reference.reference) {
          const code = checked.status === "valid" && checked.value.status === "error" ? checked.value.body.code : "response-invalid"; if (code === "reference-expired" || code === "reference-unavailable") d.sessionStore.delete(); dispatch({ type: "RESULT_RECOVERY_FAILED", generation: token }); return conflict();
        }
        dispatch({ type: "COMMAND_SUCCEEDED", generation: token, result: api.result }); persistTerminal(session.createdAt, session.expiresAt); return result();
      }
      const poll = createInitialPollState(); state = session.reference.kind === "upload-pending" ? { uiStateVersion: "1.0", kind: "pending-upload", operation: session.operation, serverStatus: "pending-upload", activity: "paused", activeCommand: "none", generation: token, reference: copyWorkflowUi(session.reference), poll: { ...poll, budget: { ...poll.budget, attempts: session.pollAttempts } } } : { uiStateVersion: "1.0", kind: "pending-generation", operation: session.operation, serverStatus: "pending-generation", activity: "paused", activeCommand: "none", generation: token, reference: copyWorkflowUi(session.reference), poll: { ...poll, budget: { ...poll.budget, attempts: session.pollAttempts } } }; notify(); dispatch({ type: "RECOVERY_REQUESTED", generation: token }); const api = await query(session.reference); settle(api, token); return result();
    }, false); },
    reset() { nextToken(); active = undefined; pendingIntent = "none"; keys.start = keys.pollUpload = keys.pollGeneration = keys.resultQuery = keys.cancel = undefined; online = true; visible = true; workflowStartedAt = 0; dispatch({ type: "RESET_REQUESTED" }); d.sessionStore.delete(); return result(); },
    getState: snapshot,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { if (disposed) return; disposed = true; nextToken(); active = undefined; pendingIntent = "none"; listeners.clear(); }
  };
  return Object.freeze(controller);
}
