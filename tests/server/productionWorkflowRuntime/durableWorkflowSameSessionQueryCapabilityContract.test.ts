import assert from "node:assert/strict";
import test from "node:test";

import type {
  DurableWorkflowSameSessionQueryCapability,
  DurableWorkflowSameSessionQueryFailure,
  DurableWorkflowSameSessionQueryResult,
  DurableWorkflowTransactionContext,
  DurableWorkflowTransactionContextV3,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";

const evidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  sessionScope: "workflow-transaction" as const,
  sessionAffinity: "same-session-required" as const,
  transactionOwnership: "workflow-owner" as const,
  separateConnectionPermitted: false as const,
  capabilityOwnsLifecycle: false as const,
  validOnlyDuringActiveTransaction: true as const,
});

const success = (): DurableWorkflowSameSessionQueryResult => Object.freeze({
  resultVersion: "1.0",
  status: "success",
  rows: Object.freeze([
    Object.freeze({ replay_state: "processing", nullable_value: null }),
  ]),
  rowCount: 1,
  command: "SELECT",
});

test("contract is versioned, query-only, and carries explicit same-session evidence", () => {
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    executeQuery: async () => success(),
  });

  assert.equal(capability.capabilityVersion, "1.0");
  assert.deepEqual(capability.evidence, evidence);
  assert.deepEqual(Object.keys(capability).sort(), [
    "capabilityVersion",
    "evidence",
    "executeQuery",
  ]);
  for (const forbiddenMethod of [
    "begin",
    "commit",
    "rollback",
    "acquire",
    "release",
    "discard",
    "close",
    "savepoint",
    "rawClient",
  ]) {
    assert.equal(forbiddenMethod in capability, false);
  }
});

test("success preserves command, row count, rows, null, and caller copy isolation", async () => {
  const sourceRows = [{ replay_state: "processing", nullable_value: null }];
  const capability: DurableWorkflowSameSessionQueryCapability = {
    capabilityVersion: "1.0",
    evidence,
    executeQuery: async () => ({
      resultVersion: "1.0",
      status: "success",
      rows: sourceRows.map((row) => Object.freeze({ ...row })),
      rowCount: 1,
      command: "SELECT",
    }),
  };

  const result = await capability.executeQuery({
    statementId: "lookup-authoritative-replay",
    text: "SELECT replay_state, nullable_value",
    values: [],
    expectedResult: "single",
  });
  sourceRows[0].replay_state = "completed";

  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.command, "SELECT");
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.rows, [
      { replay_state: "processing", nullable_value: null },
    ]);
  }
});

test("failure safely preserves optional SQLSTATE class and every connection disposition", () => {
  const dispositions = [
    "safe-to-reuse",
    "must-rollback-before-reuse",
    "must-discard",
    "unknown",
  ] as const;

  const failures: DurableWorkflowSameSessionQueryFailure[] = dispositions.map(
    (queryConnectionDisposition) => ({
      resultVersion: "1.0",
      status: "execution-failure",
      phase: "query",
      classification: "connection-unavailable",
      safeReason: "classified-query-failure",
      retryMetadata: "retryable",
      reconciliationMetadata: "authoritative-lookup-required",
      sqlStateClass: "08",
      queryConnectionDisposition,
    }),
  );

  assert.deepEqual(
    failures.map((failure) => failure.queryConnectionDisposition),
    dispositions,
  );
  assert.ok(failures.every((failure) => failure.sqlStateClass === "08"));
  assert.ok(failures.every((failure) => !("sql" in failure)));
  assert.ok(failures.every((failure) => !("bindings" in failure)));
  assert.ok(failures.every((failure) => !("error" in failure)));
  assert.ok(failures.every((failure) => !("stack" in failure)));
  assert.ok(failures.every((failure) => !("commitUnknown" in failure)));
  assert.ok(failures.every((failure) => !("sqlState" in failure)));
  assert.ok(failures.every((failure) => !("backendPid" in failure)));
});

test("optional safe failure fields remain optional without inferred defaults", () => {
  const failure: DurableWorkflowSameSessionQueryFailure = {
    resultVersion: "1.0",
    status: "execution-failure",
    phase: "query",
    classification: "unknown-failure",
    safeReason: "classified-query-failure",
    retryMetadata: "non-retryable",
    reconciliationMetadata: "not-required",
  };

  assert.equal("sqlStateClass" in failure, false);
  assert.equal("queryConnectionDisposition" in failure, false);
});

test("V3 is additive and leaves the existing V2 context contract unchanged", () => {
  const acceptsV2 = (_context: DurableWorkflowTransactionContext): void => {};
  const acceptsV3 = (_context: DurableWorkflowTransactionContextV3): void => {};

  assert.equal(typeof acceptsV2, "function");
  assert.equal(typeof acceptsV3, "function");
  assert.equal("sameSessionQuery" in ({} as DurableWorkflowTransactionContext), false);
});
