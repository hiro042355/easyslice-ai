import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitions";
import {
  createMultiCutReplayPostgresqlPureAdapter,
  createMultiCutReplayPostgresqlQueryMappingCore,
  createMultiCutReplayPostgresqlQueryMappingCoreV2,
  createReferenceMultiCutReplayPostgresqlFakeClient,
  createReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient,
  executeReplayPostgresqlQueryOnly,
} from "../../../lib/server/multiCutReplayPostgresqlAdapter";

const bindingsFor = (
  statementId: keyof typeof definitions.byStatementId,
): Readonly<Record<string, unknown>> =>
  Object.freeze(Object.fromEntries(
    [...new Set(
      definitions.byStatementId[statementId].placeholders.map(
        ({ parameterBinding }) => parameterBinding,
      ),
    )].map((parameterBinding) => {
      const placeholders = definitions.byStatementId[statementId].placeholders
        .filter((entry) => entry.parameterBinding === parameterBinding);
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

test("query-only core invokes once and maps one-row, zero-row, and cardinality", async () => {
  const cases = [
    [{ kind: "success", rows: [{ revision: "2" }], rowCount: 1, command: "UPDATE" }, "mapped"],
    [{ kind: "success", rows: [], rowCount: 0, command: "UPDATE" }, "zero-row"],
    [{ kind: "success", rows: [{ revision: "2" }, { revision: "3" }], rowCount: 2, command: "UPDATE" }, "cardinality-failure"],
  ] as const;
  for (const [fixtureResult, status] of cases) {
    const fixture = createReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient(
      fixtureResult,
    );
    const core = createMultiCutReplayPostgresqlQueryMappingCore(fixture.client);
    assert.equal(core.coreVersion, "1.0");
    const result = await core.execute(input);
    assert.equal(result.status, status);
    assert.equal(fixture.capturedRequests.length, 1);
    assert.ok(Object.isFrozen(result));
  }
});

test("query-only entry point preserves safe failure metadata and disposition", async () => {
  for (const disposition of [
    "safe-to-reuse",
    "must-rollback-before-reuse",
    "must-discard",
    "unknown",
  ] as const) {
    const fixture = createReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient(
      Object.freeze({
        kind: "execution-failure",
        failureVersion: "1.0",
        classification: "execution-failure",
        safeReason: "query-failed",
        sqlStateClass: "40",
        queryConnectionDisposition: disposition,
      }),
    );
    const result = await executeReplayPostgresqlQueryOnly(fixture.client, input);
    assert.equal(result.status, "execution-failure");
    if (result.status !== "execution-failure") continue;
    assert.equal(result.classification, "execution-failure");
    assert.equal(result.safeReason, "query-failed");
    assert.equal(result.sqlStateClass, "40");
    assert.equal(result.queryConnectionDisposition, disposition);
    assert.equal(fixture.capturedRequests.length, 1);
  }
});

test("missing optional diagnostics remain absent and no retry occurs", async () => {
  const fixture = createReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient(
    Object.freeze({
      kind: "execution-failure",
      failureVersion: "1.0",
      classification: "execution-failure",
      safeReason: "query-rejected",
    }),
  );
  const result = await executeReplayPostgresqlQueryOnly(fixture.client, input);
  assert.equal(result.status, "execution-failure");
  assert.equal("sqlStateClass" in result, false);
  assert.equal("queryConnectionDisposition" in result, false);
  assert.equal(fixture.capturedRequests.length, 1);
});

test("V2 query-only core preserves every authoritative transport issue without changing metadata", async () => {
  const issues = [
    "invalid-request", "query-cancelled", "timeout", "connection-unavailable",
    "schema-mismatch", "constraint-conflict", "retryable-conflict", "read-only",
    "insufficient-privilege", "unknown-failure", "disposed",
  ] as const;
  for (const issue of issues) {
    const core = createMultiCutReplayPostgresqlQueryMappingCoreV2(Object.freeze({
      async execute() {
        return Object.freeze({
          kind: "execution-failure" as const,
          failureVersion: "2.0" as const,
          classification: "execution-failure" as const,
          issue,
          safeReason: `postgresql-${issue}`,
        });
      },
    }));
    const result = await core.execute(input);
    assert.equal(result.status, "execution-failure");
    if (result.status !== "execution-failure") continue;
    assert.equal(result.issue, issue);
    assert.equal(result.safeReason, `postgresql-${issue}`);
    assert.equal(
      result.metadata.retryClassification,
      definitions.byStatementId[input.statementId].retryClass,
    );
    assert.equal(
      result.metadata.reconciliationClassification,
      definitions.byStatementId[input.statementId].reconciliationClass,
    );
  }
});

test("query-only core rejects commit-unknown while compatibility wrapper preserves it", async () => {
  const commitUnknown = Object.freeze({
    failureVersion: "1.0" as const,
    classification: "commit-unknown" as const,
    safeReason: "legacy-commit-unknown",
  });
  let calls = 0;
  const queryOnlyClient = Object.freeze({
    async execute() {
      calls += 1;
      throw commitUnknown;
    },
  });
  await assert.rejects(
    createMultiCutReplayPostgresqlQueryMappingCore(queryOnlyClient).execute(input),
    (failure: unknown) => failure === commitUnknown,
  );
  assert.equal(calls, 1);

  const legacy = createReferenceMultiCutReplayPostgresqlFakeClient(commitUnknown);
  const result = await createMultiCutReplayPostgresqlPureAdapter(
    legacy.client,
  ).execute(input);
  assert.equal(result.status, "execution-failure");
  if (result.status === "execution-failure") {
    assert.equal(result.classification, "commit-unknown");
    assert.equal(result.safeReason, "legacy-commit-unknown");
  }
});

test("mapped rows and captured requests are copy-isolated", async () => {
  const row: Record<string, unknown> = { revision: "2" };
  const fixture = createReferenceMultiCutReplayPostgresqlFakeQueryOnlyClient({
    kind: "success",
    rows: [row],
    rowCount: 1,
    command: "UPDATE",
  });
  const result = await executeReplayPostgresqlQueryOnly(fixture.client, input);
  row.revision = "9";
  assert.equal(result.status, "mapped");
  if (result.status === "mapped") assert.equal(result.row.revision, "2");
  assert.notEqual(fixture.capturedRequests, fixture.capturedRequests);
  assert.ok(Object.isFrozen(fixture.capturedRequests));
});

test("query-only boundary owns no transaction, retry, infrastructure, or commit-unknown behavior", async () => {
  const [coreSource, fakeSource, wrapperSource, indexSource] =
    await Promise.all([
      readFile(new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/queryMappingCore.ts",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/referenceFakeQueryOnlyClient.ts",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/pureAdapter.ts",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapter/index.ts",
        import.meta.url,
      ), "utf8"),
    ]);
  const queryOnlySource = `${coreSource}\n${fakeSource}`;
  assert.doesNotMatch(queryOnlySource, /commit-unknown/);
  assert.doesNotMatch(
    queryOnlySource,
    /\b(?:begin|commit|rollback|release|discard|setTimeout|setInterval)\s*\(/,
  );
  assert.doesNotMatch(
    queryOnlySource,
    /(?:process\.env|from\s+["']pg["']|ExecutionRuntime|Participation|Workflow|ProductionComposition)/,
  );
  assert.equal((queryOnlySource.match(/client\.execute\(/g) ?? []).length, 2);
  assert.match(wrapperSource, /classification:\s*"commit-unknown"/);
  assert.match(indexSource, /executeReplayPostgresqlQueryOnly/);
  assert.match(indexSource, /createMultiCutReplayPostgresqlQueryMappingCore/);
});
