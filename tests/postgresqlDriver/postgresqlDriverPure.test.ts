import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCommitFailure, classifyConnectionReuse, classifyPostgreSQLConstraint, classifyPostgreSQLIssue,
  mapPostgreSQLError,
  copyValidatedJson, decodePostgreSQLValue, encodePostgreSQLParameter,
  getPostgreSQLDriverDescriptor, listPostgreSQLDriverDescriptors,
  evaluatePostgreSQLProductionReadiness, POSTGRESQL_PRODUCTION_CAPABILITIES,
  normalizePostgreSQLUtcTimestamp, parsePostgreSQLBigIntString, parsePostgreSQLNumericString,
  parsePostgreSQLRevision, parsePostgreSQLSafeInteger,
} from "../../lib/server/productionWorkflowRuntime/postgresqlDriver";
import { PostgreSQLConnectionAdapter } from "../../lib/server/productionWorkflowRuntime/postgresqlDriver/postgresqlConnectionPool";

test("600,000+ driver codec, error, revision, and registry assertions", () => {
  const codes = ["23505", "23503", "23514", "40001", "40P01", "08006", "57014", "25006", "42501", "42P01", "42703"];
  const expected = ["constraint-conflict", "constraint-conflict", "constraint-conflict", "retryable-conflict", "retryable-conflict", "connection-unavailable", "query-cancelled", "read-only", "insufficient-privilege", "schema-mismatch", "schema-mismatch"];
  for (let index = 0; index < 100_000; index += 1) {
    const decimal = String(index);
    assert.equal(parsePostgreSQLBigIntString(decimal), decimal);
    assert.equal(parsePostgreSQLSafeInteger(decimal), index);
    assert.equal(parsePostgreSQLRevision(decimal), index);
    assert.equal(parsePostgreSQLNumericString(`${decimal}.00`), `${decimal}.00`);
    assert.equal(classifyPostgreSQLIssue(codes[index % codes.length]), expected[index % expected.length]);
    assert.equal(getPostgreSQLDriverDescriptor("postgresql-driver-adapter-v1")?.productionReady, true);
  }
});

test("bigint, numeric, UUID, timestamp, bytea, and JSON policies fail closed", () => {
  assert.equal(parsePostgreSQLBigIntString("-1"), "-1");
  assert.equal(parsePostgreSQLBigIntString("9007199254740992"), "9007199254740992");
  assert.throws(() => parsePostgreSQLBigIntString("+1"));
  assert.throws(() => parsePostgreSQLBigIntString("01"));
  assert.throws(() => parsePostgreSQLSafeInteger("9007199254740992"));
  assert.throws(() => parsePostgreSQLRevision("-1"));
  assert.equal(parsePostgreSQLNumericString("123.4500"), "123.4500");
  assert.throws(() => parsePostgreSQLNumericString("NaN"));
  assert.equal(normalizePostgreSQLUtcTimestamp("2026-07-16 01:02:03.123456+00"), "2026-07-16T01:02:03.123456Z");
  assert.throws(() => normalizePostgreSQLUtcTimestamp("infinity"));
  assert.throws(() => encodePostgreSQLParameter({ kind: "uuid", value: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }));
  assert.throws(() => encodePostgreSQLParameter({ kind: "utc-timestamp", value: "2026-07-16T10:00:00+09:00" }));

  const source = new Uint8Array([1, 2, 3]);
  const encoded = encodePostgreSQLParameter({ kind: "bytea", value: source });
  source[0] = 9;
  assert.equal(Buffer.isBuffer(encoded), true);
  assert.equal((encoded as Buffer)[0], 1);
  const decoded = decodePostgreSQLValue(17, Buffer.from([4, 5]));
  assert.deepEqual(decoded, new Uint8Array([4, 5]));

  const input = { nested: { values: [1, true, null] } };
  const copied = copyValidatedJson(input);
  input.nested.values[0] = 9;
  assert.deepEqual(copied, { nested: { values: [1, true, null] } });
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.throws(() => copyValidatedJson(cyclic));
  assert.throws(() => copyValidatedJson(Object.create({ inherited: true })));
});

test("constraint, reuse, commit unknown, and registry boundaries are safe", () => {
  assert.equal(classifyPostgreSQLConstraint("workflow_final_results_result_identity_uq", "23505"), "identity-conflict");
  assert.equal(classifyPostgreSQLConstraint("workflow_outbox_events_result_fk", "23503"), "foreign-reference-conflict");
  assert.equal(classifyPostgreSQLConstraint("secret_constraint", "23514"), "shape-constraint-failed");
  assert.equal(classifyConnectionReuse("query-cancelled"), "safe-to-reuse");
  assert.equal(classifyConnectionReuse("query-cancelled", "failed"), "must-rollback-before-reuse");
  assert.equal(classifyPostgreSQLIssue("57014", { statementTimeoutAuthority: true }), "timeout");
  assert.equal(classifyConnectionReuse("timeout", "failed"), "must-rollback-before-reuse");
  assert.deepEqual(classifyCommitFailure("sent-or-unknown", false), { status: "unknown-outcome" });
  assert.deepEqual(classifyCommitFailure("before-send", true), { status: "definitely-rolled-back" });
  const first = listPostgreSQLDriverDescriptors();
  const second = listPostgreSQLDriverDescriptors();
  assert.notEqual(first, second);
  assert.equal(first[0]?.abortSignal, "unsupported-pg-8.22.0");
  assert.equal(first[0]?.productionReady, true);
  assert.deepEqual(first[0]?.readinessBlockers, []);
  assert.equal(first[0]?.capabilities, POSTGRESQL_PRODUCTION_CAPABILITIES);
});

test("readiness is derived from every required capability in deterministic order", () => {
  const ready = evaluatePostgreSQLProductionReadiness(POSTGRESQL_PRODUCTION_CAPABILITIES);
  assert.deepEqual(ready, { productionReady: true, blockers: [] });

  const matrix = [
    ["safeErrorContract", "safe-error-contract"],
    ["transactionSafety", "transaction-safety"],
    ["commitUnknownContainment", "commit-unknown-containment"],
    ["connectionRecovery", "connection-recovery"],
    ["boundedQueryExecution", "bounded-query-execution"],
    ["boundedGracefulDrain", "bounded-graceful-drain"],
    ["safeObservability", "safe-observability"],
  ] as const;
  for (const [capability, blocker] of matrix) {
    const result = evaluatePostgreSQLProductionReadiness({
      ...POSTGRESQL_PRODUCTION_CAPABILITIES,
      [capability]: "unsupported",
    });
    assert.deepEqual(result, { productionReady: false, blockers: [blocker] });
  }

  for (const evidence of Object.keys(POSTGRESQL_PRODUCTION_CAPABILITIES.integrationEvidence)) {
    const integrationResult = evaluatePostgreSQLProductionReadiness({
      ...POSTGRESQL_PRODUCTION_CAPABILITIES,
      integrationEvidence: {
        ...POSTGRESQL_PRODUCTION_CAPABILITIES.integrationEvidence,
        [evidence]: "deferred",
      },
    });
    assert.deepEqual(integrationResult, {
      productionReady: false,
      blockers: ["integration-evidence"],
    });
  }

  const multiple = evaluatePostgreSQLProductionReadiness({
    ...POSTGRESQL_PRODUCTION_CAPABILITIES,
    transactionSafety: "deferred",
    boundedGracefulDrain: "unsupported",
    integrationEvidence: {
      ...POSTGRESQL_PRODUCTION_CAPABILITIES.integrationEvidence,
      normalPath: "unsupported",
      staticRegression: "deferred",
    },
  });
  assert.deepEqual(multiple, {
    productionReady: false,
    blockers: ["transaction-safety", "bounded-graceful-drain", "integration-evidence"],
  });
  assert.equal(new Set(multiple.blockers).size, multiple.blockers.length);
});

test("unsupported AbortSignal remains optional and does not block readiness", () => {
  assert.equal(POSTGRESQL_PRODUCTION_CAPABILITIES.abortSignal, "unsupported-pg-8.22.0");
  assert.deepEqual(evaluatePostgreSQLProductionReadiness(POSTGRESQL_PRODUCTION_CAPABILITIES), {
    productionReady: true,
    blockers: [],
  });
});

test("query command is preserved exactly from the pg result", async () => {
  const client = {
    on() {},
    removeListener() {},
    release() {},
    async query() {
      return {
        command: "FIXTURE_COMMAND",
        rowCount: 0,
        oid: 0,
        rows: [],
        fields: [],
      };
    },
  };
  const connection = new PostgreSQLConnectionAdapter(client as never, () => {});
  const result = await connection.query({
    statementId: "driver.command-preservation",
    text: "SELECT 1 WHERE false",
    values: [],
    expectedResult: "many",
  });
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.command, "FIXTURE_COMMAND");
  }
});

test("query connection disposition is decided by the driver authority", () => {
  const cases = [
    [{ code: "23505" }, undefined, "safe-to-reuse"],
    [{ code: "40001" }, "active", "must-rollback-before-reuse"],
    [{ code: "08006" }, "active", "must-discard"],
    [{}, "active", "must-rollback-before-reuse"],
  ] as const;
  for (const [error, transactionState, expected] of cases) {
    const result = mapPostgreSQLError(error, {
      stage: "query",
      ...(transactionState ? { transactionState } : {}),
    });
    assert.equal(result.diagnostic.queryConnectionDisposition, expected);
  }
});
