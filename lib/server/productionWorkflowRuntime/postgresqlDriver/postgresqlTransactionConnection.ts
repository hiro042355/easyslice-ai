import type { PoolClient } from "pg";
import type { PostgreSQLCommitResult, PostgreSQLCommitResultV2, PostgreSQLConnectionReuse, PostgreSQLQueryRequest, PostgreSQLQueryResult, PostgreSQLQueryResultV2, PostgreSQLRollbackResult, PostgreSQLRollbackResultV2, PostgreSQLTransactionConnectionV4, PostgreSQLTransactionDiscardResult, PostgreSQLTransactionState } from "./types";
import { classifyConnectionReuse, getPostgreSQLQueryFailureSafeReason, mapPostgreSQLError } from "./postgresqlErrorMapper";

type Execute = (
  client: PoolClient,
  request: PostgreSQLQueryRequest,
  connectionState: "transaction-active",
  transactionState: "active" | "failed",
  statementTimeoutAuthority?: boolean,
) => Promise<PostgreSQLQueryResult>;

export function classifyCommitFailure(phase: "before-send" | "sent-or-unknown", rollbackProven: boolean): PostgreSQLCommitResult {
  if (phase === "before-send" && rollbackProven) return { status: "definitely-rolled-back" };
  return { status: "unknown-outcome" };
}

export class PostgreSQLTransactionConnectionAdapter implements PostgreSQLTransactionConnectionV4 {
  readonly lifecycleVersion = "2.0" as const;
  readonly queryContractVersion = "2.0" as const;
  readonly lifecycleResultVersion = "2.0" as const;
  private transactionState: PostgreSQLTransactionState = "active";
  private reuse: PostgreSQLConnectionReuse = "must-rollback-before-reuse";
  private discardInvoked = false;
  constructor(
    private readonly client: PoolClient,
    private readonly execute: Execute,
    private readonly onFinish: () => void,
    private readonly onDiscard: () => unknown,
    private readonly onRelease?: () => unknown,
    private readonly statementTimeoutAuthority = false,
  ) {}
  state(): PostgreSQLTransactionState { return this.transactionState; }
  markDiscarded(): void {
    this.discardInvoked = true;
    this.transactionState = "released";
    this.reuse = "must-discard";
  }
  async query(request: PostgreSQLQueryRequest): Promise<PostgreSQLQueryResult> {
    if (this.transactionState !== "active") return Object.freeze({ status: "failure", issue: "disposed", safeReason: getPostgreSQLQueryFailureSafeReason("disposed"), diagnostic: Object.freeze({ stage: "query", statementId: request.statementId, issue: "disposed", connectionState: "transaction-active", transactionState: this.transactionState, retryable: false }) });
    const result = await this.execute(this.client, request, "transaction-active", this.transactionState, this.statementTimeoutAuthority);
    if (result.status === "failure" && result.issue !== "invalid-request") {
      this.transactionState = "failed";
      this.reuse = classifyConnectionReuse(result.issue, "failed");
    }
    return result;
  }
  async queryV2(request: PostgreSQLQueryRequest): Promise<PostgreSQLQueryResultV2> {
    const result = await this.query(request);
    if (result.status !== "failure") return result;
    const disposition = result.diagnostic.queryConnectionDisposition;
    if (disposition === undefined) throw new TypeError("missing-authoritative-query-connection-disposition");
    return Object.freeze({ ...result, resultVersion: "2.0", diagnostic: Object.freeze({ ...result.diagnostic, queryConnectionDisposition: disposition }) });
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
      this.discard();
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
      const mapped = mapPostgreSQLError(
        error,
        { stage: "rollback", connectionState: "transaction-active", transactionState: "rolling-back" },
        { statementTimeoutAuthority: this.statementTimeoutAuthority },
      );
      this.transactionState = "unknown";
      this.reuse = "must-discard";
      this.discard();
      return mapped.issue === "connection-unavailable" ? { status: "connection-lost" } : { status: "rollback-failed" };
    }
  }
  async commitV2(): Promise<PostgreSQLCommitResultV2> {
    const result = await this.commit();
    return Object.freeze({
      ...result,
      resultVersion: "2.0",
      connectionDisposition: this.reuse,
    });
  }
  async rollbackV2(): Promise<PostgreSQLRollbackResultV2> {
    const result = await this.rollback();
    return Object.freeze({
      ...result,
      resultVersion: "2.0",
      connectionDisposition: this.reuse,
    });
  }
  release(): "released" | "already-released" | "transaction-active" {
    if (this.transactionState === "released") return "already-released";
    if (["active", "failed", "committing", "rolling-back"].includes(this.transactionState)) return "transaction-active";
    if (this.reuse !== "safe-to-reuse") { this.onDiscard(); this.transactionState = "released"; return "released"; }
    this.onRelease?.();
    this.transactionState = "released";
    return "released";
  }
  discard(): PostgreSQLTransactionDiscardResult {
    if (this.discardInvoked) return Object.freeze({ status: "discarded" });
    this.discardInvoked = true;
    try {
      this.onDiscard();
      this.transactionState = "released";
      this.reuse = "must-discard";
      return Object.freeze({ status: "discarded" });
    } catch {
      this.transactionState = "unknown";
      this.reuse = "must-discard";
      return Object.freeze({
        status: "discard-failure",
        safeReason: "postgresql-discard-failed",
      });
    }
  }
}
