import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDurableWorkflowPostgresqlFailureV1,
  DURABLE_WORKFLOW_POSTGRESQL_FAILURE_CLASSIFICATION_V1,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type { PostgreSQLDriverIssueCode } from "@/lib/server/productionWorkflowRuntime/postgresqlDriver";

const expected = Object.freeze({
  "invalid-request": "internal-failure",
  "query-cancelled": "transaction-aborted",
  timeout: "deadline-exceeded",
  "connection-unavailable": "unavailable",
  "schema-mismatch": "schema-mismatch",
  "constraint-conflict": "transaction-aborted",
  "retryable-conflict": "retryable-conflict",
  "read-only": "read-only-violation",
  "insufficient-privilege": "unavailable",
  "unknown-failure": "internal-failure",
  disposed: "unavailable",
} as const satisfies Readonly<Record<PostgreSQLDriverIssueCode, string>>);

test("classification matrix exhaustively fixes every PostgreSQL issue", () => {
  assert.deepEqual(DURABLE_WORKFLOW_POSTGRESQL_FAILURE_CLASSIFICATION_V1, expected);
  for (const issue of Object.keys(expected) as PostgreSQLDriverIssueCode[]) {
    const result = classifyDurableWorkflowPostgresqlFailureV1({
      classificationVersion: "1.0",
      issue,
      phase: "query-execution",
      statement: { accessMode: "write" },
    });
    assert.deepEqual(result, {
      classificationVersion: "1.0",
      failure: expected[issue],
    });
    assert.equal(Object.isFrozen(result), true);
  }
});

test("classification is independent from mutable policy metadata", () => {
  const read = classifyDurableWorkflowPostgresqlFailureV1({
    classificationVersion: "1.0",
    issue: "timeout",
    phase: "query-execution",
    statement: { accessMode: "read" },
  });
  const write = classifyDurableWorkflowPostgresqlFailureV1({
    classificationVersion: "1.0",
    issue: "timeout",
    phase: "query-execution",
    statement: { accessMode: "write" },
  });
  assert.deepEqual(read, write);
});
