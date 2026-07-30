import assert from "node:assert/strict";
import test from "node:test";

import {
  emitReplayPostgresqlEvent,
  NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT,
} from "../../../lib/server/multiCutReplayPostgresqlObservability";
import type {
  ReplayPostgresqlObservabilityEvent,
  ReplayPostgresqlObservabilityPort,
} from "../../../lib/server/multiCutReplayPostgresqlObservability";
import {
  createMultiCutReplayPostgresqlExecutionRuntime,
  createReferenceMultiCutReplayPostgresqlFakeTransactionClient,
} from "../../../lib/server/multiCutReplayPostgresqlExecutionRuntime";
import {
  createMultiCutReplayPostgresqlProductionBridge,
} from "../../../lib/server/multiCutReplayPostgresqlProductionBridge";
import { MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitions";
import type {
  PostgreSQLConnection,
  PostgreSQLConnectionPool,
  PostgreSQLTransactionConnection,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const forbiddenKeys = new Set([
  "sql", "query", "text", "params", "bindings", "rows", "payload",
  "rawError", "error", "message", "detail", "hint", "stack",
  "connectionString", "host", "port", "database", "username", "backendPid",
]);

const assertSafeKeys = (value: unknown): void => {
  if (typeof value !== "object" || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `forbidden event key: ${key}`);
    assertSafeKeys(nested);
  }
};

const bindingsFor = (
  statementId: keyof typeof definitions.byStatementId,
): Readonly<Record<string, unknown>> =>
  Object.freeze(Object.fromEntries(
    [...new Set(
      definitions.byStatementId[statementId].placeholders.map(
        ({ parameterBinding }) => parameterBinding,
      ),
    )].map((parameterBinding) => {
      const placeholders =
        definitions.byStatementId[statementId].placeholders.filter(
          (placeholder) => placeholder.parameterBinding === parameterBinding,
        );
      return [
        parameterBinding,
        placeholders.length === 1
          ? `${parameterBinding}:value`
          : Object.freeze(Object.fromEntries(
              placeholders.map(({ physicalField }) => [
                physicalField,
                `${parameterBinding}:${physicalField}`,
              ]),
            )),
      ];
    }),
  ));

const input = Object.freeze({
  inputVersion: "1.0" as const,
  statementId: "lookup-authoritative-replay" as const,
  bindings: bindingsFor("lookup-authoritative-replay"),
});

const rowResult = Object.freeze({
  rows: Object.freeze([Object.freeze({ revision: "2" })]),
  rowCount: 1,
  command: "SELECT",
});

const collector = (): Readonly<{
  port: ReplayPostgresqlObservabilityPort;
  events: ReplayPostgresqlObservabilityEvent[];
}> => {
  const events: ReplayPostgresqlObservabilityEvent[] = [];
  return Object.freeze({
    port: Object.freeze({
      emit: (event: ReplayPostgresqlObservabilityEvent) =>
        void events.push(event),
    }),
    events,
  });
};

test("no observer and no-op observer preserve success and zero-row results", async () => {
  for (const result of [
    rowResult,
    Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "SELECT" }),
  ]) {
    const fixture =
      createReferenceMultiCutReplayPostgresqlFakeTransactionClient(result);
    const runtime = createMultiCutReplayPostgresqlExecutionRuntime(
      fixture.provider,
      { observability: NO_OP_REPLAY_POSTGRESQL_OBSERVABILITY_PORT },
    );
    const output = await runtime.execute(input);
    assert.equal(output.status, "completed");
  }
});

test("execution failure emits exactly once with result-owned safe metadata", async () => {
  const observed = collector();
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(rowResult);
  const connection = Object.freeze({
    ...fixture.connection,
    async execute() {
      throw Object.freeze({
        failureVersion: "1.0",
        classification: "execution-failure",
        safeReason: "dependency-private-reason",
        sqlStateClass: "40",
      });
    },
  });
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    Object.freeze({
      acquire: async () => connection,
      release: async () => undefined,
    }),
    { observability: observed.port },
  ).execute(input);
  assert.equal(result.status, "failed");
  assert.equal(observed.events.length, 1);
  assert.deepEqual(observed.events[0], {
    schemaVersion: "1.0",
    eventType: "replay-postgresql-execution-failed",
    operation: "lookup",
    lifecyclePhase: "execution",
    classification: "retryable",
    retryMetadata: "retryable",
    safeReason: "adapter-result-failed",
    sqlStateClass: "40",
    outcome: "failed",
  });
  assertSafeKeys(observed.events[0]);
});

test("rollback failure has one transaction event and cleanup continues", async () => {
  const observed = collector();
  const log: string[] = [];
  const connection = Object.freeze({
    begin: async () => void log.push("begin"),
    async execute() {
      log.push("execute");
      throw Object.freeze({
        failureVersion: "1.0",
        classification: "execution-failure",
        safeReason: "private-execute-reason",
      });
    },
    async commit() {
      log.push("commit");
    },
    async rollback() {
      log.push("rollback");
      throw new Error("private-rollback-reason");
    },
  });
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    Object.freeze({
      acquire: async () => connection,
      release: async () => void log.push("release"),
    }),
    { observability: observed.port },
  ).execute(
    Object.freeze({
      inputVersion: "1.0",
      statementId: "renew-processing-reservation",
      bindings: bindingsFor("renew-processing-reservation"),
    }),
  );
  assert.equal(result.status, "failed");
  assert.deepEqual(log.slice(-2), ["rollback", "release"]);
  assert.equal(observed.events.length, 1);
  assert.equal(
    observed.events[0]?.eventType,
    "replay-postgresql-rollback-failed",
  );
});

test("observer throw and rejected thenable cannot change result or cleanup", async () => {
  const observers: ReplayPostgresqlObservabilityPort[] = [
    Object.freeze({ emit: () => { throw new Error("observer-secret"); } }),
    Object.freeze({
      emit: (() => Promise.reject(new Error("observer-secret"))) as
        ReplayPostgresqlObservabilityPort["emit"],
    }),
  ];
  for (const observability of observers) {
    const fixture =
      createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
        rowResult,
        Object.freeze({
          failureVersion: "1.0",
          stage: "execute",
          classification: "execution-failure",
          safeReason: "private-reason",
        }),
      );
    const result = await createMultiCutReplayPostgresqlExecutionRuntime(
      fixture.provider,
      { observability },
    ).execute(input);
    assert.equal(result.status, "failed");
    assert.deepEqual(fixture.executionLog.slice(-2), ["rollback", "release"]);
  }
  await new Promise<void>((resolve) => queueMicrotask(resolve));
});

test("success and zero-row never emit failure events", async () => {
  for (const result of [
    rowResult,
    Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "UPDATE" }),
  ]) {
    const observed = collector();
    const fixture =
      createReferenceMultiCutReplayPostgresqlFakeTransactionClient(result);
    const output = await createMultiCutReplayPostgresqlExecutionRuntime(
      fixture.provider,
      { observability: observed.port },
    ).execute(input);
    assert.equal(output.status, "completed");
    assert.deepEqual(observed.events, []);
  }
});

test("active transaction discard emits exactly once", async () => {
  let active = false;
  const transaction: PostgreSQLTransactionConnection = Object.freeze({
    state: () => "active",
    query: async () => Object.freeze({
      status: "success" as const,
      rows: Object.freeze([]),
      rowCount: 0,
      command: "UPDATE",
    }),
    commit: async () => Object.freeze({ status: "committed" as const }),
    rollback: async () => Object.freeze({ status: "rolled-back" as const }),
    release: () => "transaction-active",
  });
  const connection: PostgreSQLConnection = Object.freeze({
    state: () => active ? "transaction-active" : "checked-out",
    query: async () => Object.freeze({ status: "not-found" as const }),
    begin: async () => {
      active = true;
      return transaction;
    },
    release: () => active ? "transaction-active" : "released",
    discard: () => {
      active = false;
      return "discarded";
    },
  });
  const pool: PostgreSQLConnectionPool = Object.freeze({
    state: () => "ready",
    start: async () => "already-started" as const,
    checkout: async () => connection,
    close: async () => "closed" as const,
  });
  const observed = collector();
  const bridge = createMultiCutReplayPostgresqlProductionBridge({
    pool,
    observability: observed.port,
  });
  const acquired = await bridge.acquire();
  await acquired.begin();
  await bridge.release(acquired);
  assert.equal(observed.events.length, 1);
  assert.deepEqual(observed.events[0], {
    schemaVersion: "1.0",
    eventType: "replay-postgresql-connection-discarded",
    operation: "discard-connection",
    lifecyclePhase: "connection",
    reasonCategory: "active-transaction",
    connectionDisposition: "discarded",
    outcome: "completed",
  });
});

test("safe emitter freezes the schema boundary and isolates observer failure", () => {
  const event = Object.freeze({
    schemaVersion: "1.0" as const,
    eventType: "replay-postgresql-connection-discarded" as const,
    operation: "discard-connection" as const,
    lifecyclePhase: "connection" as const,
    reasonCategory: "commit-unknown" as const,
    connectionDisposition: "discarded" as const,
    outcome: "completed" as const,
  });
  assert.doesNotThrow(() =>
    emitReplayPostgresqlEvent(
      Object.freeze({ emit: () => { throw new Error("private"); } }),
      event,
    ),
  );
  assert.equal(Object.isFrozen(event), true);
  assertSafeKeys(event);
});
