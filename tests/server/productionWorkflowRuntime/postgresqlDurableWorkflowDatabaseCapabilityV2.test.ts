import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2,
  createPostgresqlDurableWorkflowDatabaseCapabilityV2,
  projectPostgresqlQuerySuccessToDurableSuccessV2,
  type DurableWorkflowGeneralSameSessionQueryCapabilityV1,
  type DurableWorkflowGeneralSameSessionQueryResultV1,
  type PostgreSQLDurableWorkflowDatabaseCapabilityV2Dependencies,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  POSTGRESQL_SLICE_A_STATEMENT_CATALOG,
  resolvePostgreSQLSliceAStatementV1,
} from "@/lib/server/productionWorkflowRuntime/postgresqlStores";

const evidence = Object.freeze({
  evidenceVersion: "1.0",
  sessionScope: "workflow-transaction",
  sessionAffinity: "same-session-required",
  transactionOwnership: "workflow-owner",
  separateConnectionPermitted: false,
  capabilityOwnsLifecycle: false,
  validOnlyDuringActiveTransaction: true,
} as const);

const command = (statementId = "slice-a.final.read") => Object.freeze({
  commandVersion: "1.0" as const,
  statementId,
  parameters: Object.freeze([new Uint8Array(32).fill(1)]),
  expectedResult: "single" as const,
});

function capability(result: DurableWorkflowGeneralSameSessionQueryResultV1, calls: { query: number }): DurableWorkflowGeneralSameSessionQueryCapabilityV1 {
  return Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    async executeQuery() {
      calls.query += 1;
      return result;
    },
  });
}

test("default factory resolves Slice A and projects structured success exactly once", async () => {
  const calls = { query: 0 };
  const payload = { clips: [{ id: "clip-1", values: [1, 2], note: null }] };
  const adapter = createDefaultPostgresqlDurableWorkflowDatabaseCapabilityV2({
    sameSessionQueryCapability: capability(Object.freeze({
      resultVersion: "1.0",
      status: "success",
      rows: Object.freeze([Object.freeze({ terminal_payload: payload })]),
      rowCount: 1,
      command: "SELECT",
    }), calls),
  });
  const result = await adapter.execute(command());
  assert.equal(calls.query, 1);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.command, "SELECT");
  assert.deepEqual(result.rows[0]!.terminal_payload, payload);
  payload.clips[0]!.values[0] = 99;
  assert.equal(((result.rows[0]!.terminal_payload as { clips: readonly { values: readonly number[] }[] }).clips[0]!.values)[0], 1);
});

test("resolver failure prevents query, row projection and classification", async () => {
  const calls = { resolver: 0, query: 0, row: 0, classifier: 0 };
  const dependencies: PostgreSQLDurableWorkflowDatabaseCapabilityV2Dependencies = Object.freeze({
    sameSessionQueryCapability: capability(Object.freeze({ resultVersion: "1.0", status: "success", rows: [], rowCount: 0, command: "SELECT" }), calls),
    statementResolver: () => { calls.resolver += 1; return Object.freeze({ status: "unsupported-statement", statementId: "missing" }); },
    rowProjector: (source, mutationAttempted) => { calls.row += 1; return projectPostgresqlQuerySuccessToDurableSuccessV2(source, mutationAttempted); },
    failureClassifier: () => { calls.classifier += 1; return Object.freeze({ classificationVersion: "1.0", failure: "internal-failure" }); },
  });
  const result = await createPostgresqlDurableWorkflowDatabaseCapabilityV2(dependencies).execute(command("missing"));
  assert.equal(result.status, "failure");
  assert.deepEqual(calls, { resolver: 1, query: 0, row: 0, classifier: 0 });
  if (result.status === "failure") assert.equal(result.kind, "resolver-failure");
});

test("not-found and cardinality evidence bypass projector and classifier", async () => {
  const variants = [
    Object.freeze({ resultVersion: "1.0", status: "not-found", expectedResult: "single", actualRowCount: 0, command: "SELECT" }),
    Object.freeze({ resultVersion: "1.0", status: "cardinality-conflict", expectedResult: "single", actualRowCount: 2, command: "SELECT" }),
  ] as const;
  for (const variant of variants) {
    const calls = { query: 0, row: 0, classifier: 0 };
    const result = await createPostgresqlDurableWorkflowDatabaseCapabilityV2(Object.freeze({
      sameSessionQueryCapability: capability(variant, calls),
      statementResolver: (input) => resolvePostgreSQLSliceAStatementV1(POSTGRESQL_SLICE_A_STATEMENT_CATALOG, input),
      rowProjector: (source, mutationAttempted) => { calls.row += 1; return projectPostgresqlQuerySuccessToDurableSuccessV2(source, mutationAttempted); },
      failureClassifier: () => { calls.classifier += 1; return Object.freeze({ classificationVersion: "1.0", failure: "internal-failure" }); },
    })).execute(command());
    assert.equal(result.status, variant.status);
    assert.deepEqual(calls, { query: 1, row: 0, classifier: 0 });
  }
});

test("execution failure classifies once and preserves every safe transport fact", async () => {
  const calls = { query: 0, classifier: 0 };
  const adapter = createPostgresqlDurableWorkflowDatabaseCapabilityV2(Object.freeze({
    sameSessionQueryCapability: capability(Object.freeze({
      resultVersion: "1.0",
      status: "execution-failure",
      phase: "query",
      classification: "retryable-conflict",
      safeReason: "postgresql-retryable-conflict",
      retryable: true,
      sqlStateClass: "40",
      queryConnectionDisposition: "must-rollback-before-reuse",
    }), calls),
    statementResolver: (input) => resolvePostgreSQLSliceAStatementV1(POSTGRESQL_SLICE_A_STATEMENT_CATALOG, input),
    rowProjector: projectPostgresqlQuerySuccessToDurableSuccessV2,
    failureClassifier: (input) => {
      calls.classifier += 1;
      assert.equal(input.issue, "retryable-conflict");
      assert.equal(input.statement.accessMode, "read");
      return Object.freeze({ classificationVersion: "1.0", failure: "retryable-conflict" });
    },
  }));
  const result = await adapter.execute(command());
  assert.deepEqual(calls, { query: 1, classifier: 1 });
  assert.deepEqual(result, {
    resultVersion: "2.0",
    status: "failure",
    kind: "execution-failure",
    failure: "retryable-conflict",
    retryable: true,
    issue: "retryable-conflict",
    safeReason: "postgresql-retryable-conflict",
    sqlStateClass: "40",
    queryConnectionDisposition: "must-rollback-before-reuse",
  });
});

test("row projection failure is returned unchanged and never classified", async () => {
  const calls = { query: 0, classifier: 0 };
  const adapter = createPostgresqlDurableWorkflowDatabaseCapabilityV2(Object.freeze({
    sameSessionQueryCapability: capability(Object.freeze({ resultVersion: "1.0", status: "success", rows: Object.freeze([]), rowCount: 0, command: "INSERT" }), calls),
    statementResolver: (input) => resolvePostgreSQLSliceAStatementV1(POSTGRESQL_SLICE_A_STATEMENT_CATALOG, Object.freeze({ ...input, statementId: "slice-a.final.insert", parameters: Object.freeze(Array.from({ length: 12 }, () => null)), expectedResult: "many" })),
    rowProjector: (_source, mutationAttempted) => Object.freeze({
      resultVersion: "2.0",
      status: "failure",
      kind: "row-projection-failure",
      phase: "result-projection",
      reason: "unsupported-row-value",
      queryInvoked: true,
      mutationAttempted,
      retryAttempted: false,
      ownerAction: "do-not-commit",
    }),
    failureClassifier: () => { calls.classifier += 1; return Object.freeze({ classificationVersion: "1.0", failure: "internal-failure" }); },
  }));
  const result = await adapter.execute(command());
  assert.equal(result.status, "failure");
  if (result.status === "failure") {
    assert.equal(result.kind, "row-projection-failure");
    assert.equal(result.mutationAttempted, true);
  }
  assert.deepEqual(calls, { query: 1, classifier: 0 });
});
