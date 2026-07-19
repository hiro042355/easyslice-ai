import { durableTransactionFailure, durableTransactionSuccess } from "../durableTransaction";
import type { DurableWorkflowTransactionFailureCode, DurableWorkflowTransactionManager, DurableWorkflowTransactionOptions } from "../durableTransaction";
import type { ObservationStore, ReconciliationAtomicInputV2, ReconciliationOutboxStore, ReconciliationRequestStoreV2, ResolutionStoreV2, StoreRecordResult } from "./types";

export type ReconciliationAtomicConflictClass = "stale-revision" | "stale-fence" | "writer-epoch-mismatch" | "wrong-prior-state" | "semantic-conflict" | "terminal-preserved";
export type ReconciliationAtomicTransitionResultV2 = Readonly<{ status: "committed"; outcome: "created" | "replayed" }> | Readonly<{ status: "conflict"; conflictClass: ReconciliationAtomicConflictClass }> | Readonly<{ status: "corrupted" }> | Readonly<{ status: "unavailable"; retryable: boolean }>;
export type ReconciliationAtomicExecutorV2 = Readonly<{ executorVersion: "2.1"; descriptor: typeof POSTGRESQL_RECONCILIATION_ATOMIC_EXECUTOR_V2_DESCRIPTOR; execute(input: ReconciliationAtomicInputV2): Promise<ReconciliationAtomicTransitionResultV2> }>;

export const POSTGRESQL_RECONCILIATION_ATOMIC_EXECUTOR_V2_DESCRIPTOR = Object.freeze({ descriptorVersion: "2.1", id: "postgresql-reconciliation-atomic-executor-v2", serverOnly: true, transactionBound: true, rollbackBeforeProjection: true, requestCasLast: true, runtimeComposable: false, productionReady: false } as const);

type Stores = Readonly<{ requests: ReconciliationRequestStoreV2; observations: ObservationStore; resolutions: ResolutionStoreV2; outbox: ReconciliationOutboxStore }>;
type LocalFailure = Readonly<{ result: Exclude<ReconciliationAtomicTransitionResultV2, { status: "committed" }>; transactionFailure: DurableWorkflowTransactionFailureCode }>;

const recordFailure = <T>(result: StoreRecordResult<T>): LocalFailure => {
  if (result.status === "unavailable") return Object.freeze({ result: Object.freeze({ status: "unavailable", retryable: true }), transactionFailure: "unavailable" });
  if (result.status === "corrupted" || result.status === "legacy-unready") return Object.freeze({ result: Object.freeze({ status: "corrupted" }), transactionFailure: "transaction-aborted" });
  const conflictClass: ReconciliationAtomicConflictClass = result.status === "stale-revision" ? "stale-revision" : result.status === "stale-fence" ? "stale-fence" : result.status === "stale-writer" ? "writer-epoch-mismatch" : result.status === "terminal" ? "terminal-preserved" : result.status === "conflict" || result.status === "replayed" ? "semantic-conflict" : "wrong-prior-state";
  return Object.freeze({ result: Object.freeze({ status: "conflict", conflictClass }), transactionFailure: "retryable-conflict" });
};

export function createPostgreSQLReconciliationAtomicExecutorV2(manager: DurableWorkflowTransactionManager, options: DurableWorkflowTransactionOptions, stores: Stores): ReconciliationAtomicExecutorV2 {
  return Object.freeze({
    executorVersion: "2.1" as const,
    descriptor: POSTGRESQL_RECONCILIATION_ATOMIC_EXECUTOR_V2_DESCRIPTOR,
    async execute(input: ReconciliationAtomicInputV2): Promise<ReconciliationAtomicTransitionResultV2> {
      let localFailure: LocalFailure | undefined;
      const execution = await manager.runInTransaction(options, async context => {
        let outcome: "created" | "replayed" = "replayed";
        const observation = await stores.observations.appendIfAbsent(context, input.observation);
        if (observation.status !== "created" && observation.status !== "replayed") { localFailure = recordFailure(observation); return durableTransactionFailure(localFailure.transactionFailure); }
        if (observation.status === "created") outcome = "created";
        if (input.resolution) {
          const resolution = await stores.resolutions.appendForAtomicTransitionV2(context, Object.freeze({ draft: input.resolution, requestIdentity: input.requestIdentity, expectedRequestRevision: input.expectedRevision, expectedPriorStates: input.expectedPriorStates, authority: input.authority }));
          if (resolution.status !== "created" && resolution.status !== "replayed") { localFailure = recordFailure(resolution); return durableTransactionFailure(localFailure.transactionFailure); }
          if (resolution.status === "created") outcome = "created";
        }
        if (input.outbox) {
          const event = await stores.outbox.appendIfAbsent(context, input.outbox);
          if (event.status !== "created" && event.status !== "replayed") { localFailure = recordFailure(event); return durableTransactionFailure(localFailure.transactionFailure); }
          if (event.status === "created") outcome = "created";
        }
        const request = await stores.requests.transitionV2(context, Object.freeze({ identity: input.requestIdentity, expectedRevision: input.expectedRevision, expectedPriorStates: input.expectedPriorStates, authority: input.authority, nextState: input.nextState, resolutionClass: input.resolution?.resolutionClass }));
        if (request.status !== "updated") { localFailure = recordFailure(request); return durableTransactionFailure(localFailure.transactionFailure); }
        return durableTransactionSuccess(Object.freeze({ status: "committed" as const, outcome }));
      });
      if (execution.status === "committed") return execution.value;
      if (execution.status === "rolled-back" && execution.failure !== "rollback-failed" && localFailure) return localFailure.result;
      return Object.freeze({ status: "unavailable", retryable: execution.status !== "rejected" });
    },
  });
}

export const validatePostgreSQLReconciliationAtomicExecutorV2 = (value: unknown) => {
  if (typeof value !== "object" || value === null) return Object.freeze({ status: "invalid" as const, issues: Object.freeze(["not-an-object"]) });
  const candidate = value as Partial<ReconciliationAtomicExecutorV2>;
  const issues: string[] = [];
  if (candidate.executorVersion !== "2.1") issues.push("version-invalid");
  if (candidate.descriptor?.id !== POSTGRESQL_RECONCILIATION_ATOMIC_EXECUTOR_V2_DESCRIPTOR.id) issues.push("descriptor-invalid");
  if (typeof candidate.execute !== "function") issues.push("execute-missing");
  return issues.length ? Object.freeze({ status: "invalid" as const, issues: Object.freeze(issues) }) : Object.freeze({ status: "valid" as const });
};
