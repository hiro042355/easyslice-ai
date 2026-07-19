import { DurableWorkflowAsyncScopeOwner } from "./durableWorkflowAsyncScope";
import { DurableWorkflowTransactionContextOwner } from "./durableWorkflowTransactionContext";
import { validateDurableWorkflowTransactionOptions } from "./durableWorkflowTransactionUtils";
import type {
  DurableWorkflowAfterCommitResult,
  DurableWorkflowTransactionFailureCode,
  DurableWorkflowTransactionClock,
  DurableWorkflowTransactionExecutionResult,
  DurableWorkflowTransactionManager,
  DurableWorkflowTransactionManagerState,
  DurableWorkflowTransactionOperationResult,
  DurableWorkflowTransactionOptions,
  DurableWorkflowTransactionSession,
  DurableWorkflowTransactionSessionFactory,
} from "./types";

export const DURABLE_WORKFLOW_TRANSACTION_DESCRIPTOR = Object.freeze({
  descriptorVersion: "2.0",
  id: "production-workflow-transaction-manager-v2",
  mode: "production-durable",
  durable: true,
  crossInstance: true,
  nestedTransactions: false,
  savepoints: false,
  externalIoInsideTransaction: false,
  commitUnknownSupported: true,
  productionReady: false,
} as const);

async function rollbackAndFinish<T>(session: DurableWorkflowTransactionSession, failure: DurableWorkflowTransactionFailureCode): Promise<DurableWorkflowTransactionExecutionResult<T>> {
  let rollback: Awaited<ReturnType<DurableWorkflowTransactionSession["rollback"]>>;
  try {
    rollback = await session.rollback();
  } catch {
    session.discard();
    return Object.freeze({ status: "rolled-back", failure: "rollback-failed" });
  }
  if (rollback.status === "rolled-back") {
    session.release();
    return Object.freeze({ status: "rolled-back", failure });
  }
  session.discard();
  return Object.freeze({ status: "rolled-back", failure: "rollback-failed" });
}

async function runHooks(hooks: readonly (() => void | Promise<void>)[]): Promise<DurableWorkflowAfterCommitResult> {
  let hooksRun = 0;
  try {
    for (const hook of hooks) {
      await hook();
      hooksRun += 1;
    }
    return Object.freeze({ status: "completed", hooksRun });
  } catch {
    return Object.freeze({ status: "failed", hooksRun, failure: "after-commit-failed" });
  }
}

export function createDurableWorkflowTransactionManagerV2(
  factory: DurableWorkflowTransactionSessionFactory,
  clock: DurableWorkflowTransactionClock,
): DurableWorkflowTransactionManager {
  let managerState: DurableWorkflowTransactionManagerState = "ready";
  const managerToken = Object.freeze({});
  const asyncScope = new DurableWorkflowAsyncScopeOwner();

  return Object.freeze({
    descriptor: Object.freeze({ ...DURABLE_WORKFLOW_TRANSACTION_DESCRIPTOR }),
    state: () => managerState,
    async runInTransaction<T>(
      options: DurableWorkflowTransactionOptions,
      operation: (context: import("./types").DurableWorkflowTransactionContext) => Promise<DurableWorkflowTransactionOperationResult<T>> | DurableWorkflowTransactionOperationResult<T>,
    ): Promise<DurableWorkflowTransactionExecutionResult<T>> {
      if (managerState !== "ready") return Object.freeze({ status: "rejected", failure: "manager-disposed" });
      if (!validateDurableWorkflowTransactionOptions(options)) return Object.freeze({ status: "rejected", failure: "invalid-options" });
      if (asyncScope.isNested(managerToken)) return Object.freeze({ status: "rejected", failure: "nested-transaction" });

      return asyncScope.run(managerToken, async () => {
        let acquired: Awaited<ReturnType<DurableWorkflowTransactionSessionFactory["acquire"]>>;
        try {
          acquired = await factory.acquire();
        } catch {
          return Object.freeze({ status: "rolled-back", failure: "unavailable" });
        }
        if (acquired.status === "unavailable") return Object.freeze({ status: "rolled-back", failure: "unavailable" });
        const session = acquired.session;
        let begin: Awaited<ReturnType<DurableWorkflowTransactionSession["begin"]>>;
        try {
          begin = await session.begin(Object.freeze({ ...options }));
        } catch {
          session.discard();
          return Object.freeze({ status: "rolled-back", failure: "unavailable" });
        }
        if (begin.status === "failure") {
          if (begin.connectionAction === "discard") session.discard();
          else session.release();
          return Object.freeze({ status: "rolled-back", failure: begin.failure });
        }

        const owner = new DurableWorkflowTransactionContextOwner(session, clock, options.deadlineMonotonicMilliseconds);
        let operationResult: DurableWorkflowTransactionOperationResult<T>;
        try {
          operationResult = await operation(owner.context);
        } catch {
          owner.transition("callback-completed");
          const result = await rollbackAndFinish<T>(session, "callback-failed");
          owner.expire();
          return result;
        }

        owner.transition("callback-completed");
        if (operationResult.status === "failure") {
          owner.transition("rolling-back");
          const result = await rollbackAndFinish<T>(session, operationResult.failure);
          owner.expire();
          return result;
        }
        if (owner.hasFailedTransaction()) {
          owner.transition("rolling-back");
          const result = await rollbackAndFinish<T>(session, "transaction-aborted");
          owner.expire();
          return result;
        }
        if (clock.monotonicMilliseconds() > options.deadlineMonotonicMilliseconds) {
          owner.transition("rolling-back");
          const result = await rollbackAndFinish<T>(session, "deadline-exceeded");
          owner.expire();
          return result;
        }

        owner.transition("committing");
        let commit: Awaited<ReturnType<DurableWorkflowTransactionSession["commit"]>>;
        try {
          commit = await session.commit();
        } catch {
          session.discard();
          owner.expire();
          return Object.freeze({ status: "commit-unknown", failure: "unknown-outcome" });
        }
        if (commit.status === "unknown-outcome") {
          session.discard();
          owner.expire();
          return Object.freeze({ status: "commit-unknown", failure: "unknown-outcome" });
        }
        if (commit.status === "failure") {
          const result = await rollbackAndFinish<T>(session, commit.failure);
          owner.expire();
          return result;
        }
        session.release();
        owner.expire();
        const afterCommit = await runHooks(owner.afterCommitHooks());
        return Object.freeze({ status: "committed", value: operationResult.value, afterCommit });
      });
    },
    dispose() {
      if (managerState === "disposed") return "already-disposed";
      managerState = "disposing";
      managerState = "disposed";
      return "disposed";
    },
  });
}
