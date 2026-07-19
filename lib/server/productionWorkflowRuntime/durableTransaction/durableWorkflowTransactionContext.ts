import type {
  DurableWorkflowDatabaseCapability,
  DurableWorkflowDatabaseCommand,
  DurableWorkflowDatabaseExecutionResult,
  DurableWorkflowTransactionClock,
  DurableWorkflowTransactionContext,
  DurableWorkflowTransactionContextState,
  DurableWorkflowTransactionSession,
} from "./types";
import { copyDatabaseScalar, isSafeStatementId } from "./durableWorkflowTransactionUtils";

const expiredResult = (): DurableWorkflowDatabaseExecutionResult => Object.freeze({
  status: "failure",
  failure: "transaction-aborted",
  retryable: false,
});

export class DurableWorkflowTransactionContextOwner {
  private contextState: DurableWorkflowTransactionContextState = "active";
  private transactionFailed = false;
  private readonly hooks: Array<() => void | Promise<void>> = [];
  readonly context: DurableWorkflowTransactionContext;

  constructor(
    session: DurableWorkflowTransactionSession,
    clock: DurableWorkflowTransactionClock,
    deadlineMonotonicMilliseconds: number,
  ) {
    const database: DurableWorkflowDatabaseCapability = Object.freeze({
      capabilityVersion: "1.0",
      execute: async (command: DurableWorkflowDatabaseCommand): Promise<DurableWorkflowDatabaseExecutionResult> => {
        if (this.contextState !== "active" || this.transactionFailed) return expiredResult();
        if (clock.monotonicMilliseconds() > deadlineMonotonicMilliseconds) return Object.freeze({ status: "failure", failure: "deadline-exceeded", retryable: false });
        if (!isSafeStatementId(command.statementId) || command.parameters.length > 1_000) return Object.freeze({ status: "failure", failure: "internal-failure", retryable: false });
        const safeCommand: DurableWorkflowDatabaseCommand = Object.freeze({
          commandVersion: "1.0",
          statementId: command.statementId,
          parameters: Object.freeze(command.parameters.map(copyDatabaseScalar)),
          expectedResult: command.expectedResult,
        });
        try {
          const result = await session.execute(safeCommand);
          if (result.status === "failure") this.transactionFailed = true;
          return result;
        } catch {
          this.transactionFailed = true;
          return expiredResult();
        }
      },
    });

    this.context = Object.freeze({
      contextVersion: "2.0",
      scope: "opaque-production-durable-transaction-scope",
      startedAt: clock.nowUtc(),
      deadlineMonotonicMilliseconds,
      externalIoAllowed: false,
      database,
      state: () => this.contextState,
      registerAfterCommit: (hook: () => void | Promise<void>) => {
        if (this.contextState !== "active") return "context-expired";
        this.hooks.push(hook);
        return "registered";
      },
    });
  }

  transition(state: Exclude<DurableWorkflowTransactionContextState, "active">): void {
    if (this.contextState === "expired") return;
    this.contextState = state;
  }

  expire(): void {
    this.contextState = "expired";
  }

  afterCommitHooks(): readonly (() => void | Promise<void>)[] {
    return Object.freeze([...this.hooks]);
  }

  hasFailedTransaction(): boolean {
    return this.transactionFailed;
  }
}
