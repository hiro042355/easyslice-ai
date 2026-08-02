import assert from "node:assert/strict";
import test from "node:test";

import {
  projectPostgresqlQueryRowsToDurableRowsV2,
  projectPostgresqlQuerySuccessToDurableSuccessV2,
  type DurableWorkflowDatabaseExecutionResult,
  type DurableWorkflowDatabaseExecutionResultV2,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";

test("V1 success remains unchanged while V2 requires command evidence", () => {
  const v1: DurableWorkflowDatabaseExecutionResult = Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0 });
  const v2: DurableWorkflowDatabaseExecutionResultV2 = Object.freeze({ status: "success", rows: Object.freeze([]), rowCount: 0, command: "SELECT" });
  assert.deepEqual(v1, { status: "success", rows: [], rowCount: 0 });
  assert.equal(v2.status, "success");
  if (v2.status === "success") assert.equal(v2.command, "SELECT");
});

test("V2 projection preserves rows, rowCount, command and structured JSON", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const payload = { clips: [{ scores: [10, 20], metadata: { active: true, note: null } }], empty: [] };
  const source = { rows: [{ terminal_payload: payload, digest: bytes, revision: "7", count: 2 }], rowCount: 1, command: "INSERT" } as const;
  const result = projectPostgresqlQuerySuccessToDurableSuccessV2(source, true);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.command, "INSERT");
  assert.equal(result.rowCount, 1);
  payload.clips[0]!.scores[0] = 99;
  bytes[0] = 9;
  const row = result.rows[0]!;
  assert.equal((((row.terminal_payload as { clips: readonly { scores: readonly number[] }[] }).clips)[0]!.scores)[0], 10);
  assert.deepEqual(row.digest, new Uint8Array([1, 2, 3]));
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(Object.isFrozen(row), true);
});

test("V2 projection preserves SELECT, UPDATE and DELETE commands without inference", () => {
  for (const command of ["SELECT", "UPDATE", "DELETE"] as const) {
    const result = projectPostgresqlQuerySuccessToDurableSuccessV2({ rows: [], rowCount: 0, command }, command !== "SELECT");
    assert.equal(result.status, "success");
    if (result.status === "success") assert.equal(result.command, command);
  }
});

test("unsupported values fail closed with fixed result-projection evidence", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const cases: readonly [unknown, string][] = [
    [undefined, "unsupported-row-value"],
    [Number.NaN, "non-finite-number"],
    [Number.POSITIVE_INFINITY, "non-finite-number"],
    [Number.NEGATIVE_INFINITY, "non-finite-number"],
    [BigInt(1), "unsupported-row-value"],
    [() => undefined, "unsupported-row-value"],
    [Symbol("x"), "unsupported-row-value"],
    [new Date(), "unsupported-row-value"],
    [cyclic, "cyclic-value"],
    [new (class Unsupported {})(), "unsupported-row-value"],
  ];
  for (const [value, reason] of cases) {
    const result = projectPostgresqlQueryRowsToDurableRowsV2([{ value }], true);
    assert.deepEqual(result, {
      resultVersion: "2.0",
      status: "failure",
      kind: "row-projection-failure",
      phase: "result-projection",
      reason,
      queryInvoked: true,
      mutationAttempted: true,
      retryAttempted: false,
      ownerAction: "do-not-commit",
    });
    assert.equal("issue" in result, false);
    assert.equal("safeReason" in result, false);
  }
});

test("Result Reference scalar rows remain lossless under V2 projection", () => {
  const row = { reference_id: "11111111-1111-4111-8111-111111111111", revision: "1", expires_at: "2026-08-02T00:00:00.000Z", deletion_state: null };
  const result = projectPostgresqlQuerySuccessToDurableSuccessV2({ rows: [row], rowCount: 1, command: "SELECT" }, false);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.rows[0], row);
});
