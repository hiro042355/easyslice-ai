import type { ProductionWorkflowClock } from "./types";
import type {
  WorkflowTransactionContext,
  WorkflowTransactionExecutionResult,
  WorkflowTransactionManager,
  WorkflowTransactionOperationResult,
} from "./transactionTypes";

export function createReferenceWorkflowTransactionManager(
  clock: ProductionWorkflowClock,
): WorkflowTransactionManager {
  let active = false;
  let stopped = false;

  return Object.freeze({
    descriptor: Object.freeze({
      descriptorVersion: "1.0" as const,
      id: "reference-workflow-transaction-manager-v1",
      mode: "reference-contract-only" as const,
      durable: false,
      crossInstance: false,
      productionReady: false,
      externalIoInsideTransaction: false as const,
    }),
    async runInTransaction<T>(
      operation: (
        context: WorkflowTransactionContext,
      ) => Promise<WorkflowTransactionOperationResult<T>> | WorkflowTransactionOperationResult<T>,
    ): Promise<WorkflowTransactionExecutionResult<T>> {
      if (stopped) return { status: "rejected", failure: "manager-stopped" };
      if (active) return { status: "rejected", failure: "nested-transaction" };

      active = true;
      let open = true;
      const hooks: Array<() => void | Promise<void>> = [];
      const context: WorkflowTransactionContext = Object.freeze({
        transactionVersion: "1.0",
        scope: "opaque-reference-transaction-scope",
        startedAt: clock.nowUtc(),
        deadlineClass: "injected-policy",
        externalIoAllowed: false,
        registerAfterCommit(hook: () => void | Promise<void>) {
          if (!open) return "context-closed";
          hooks.push(hook);
          return "registered";
        },
      });

      let result: WorkflowTransactionOperationResult<T>;
      try {
        result = await operation(context);
      } catch {
        open = false;
        active = false;
        return { status: "rolled-back", failure: "callback-failed" };
      }

      open = false;
      active = false;
      if (result.status === "failure") {
        return { status: "rolled-back", failure: result.failure };
      }

      let hooksRun = 0;
      try {
        for (const hook of hooks) {
          await hook();
          hooksRun += 1;
        }
      } catch {
        return {
          status: "committed",
          value: result.value,
          afterCommit: { status: "failed", hooksRun, failure: "after-commit-failed" },
        };
      }
      return {
        status: "committed",
        value: result.value,
        afterCommit: { status: "completed", hooksRun },
      };
    },
    stop() {
      if (stopped) return "already-stopped";
      stopped = true;
      return "stopped";
    },
  });
}
