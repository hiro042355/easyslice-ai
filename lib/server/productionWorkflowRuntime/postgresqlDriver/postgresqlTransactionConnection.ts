import type { PoolClient } from "pg";
import type { PostgreSQLCommitResult, PostgreSQLConnectionReuse, PostgreSQLExecutionFailure, PostgreSQLQueryRequest, PostgreSQLQueryResult, PostgreSQLRollbackResult, PostgreSQLTransactionConnection, PostgreSQLTransactionState } from "./types";
import { classifyConnectionReuse, mapPostgreSQLError } from "./postgresqlErrorMapper";

type Execute = (client: PoolClient, request: PostgreSQLQueryRequest, connectionState: "transaction-active", transactionState: "active" | "failed") => Promise<PostgreSQLQueryResult>;

export function classifyCommitFailure(phase: "before-send" | "sent-or-unknown", rollbackProven: boolean): PostgreSQLCommitResult {
  if (phase === "before-send" && rollbackProven) return { status: "definitely-rolled-back" };
  return { status: "unknown-outcome" };
}

export class PostgreSQLTransactionConnectionAdapter implements PostgreSQLTransactionConnection {
  private transactionState: PostgreSQLTransactionState = "active";
  private reuse: PostgreSQLConnectionReuse = "must-rollback-before-reuse";
  constructor(
    private readonly client: PoolClient,
    private readonly execute: Execute,
    private readonly onFinish: () => void,
    private readonly onDiscard: () => unknown,
    private readonly onRelease?: () => unknown,
  ) {}
  state(): PostgreSQLTransactionState { return this.transactionState; }
  async query(request: PostgreSQLQueryRequest): Promise<PostgreSQLQueryResult> {
    if (this.transactionState !== "active") return { status: "failure", issue: "disposed", diagnostic: { stage: "query", statementId: request.statementId, issue: "disposed", connectionState: "transaction-active", transactionState: this.transactionState, retryable: false } };
    const result = await this.execute(this.client, request, "transaction-active", this.transactionState);
    if (result.status === "failure" && result.issue !== "invalid-request") {
      this.transactionState = "failed";
      this.reuse = classifyConnectionReuse(result.issue, "failed");
    }
    return result;
  }
  async commit(): Promise<PostgreSQLCommitResult> {
    if (this.transactionState !== "active") return { status: "invalid-state" };
    this.transactionState = "committing";
    try {
      await this.client.query("COMMIT");
      this.transactionState = "committed";
      this.reuse = "safe-to-reuse";
      this.onFinish();
      return { status: "committed" };
    } catch {
      this.transactionState = "unknown";
      this.reuse = "must-discard";
      this.onDiscard();
      return { status: "unknown-outcome" };
    }
  }
  async rollback(): Promise<PostgreSQLRollbackResult> {
    if (["rolled-back", "committed", "released"].includes(this.transactionState)) return { status: "not-required" };
    if (!(["active", "failed"].includes(this.transactionState))) return { status: "invalid-state" };
    this.transactionState = "rolling-back";
    try {
      await this.client.query("ROLLBACK");
      this.transactionState = "rolled-back";
      this.reuse = "safe-to-reuse";
      this.onFinish();
      return { status: "rolled-back" };
    } catch (error) {
      const mapped = mapPostgreSQLError(error, { stage: "rollback", connectionState: "transaction-active", transactionState: "rolling-back" });
      this.transactionState = "unknown";
      this.reuse = "must-discard";
      this.onDiscard();
      return mapped.issue === "connection-unavailable" ? { status: "connection-lost" } : { status: "rollback-failed" };
    }
  }
  release(): "released" | "already-released" | "transaction-active" {
    if (this.transactionState === "released") return "already-released";
    if (["active", "failed", "committing", "rolling-back"].includes(this.transactionState)) return "transaction-active";
    if (this.reuse !== "safe-to-reuse") { this.onDiscard(); this.transactionState = "released"; return "released"; }
    this.onRelease?.();
    this.transactionState = "released";
    return "released";
  }
}
