import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1,
  createDurableWorkflowPostgresqlSameSessionQueryCapabilitySetV1,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import type {
  PostgreSQLQueryRequest,
  PostgreSQLQueryResult,
  PostgreSQLTransactionConnection,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const connection = (run: (request: PostgreSQLQueryRequest) => Promise<PostgreSQLQueryResult>): PostgreSQLTransactionConnection => Object.freeze({
  state: () => "active" as const,
  query: run,
  commit: async () => ({ status: "committed" as const }),
  rollback: async () => ({ status: "rolled-back" as const }),
  release: () => "transaction-active" as const,
});

const request = (expectedResult: "single" | "many" | "none"): PostgreSQLQueryRequest => Object.freeze({
  statementId: `general.${expectedResult}`,
  text: "SELECT $1::jsonb, $2::bytea",
  values: Object.freeze([
    Object.freeze({ kind: "json" as const, value: Object.freeze({ nested: Object.freeze(["input"]) }) }),
    Object.freeze({ kind: "bytea" as const, value: new Uint8Array([1, 2]) }),
  ]),
  expectedResult,
});

test("general V1 accepts every explicit cardinality and delegates exactly once without lifecycle operations", async () => {
  for (const expectedResult of ["single", "many", "none"] as const) {
    let calls = 0;
    let captured: PostgreSQLQueryRequest | undefined;
    const capability = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({
      transactionConnection: connection(async (input) => {
        calls += 1;
        captured = input;
        return { status: "success", rows: [], rowCount: 0, command: "SELECT" };
      }),
    });
    const input = request(expectedResult);
    assert.equal((await capability.executeQuery(input)).status, "success");
    assert.equal(calls, 1);
    assert.equal(captured?.expectedResult, expectedResult);
    assert.notEqual(captured, input);
    assert.equal(capability.capabilityVersion, "1.0");
  }
});

test("success is deterministic and deeply copy-isolated", async () => {
  const json = { nested: ["database"] };
  const bytes = new Uint8Array([7, 8]);
  const rows = [{ json, bytes, nullable: null }];
  const capability = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({
    transactionConnection: connection(async () => ({ status: "success", rows, rowCount: 1, command: "SELECT" })),
  });
  const first = await capability.executeQuery(request("single"));
  const second = await capability.executeQuery(request("single"));
  assert.deepEqual(first, second);
  assert.equal(first.status, "success");
  if (first.status !== "success") return;
  json.nested[0] = "mutated";
  bytes[0] = 0;
  assert.deepEqual(first.rows[0]?.json, { nested: ["database"] });
  assert.deepEqual(first.rows[0]?.bytes, new Uint8Array([7, 8]));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rows), true);
  assert.equal(Object.isFrozen(first.rows[0]), true);
});

test("not-found and both cardinality conflicts preserve authoritative evidence", async () => {
  const cases: readonly Extract<PostgreSQLQueryResult, { status: "not-found" | "cardinality-conflict" }>[] = [
    { status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT" },
    { status: "cardinality-conflict", expectedResult: "single", actualRowCount: 2, command: "SELECT" },
    { status: "cardinality-conflict", expectedResult: "none", actualRowCount: 1, command: "UPDATE" },
  ];
  for (const source of cases) {
    const capability = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({ transactionConnection: connection(async () => source) });
    assert.deepEqual(await capability.executeQuery(request(source.status === "not-found" ? "single" : source.expectedResult)), { resultVersion: "1.0", ...source });
  }
});

test("execution failure preserves safe facts and introduces no policy or commit-unknown", async () => {
  const capability = createDurableWorkflowGeneralPostgresqlSameSessionQueryCapabilityV1({
    transactionConnection: connection(async () => ({
      status: "failure",
      issue: "timeout",
      safeReason: "postgresql-timeout",
      diagnostic: { stage: "query", issue: "timeout", retryable: true, sqlStateClass: "57", queryConnectionDisposition: "must-rollback-before-reuse" },
    })),
  });
  const result = await capability.executeQuery(request("single"));
  assert.deepEqual(result, {
    resultVersion: "1.0", status: "execution-failure", phase: "query", classification: "timeout",
    safeReason: "postgresql-timeout", sqlStateClass: "57", queryConnectionDisposition: "must-rollback-before-reuse",
  });
  for (const forbidden of ["retryMetadata", "reconciliationMetadata", "commit-unknown", "diagnostic", "sqlState", "text", "values"]) assert.equal(forbidden in result, false);
});

test("capability set keeps the Context V3 many-only boundary narrowed", async () => {
  let captured: PostgreSQLQueryRequest | undefined;
  const set = createDurableWorkflowPostgresqlSameSessionQueryCapabilitySetV1({
    transactionConnection: connection(async (input) => {
      captured = input;
      return { status: "success", rows: [], rowCount: 0, command: "SELECT" };
    }),
  });
  await set.manyOnly.executeQuery({ ...request("many"), expectedResult: "many" });
  assert.equal(captured?.expectedResult, "many");
  assert.equal(set.general.evidence, set.manyOnly.evidence);
});
