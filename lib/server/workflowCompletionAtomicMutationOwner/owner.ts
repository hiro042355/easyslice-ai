import { decideWorkflowCompletionTransactionCleanupV1 } from "../workflowCompletionTransactionCleanup";
import type { PostgreSQLQueryConnectionDisposition } from "../productionWorkflowRuntime/postgresqlDriver/types";
import type { WorkflowCompletionAtomicComponentResultV1, WorkflowCompletionAtomicMutationOwnerV1, WorkflowCompletionAtomicOwnerComponentEvidenceV1, WorkflowCompletionAtomicOwnerConsistencyEvidenceV1, WorkflowCompletionAtomicOwnerDependenciesV1, WorkflowCompletionAtomicOwnerInputV1, WorkflowCompletionAtomicOwnerResultV1, WorkflowCompletionAtomicOwnerSafeValue, WorkflowCompletionAtomicMutationStage } from "./types";

const copy = (value: WorkflowCompletionAtomicOwnerSafeValue): WorkflowCompletionAtomicOwnerSafeValue => value instanceof Uint8Array ? Uint8Array.from(value) : Array.isArray(value) ? Object.freeze(value.map(copy)) : value !== null && typeof value === "object" ? Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]))) : value;
const clone = <T>(value: T): T => {
  if (value instanceof Uint8Array) return Uint8Array.from(value) as T;
  if (Array.isArray(value)) return Object.freeze(value.map(clone)) as T;
  if (value !== null && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]))) as T;
  return value;
};
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item instanceof Uint8Array ? Array.from(item) : item);
const same = (a: WorkflowCompletionAtomicOwnerConsistencyEvidenceV1, b: WorkflowCompletionAtomicOwnerConsistencyEvidenceV1) => stable(a) === stable(b);
export const validateWorkflowCompletionAtomicOwnerConsistencyV1 = (input: WorkflowCompletionAtomicOwnerInputV1): boolean => Object.values(input.componentConsistency).every((value) => same(input.consistency, value)) && stable(input.consistency.workflowIdentity) === stable(input.commitIntent.workflowIdentity) && stable(input.consistency.logicalAttemptIdentity) === stable(input.commitIntent.logicalAttemptIdentity) && input.consistency.completionTimestamp === input.commitIntent.terminalMetadata.completedAt && stable(input.consistency.resultReference) === stable(input.commitIntent.resultReference) && stable(input.consistency.replayIdentity) === stable(input.commitIntent.replayIdentity) && stable(input.consistency.operationIdentity) === stable(input.commitIntent.completionOperationIdentity) && stable(input.consistency.outboxIdentity) === stable(input.commitIntent.outboxEventIdentity) && stable(input.consistency.commitIntentIdentity) === stable(input.commitIntent.workflowFinalResultIdentity) && input.consistency.completionRevisionEvidence === input.commitIntent.expectedPostCommitRevision;

const stageOrder: readonly WorkflowCompletionAtomicMutationStage[] = Object.freeze(["final-result", "workflow-completion-state", "result-reference", "replay-completion", "outbox"]);
const evidence = (stage: WorkflowCompletionAtomicMutationStage, result: WorkflowCompletionAtomicComponentResultV1): WorkflowCompletionAtomicOwnerComponentEvidenceV1 => Object.freeze({ evidenceVersion: "1.0", stage, invoked: true, classification: result.classification, success: result.status === "success", ...(result.evidence === undefined ? {} : { evidence: copy(result.evidence) }) });
const dispositionOf = (result: Exclude<WorkflowCompletionAtomicComponentResultV1, { status: "success" }>): PostgreSQLQueryConnectionDisposition => result.queryConnectionDisposition;

async function cleanupFailure(session: Parameters<WorkflowCompletionAtomicOwnerDependenciesV1["executeFinalResult"]>[0], result: Exclude<WorkflowCompletionAtomicComponentResultV1, { status: "success" }>) {
  let decision = decideWorkflowCompletionTransactionCleanupV1({ inputVersion: "1.0", phase: "query-failure", queryConnectionDisposition: dispositionOf(result) });
  if (decision.action === "discard") return { decision, rollbackAttempted: false, cleanupResult: session.discard().status };
  if (decision.action === "rollback-then-release" || decision.action === "rollback-then-discard-on-failure") {
    const rollback = await session.rollbackV2();
    decision = decideWorkflowCompletionTransactionCleanupV1({ inputVersion: "1.0", phase: "rollback-result", result: rollback });
    const cleanupResult = decision.action === "release" ? session.release() : session.discard().status;
    return { decision, rollbackAttempted: true, cleanupResult };
  }
  return { decision, rollbackAttempted: false, cleanupResult: decision.action === "release" ? session.release() : "no-action" };
}

export const createWorkflowCompletionAtomicMutationOwnerV1 = (dependencies: WorkflowCompletionAtomicOwnerDependenciesV1): WorkflowCompletionAtomicMutationOwnerV1 => Object.freeze({ ownerVersion: "1.0", async execute(input): Promise<WorkflowCompletionAtomicOwnerResultV1> {
  if (!validateWorkflowCompletionAtomicOwnerConsistencyV1(input)) return Object.freeze({ resultVersion: "1.0", status: "validation-failure", failedStage: "input-validation", reason: "cross-component-consistency-mismatch", mutationAttempted: false, commitAttempted: false, retryAttempted: false, componentEvidence: Object.freeze([]) });
  let session;
  try { session = await dependencies.acquireSession(); } catch { return Object.freeze({ resultVersion: "1.0", status: "execution-failure", failedStage: "session", issue: "session-acquisition-failed", safeReason: "workflow-completion-session-unavailable", retryable: false, connectionDisposition: "unknown", retryAttempted: false, componentEvidence: Object.freeze([]) }); }
  const calls = { "final-result": dependencies.executeFinalResult, "workflow-completion-state": dependencies.executeWorkflowState, "result-reference": dependencies.executeResultReference, "replay-completion": dependencies.executeReplayCompletion, outbox: dependencies.executeOutbox } as const;
  const summaries: WorkflowCompletionAtomicOwnerComponentEvidenceV1[] = [];
  for (const stage of stageOrder) {
    let result: WorkflowCompletionAtomicComponentResultV1;
    try { result = await calls[stage](session, copy(input.stageInputs[stage])); } catch { result = Object.freeze({ resultVersion: "1.0", status: "execution-failure", classification: "dependency-exception", issue: "dependency-exception", safeReason: "workflow-completion-mutation-failed", retryable: false, queryConnectionDisposition: "unknown" }); }
    summaries.push(evidence(stage, result));
    if (result.status !== "success") {
      const cleaned = await cleanupFailure(session, result);
      if (result.status === "not-committed") return Object.freeze({ resultVersion: "1.0", status: "not-committed", failedStage: stage, componentClassification: result.classification, cleanupDecision: cleaned.decision, rollbackAttempted: cleaned.rollbackAttempted, cleanupResult: cleaned.cleanupResult, lookupRequired: result.lookupRequired, retryAttempted: false, componentEvidence: Object.freeze(summaries) });
      return Object.freeze({ resultVersion: "1.0", status: "execution-failure", failedStage: stage, issue: result.issue, safeReason: result.safeReason, retryable: result.retryable, ...(result.sqlStateClass === undefined ? {} : { sqlStateClass: result.sqlStateClass }), connectionDisposition: result.queryConnectionDisposition, cleanupDecision: cleaned.decision, cleanupResult: cleaned.cleanupResult, retryAttempted: false, componentEvidence: Object.freeze(summaries) });
    }
  }
  const committed = await session.commitV2();
  const decision = decideWorkflowCompletionTransactionCleanupV1({ inputVersion: "1.0", phase: "commit-result", result: committed });
  const cleanupResult = decision.action === "release" ? session.release() : decision.action === "discard" ? session.discard().status : "no-action";
  if (committed.status === "unknown-outcome") return Object.freeze({ resultVersion: "1.0", status: "commit-unknown", failedStage: "commit", rollbackAttempted: false, automaticRetryAllowed: false, reconciliationRequired: true, reconciliationIdentity: clone(input.commitIntent), commitIntent: clone(input.commitIntent), cleanupDecision: decision, discardResult: cleanupResult, retryAttempted: false, componentEvidence: Object.freeze(summaries) });
  if (committed.status !== "committed") return Object.freeze({ resultVersion: "1.0", status: "not-committed", failedStage: "commit", componentClassification: committed.status, cleanupDecision: decision, rollbackAttempted: false, cleanupResult, lookupRequired: false, retryAttempted: false, componentEvidence: Object.freeze(summaries) });
  if (cleanupResult !== "released" && cleanupResult !== "already-released") return Object.freeze({ resultVersion: "1.0", status: "execution-failure", failedStage: decision.action === "discard" ? "discard" : "release", issue: "post-commit-cleanup-failed", safeReason: "workflow-completion-cleanup-failed", retryable: false, connectionDisposition: decision.connectionDisposition, cleanupDecision: decision, cleanupResult, retryAttempted: false, componentEvidence: Object.freeze(summaries) });
  return Object.freeze({ resultVersion: "1.0", status: "committed", workflowIdentity: clone(input.consistency.workflowIdentity), logicalAttemptIdentity: clone(input.consistency.logicalAttemptIdentity), completionTimestamp: input.consistency.completionTimestamp, resultReference: clone(input.consistency.resultReference), commitIntent: clone(input.commitIntent), cleanupDecision: decision, retryAttempted: false, componentEvidence: Object.freeze(summaries) });
} });

export const createDefaultProductionWorkflowCompletionAtomicMutationOwnerV1 = createWorkflowCompletionAtomicMutationOwnerV1;
