import assert from "node:assert/strict";
import test from "node:test";
import {
  createMultiCutReplayPostgresqlDriverConnectionProvider,
  createReferenceMultiCutReplayPostgresqlFakeDriver,
  mapMultiCutReplayPostgresqlDriverError,
} from "../../../lib/server/multiCutReplayPostgresqlDriver";
import { createMultiCutReplayPostgresqlExecutionRuntime } from "../../../lib/server/multiCutReplayPostgresqlExecutionRuntime";
import { MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitions";

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
          (placeholder) =>
            placeholder.parameterBinding === parameterBinding,
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
  statementId: "renew-processing-reservation" as const,
  bindings: bindingsFor("renew-processing-reservation"),
});

const readInput = Object.freeze({
  inputVersion: "1.0" as const,
  statementId: "lookup-authoritative-replay" as const,
  bindings: bindingsFor("lookup-authoritative-replay"),
});

const row = Object.freeze({
  identity_schema_version: "2.0",
  protected_scope_namespace: "multi-cut",
  protected_scope_tenant_identity: "tenant-1",
  protected_scope_operation_identity: "render",
  key_identity: "key-1",
  request_fingerprint_identity: "fingerprint-1",
});

const driverError = (
  kind:
    | "connection-unavailable"
    | "transaction-rejected"
    | "query-rejected"
    | "serialization-conflict"
    | "commit-outcome-unknown",
  safeReason: string = kind,
  sqlStateClass?: "08" | "23" | "40",
) => Object.freeze({
  errorVersion: "1.0" as const,
  kind,
  safeReason,
  ...(sqlStateClass ? { sqlStateClass } : {}),
});

test("driver bridge preserves connection and transaction lifecycle", async () => {
  const fake = createReferenceMultiCutReplayPostgresqlFakeDriver(
    Object.freeze({ rows: Object.freeze([row]), rowCount: 1, command: "SELECT" }),
  );
  const runtime = createMultiCutReplayPostgresqlExecutionRuntime(
    createMultiCutReplayPostgresqlDriverConnectionProvider(fake.driver),
  );
  const result = await runtime.execute(input);
  assert.equal(result.status, "completed");
  assert.deepEqual(fake.executionLog, [
    "acquire",
    "begin",
    "query:renew-processing-reservation",
    "commit",
    "release",
  ]);
  assert.equal(fake.capturedRequests.length, 1);
  assert.equal(fake.capturedRequests[0]?.statementId, input.statementId);
});

test("query execution is deterministic and returns copy-isolated rows", async () => {
  const mutableRow: Record<string, unknown> = { ...row };
  const fake = createReferenceMultiCutReplayPostgresqlFakeDriver({
    rows: [mutableRow],
    rowCount: 1,
    command: "SELECT",
  });
  const provider = createMultiCutReplayPostgresqlDriverConnectionProvider(
    fake.driver,
  );
  const connection = await provider.acquire();
  const request = Object.freeze({
    requestVersion: "1.0" as const,
    statementId: readInput.statementId,
    sql: "SELECT 1",
    parameters: Object.freeze([]),
    values: Object.freeze([]),
  });
  const first = await connection.execute(request);
  mutableRow.key_identity = "mutated";
  const second = await connection.execute(request);
  assert.equal(first.rows[0]?.key_identity, "key-1");
  assert.equal(second.rows[0]?.key_identity, "mutated");
  assert.notEqual(first.rows[0], second.rows[0]);
  await provider.release(connection);
});

test("serialization conflict maps to retryable driver failure", () => {
  assert.deepEqual(
    mapMultiCutReplayPostgresqlDriverError(
      driverError("serialization-conflict", "serialization"),
    ),
    {
      failureVersion: "1.0",
      classification: "execution-failure",
      retryClassification: "retryable",
      safeReason: "serialization",
    },
  );
});

test("safe SQLSTATE classes propagate without changing failure semantics", async () => {
  const cases = [
    ["connection-unavailable", "08", "retryable"],
    ["query-rejected", "23", "non-retryable"],
    ["serialization-conflict", "40", "retryable"],
  ] as const;
  for (const [kind, sqlStateClass, retryClassification] of cases) {
    const mapped = mapMultiCutReplayPostgresqlDriverError(
      driverError(kind, `safe-${sqlStateClass}`, sqlStateClass),
    );
    assert.equal(mapped.sqlStateClass, sqlStateClass);
    assert.equal(mapped.retryClassification, retryClassification);
    assert.equal(mapped.safeReason, `safe-${sqlStateClass}`);
    assert.equal(mapped.classification, "execution-failure");

    const fake = createReferenceMultiCutReplayPostgresqlFakeDriver(
      Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "SELECT" }),
      Object.freeze({
        stage: kind === "connection-unavailable" ? "acquire" : "query",
        error: driverError(kind, `safe-${sqlStateClass}`, sqlStateClass),
      }),
    );
    const result = await createMultiCutReplayPostgresqlExecutionRuntime(
      createMultiCutReplayPostgresqlDriverConnectionProvider(fake.driver),
    ).execute(readInput);
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.sqlStateClass, sqlStateClass);
      assert.equal(
        result.classification,
        kind === "connection-unavailable" ? "non-retryable" : "retryable",
      );
      assert.equal(
        result.safeReason,
        kind === "connection-unavailable"
          ? "connection-acquire-failed"
          : "adapter-result-failed",
      );
    }
  }
});

test("missing SQLSTATE class preserves the existing safe fallback", () => {
  const mapped = mapMultiCutReplayPostgresqlDriverError(
    driverError("query-rejected", "safe-fallback"),
  );
  assert.equal("sqlStateClass" in mapped, false);
  assert.equal(mapped.retryClassification, "non-retryable");
  assert.equal(mapped.safeReason, "safe-fallback");
});

test("query rejection maps to non-retryable driver failure", () => {
  assert.equal(
    mapMultiCutReplayPostgresqlDriverError(driverError("query-rejected"))
      .retryClassification,
    "non-retryable",
  );
});

test("commit communication loss propagates commit-unknown", async () => {
  const fake = createReferenceMultiCutReplayPostgresqlFakeDriver(
    Object.freeze({ rows: Object.freeze([row]), rowCount: 1, command: "SELECT" }),
    Object.freeze({
      stage: "commit",
      error: driverError("commit-outcome-unknown", "commit-disconnected"),
    }),
  );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    createMultiCutReplayPostgresqlDriverConnectionProvider(fake.driver),
  ).execute(input);
  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.equal(result.phase, "commit");
  assert.equal(result.classification, "commit-unknown");
  assert.equal(result.safeReason, "commit-disconnected");
  assert.deepEqual(fake.executionLog.slice(-2), ["commit", "release"]);
  assert.equal(fake.executionLog.includes("rollback"), false);
});

test("query failure rolls back and always releases", async () => {
  const fake = createReferenceMultiCutReplayPostgresqlFakeDriver(
    Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "SELECT" }),
    Object.freeze({
      stage: "query",
      error: driverError("serialization-conflict"),
    }),
  );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    createMultiCutReplayPostgresqlDriverConnectionProvider(fake.driver),
  ).execute(readInput);
  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.equal(result.phase, "execute");
  assert.equal(result.classification, "retryable");
  assert.deepEqual(fake.executionLog.slice(-2), ["rollback", "release"]);
});

test("acquire error is translated without leaking the original object", async () => {
  const fake = createReferenceMultiCutReplayPostgresqlFakeDriver(
    Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "SELECT" }),
    Object.freeze({
      stage: "acquire",
      error: driverError("connection-unavailable", "pool-unavailable"),
    }),
  );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    createMultiCutReplayPostgresqlDriverConnectionProvider(fake.driver),
  ).execute(input);
  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.equal(result.phase, "acquire");
  assert.equal(result.classification, "non-retryable");
  assert.equal(result.safeReason, "connection-acquire-failed");
});
