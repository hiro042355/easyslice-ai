import { Pool, type PoolClient, type QueryResult } from "pg";
import { createPostgreSQLTypeParsers, decodePostgreSQLValue, encodePostgreSQLParameter } from "./postgresqlTypeCodec";
import { isSafeStatementId } from "./postgresqlDriverUtils";
import { getPostgreSQLQueryFailureSafeReason, mapPostgreSQLError } from "./postgresqlErrorMapper";
import { PostgreSQLTransactionConnectionAdapter } from "./postgresqlTransactionConnection";
import { PostgreSQLDrainCoordinator } from "./postgresqlDrainCoordinator";
import type { PostgreSQLConnection, PostgreSQLConnectionConfig, PostgreSQLConnectionPool, PostgreSQLConnectionState, PostgreSQLExecutionFailure, PostgreSQLPoolState, PostgreSQLQueryRequest, PostgreSQLQueryResult, PostgreSQLRow, PostgreSQLTransactionConnectionV2 } from "./types";

function invalid(stage: "pool" | "checkout" | "begin", statementId?: string): PostgreSQLExecutionFailure {
  return { status: "failure", issue: "invalid-request", diagnostic: { stage, ...(statementId !== undefined ? { statementId } : {}), issue: "invalid-request", retryable: false } };
}

function invalidQuery(statementId: string): Extract<PostgreSQLQueryResult, { status: "failure" }> {
  return Object.freeze({
    status: "failure",
    issue: "invalid-request",
    safeReason: getPostgreSQLQueryFailureSafeReason("invalid-request"),
    diagnostic: Object.freeze({
      stage: "query",
      statementId,
      issue: "invalid-request",
      retryable: false,
    }),
  });
}

function validateRequest(request: PostgreSQLQueryRequest): boolean {
  return isSafeStatementId(request.statementId) && request.text.trim().length > 0 && request.text.length <= 100_000
    && request.values.length <= 1_000 && ["none", "single", "many"].includes(request.expectedResult);
}

async function execute(client: PoolClient, request: PostgreSQLQueryRequest, connectionState: PostgreSQLConnectionState, transactionState?: "active" | "failed", statementTimeoutAuthority = false): Promise<PostgreSQLQueryResult> {
  if (!validateRequest(request)) return invalidQuery(request.statementId);
  let values: unknown[];
  try { values = request.values.map(encodePostgreSQLParameter); }
  catch { return invalidQuery(request.statementId); }
  try {
    const result: QueryResult<Record<string, unknown>> = await client.query({ text: request.text, values });
    const rows: PostgreSQLRow[] = result.rows.map((row) => {
      const output: Record<string, ReturnType<typeof decodePostgreSQLValue>> = {};
      for (const field of result.fields) output[field.name] = decodePostgreSQLValue(field.dataTypeID, row[field.name]);
      return Object.freeze(output);
    });
    const actualRowCount = result.rowCount ?? rows.length;
    if (request.expectedResult === "single" && rows.length === 0) return Object.freeze({ status: "not-found", expectedResult: "single", actualRowCount: 0, command: result.command });
    if (request.expectedResult === "single" && rows.length !== 1) return Object.freeze({ status: "cardinality-conflict", expectedResult: "single", actualRowCount, command: result.command });
    if (request.expectedResult === "none" && rows.length !== 0) return Object.freeze({ status: "cardinality-conflict", expectedResult: "none", actualRowCount, command: result.command });
    return { status: "success", rows: Object.freeze(rows), rowCount: actualRowCount, command: result.command };
  } catch (error) {
    return mapPostgreSQLError(
      error,
      { stage: "query", statementId: request.statementId, connectionState, ...(transactionState !== undefined ? { transactionState } : {}) },
      { statementTimeoutAuthority },
    );
  }
}

export class PostgreSQLConnectionAdapter implements PostgreSQLConnection {
  private connectionState: PostgreSQLConnectionState = "checked-out";
  private transaction: PostgreSQLTransactionConnectionAdapter | undefined;
  private readonly clientErrorListener = (): void => { this.connectionState = "unknown"; };
  constructor(private readonly client: PoolClient, private readonly onDone: () => void, private readonly statementTimeoutAuthority = false) {
    this.client.on("error", this.clientErrorListener);
  }
  state(): PostgreSQLConnectionState { return this.connectionState; }
  async query(request: PostgreSQLQueryRequest): Promise<PostgreSQLQueryResult> {
    if (this.connectionState !== "checked-out") return Object.freeze({ status: "failure", issue: "disposed", safeReason: getPostgreSQLQueryFailureSafeReason("disposed"), diagnostic: Object.freeze({ stage: "query", statementId: request.statementId, issue: "disposed", connectionState: this.connectionState, retryable: false }) });
    return execute(this.client, request, this.connectionState, undefined, this.statementTimeoutAuthority);
  }
  async begin(): Promise<PostgreSQLTransactionConnectionV2 | PostgreSQLExecutionFailure> {
    if (this.connectionState !== "checked-out") return invalid("begin");
    const result = await execute(this.client, { statementId: "transaction.begin", text: "BEGIN", values: [], expectedResult: "none" }, this.connectionState, undefined, this.statementTimeoutAuthority);
    if (result.status === "failure") return result;
    if (result.status !== "success") return invalid("begin");
    this.connectionState = "transaction-active";
    this.transaction = new PostgreSQLTransactionConnectionAdapter(
      this.client,
      execute,
      () => { this.connectionState = "checked-out"; },
      () => this.discard(),
      () => this.release(),
      this.statementTimeoutAuthority,
    );
    return this.transaction;
  }
  release(): "released" | "already-released" | "transaction-active" {
    if (this.connectionState === "released" || this.connectionState === "discarded") return "already-released";
    if (this.connectionState === "transaction-active") return "transaction-active";
    this.client.removeListener("error", this.clientErrorListener);
    this.connectionState = "released"; this.client.release(); this.onDone(); return "released";
  }
  discard(): "discarded" | "already-released" {
    if (this.connectionState === "released" || this.connectionState === "discarded") return "already-released";
    this.transaction?.markDiscarded();
    this.connectionState = "discarded"; this.client.release(true); this.onDone(); return "discarded";
  }
}

export class PostgreSQLConnectionPoolAdapter implements PostgreSQLConnectionPool {
  private poolState: PostgreSQLPoolState = "created";
  private pool: Pool | undefined;
  private readonly drainCoordinator = new PostgreSQLDrainCoordinator();
  private closePromise:
    Promise<"closed" | "drain-timeout"> | undefined;
  constructor(private readonly config: PostgreSQLConnectionConfig) {}
  state(): PostgreSQLPoolState { return this.poolState; }
  async start(): Promise<"ready" | "already-started" | PostgreSQLExecutionFailure> {
    if (this.poolState !== "created") return "already-started";
    this.poolState = "starting";
    this.pool = new Pool({ host: this.config.host, port: this.config.port, database: this.config.database, user: this.config.user, password: this.config.password, max: this.config.maxConnections, connectionTimeoutMillis: this.config.connectionTimeoutMs, idleTimeoutMillis: this.config.idleTimeoutMs, ...(this.config.queryTimeoutMs !== undefined ? { statement_timeout: this.config.queryTimeoutMs } : {}), application_name: this.config.applicationName, ssl: this.config.tls.mode === "verify-full" ? { rejectUnauthorized: true } : false, types: createPostgreSQLTypeParsers(), allowExitOnIdle: true });
    this.pool.on("error", () => { if (this.poolState !== "draining" && this.poolState !== "closed") this.poolState = "failed"; });
    try { await this.pool.query("SELECT 1"); this.poolState = "ready"; return "ready"; }
    catch (error) { this.poolState = "failed"; return mapPostgreSQLError(error, { stage: "pool" }); }
  }
  async checkout(): Promise<PostgreSQLConnection | PostgreSQLExecutionFailure> {
    if (this.poolState !== "ready" || !this.pool) return { status: "failure", issue: "disposed", diagnostic: { stage: "checkout", issue: "disposed", retryable: false } };
    try {
      const client = await this.pool.connect();
      if (this.poolState !== "ready") {
        client.release(true);
        return { status: "failure", issue: "disposed", diagnostic: { stage: "checkout", issue: "disposed", retryable: false } };
      }
      let connection: PostgreSQLConnectionAdapter;
      const registration = this.drainCoordinator.register({
        discard: () => connection.discard(),
      });
      connection = new PostgreSQLConnectionAdapter(
        client,
        () => registration.release(),
        this.config.queryTimeoutMs !== undefined,
      );
      return connection;
    }
    catch (error) { return mapPostgreSQLError(error, { stage: "checkout" }); }
  }
  async close(
    options: Readonly<{ timeoutMs: number }> = Object.freeze({
      timeoutMs: 5_000,
    }),
  ): Promise<"closed" | "already-closed" | "drain-timeout"> {
    if (this.poolState === "closed") return "already-closed";
    if (this.closePromise) return this.closePromise;
    this.poolState = "draining";
    this.closePromise = (async () => {
      const drained = await this.drainCoordinator.drain(options.timeoutMs);
      await this.pool?.end();
      this.poolState = "closed";
      return drained.status === "drained" ? "closed" : "drain-timeout";
    })();
    return this.closePromise;
  }
}
