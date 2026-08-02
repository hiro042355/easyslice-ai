import assert from "node:assert/strict";
import test from "node:test";
import {
  POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
  resolvePostgreSQLSliceAStatementV1,
} from "@/lib/server/productionWorkflowRuntime/postgresqlStores";
import type { DurableWorkflowDatabaseCommand } from "@/lib/server/productionWorkflowRuntime/durableTransaction";

const command = (
  statementId: string,
  expectedResult: DurableWorkflowDatabaseCommand["expectedResult"],
  count: number,
): DurableWorkflowDatabaseCommand => Object.freeze({
  commandVersion: "1.0",
  statementId,
  parameters: Object.freeze(Array.from({ length: count }, (_, index) =>
    index === 0 ? Uint8Array.from([1, 2, 3]) : `value-${index}`)),
  expectedResult,
});

test("resolver projects every authoritative Slice A statement without SQL duplication", () => {
  for (const statement of POSTGRESQL_SLICE_A_STATEMENT_CATALOG.statements) {
    const result = resolvePostgreSQLSliceAStatementV1(
      POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
      command(statement.statementId, statement.cardinality, statement.parameterCount),
    );
    assert.equal(result.status, "resolved");
    if (result.status !== "resolved") continue;
    assert.equal(result.value.resolverVersion, "1.0");
    assert.equal(result.value.query.statementId, statement.statementId);
    assert.equal(result.value.query.text, statement.sql);
    assert.equal(result.value.query.expectedResult, statement.cardinality);
    assert.equal(result.value.query.values.length, statement.parameterCount);
    assert.equal(result.value.statement.accessMode, statement.accessMode);
    assert.equal(Object.isFrozen(result.value.query.values), true);
    assert.equal(Object.isFrozen(result.value), true);
  }
});

test("resolver rejects unknown, wrong cardinality, and wrong parameter count", () => {
  assert.deepEqual(resolvePostgreSQLSliceAStatementV1(
    POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
    command("slice-a.unknown", "many", 0),
  ), { status: "unsupported-statement", statementId: "slice-a.unknown" });
  const first = POSTGRESQL_SLICE_A_STATEMENT_CATALOG.statements[0]!;
  assert.deepEqual(resolvePostgreSQLSliceAStatementV1(
    POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
    command(first.statementId, first.cardinality, first.parameterCount - 1),
  ), { status: "invalid-request", reason: "parameter-count-mismatch" });
  assert.deepEqual(resolvePostgreSQLSliceAStatementV1(
    POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
    command(first.statementId, "single", first.parameterCount),
  ), { status: "invalid-request", reason: "cardinality-mismatch" });
});

test("resolver copy-isolates byte parameters", () => {
  const statement = POSTGRESQL_SLICE_A_STATEMENT_CATALOG.statements.find(
    ({ statementId }) => statementId === "slice-a.final.read",
  )!;
  const input = command(statement.statementId, statement.cardinality, 1);
  const result = resolvePostgreSQLSliceAStatementV1(
    POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
    input,
  );
  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  const original = input.parameters[0];
  if (!(original instanceof Uint8Array)) return;
  original[0] = 99;
  const projected = result.value.query.values[0];
  assert.equal(projected?.kind, "bytea");
  if (projected?.kind === "bytea") assert.equal(projected.value[0], 1);
});
