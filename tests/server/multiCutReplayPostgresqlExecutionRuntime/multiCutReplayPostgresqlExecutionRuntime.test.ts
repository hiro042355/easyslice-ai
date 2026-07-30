import assert from "node:assert/strict";
import test from "node:test";

import { MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitions";
import {
  createMultiCutReplayPostgresqlExecutionRuntime,
  createReferenceMultiCutReplayPostgresqlFakeTransactionClient,
} from "../../../lib/server/multiCutReplayPostgresqlExecutionRuntime";

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

const rowResult = Object.freeze({
  rows: Object.freeze([Object.freeze({ revision: "2" })]),
  rowCount: 1,
  command: "UPDATE",
});

test("success orders acquire, begin, execute, commit, and release", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(rowResult);
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "completed");
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:renew-processing-reservation",
    "commit",
    "release",
  ]);
  assert.equal(fixture.capturedRequests.length, 1);
  assert.equal(
    fixture.capturedRequests[0].sql,
    definitions.byStatementId["renew-processing-reservation"].sql,
  );
});

test("all eight statements invoke the adapter and SQL exactly once", async () => {
  for (const definition of definitions.statements) {
    const fixture =
      createReferenceMultiCutReplayPostgresqlFakeTransactionClient(rowResult);
    await createMultiCutReplayPostgresqlExecutionRuntime(
      fixture.provider,
    ).execute(
      Object.freeze({
        inputVersion: "1.0",
        statementId: definition.statementId,
        bindings: bindingsFor(definition.statementId),
      }),
    );
    assert.equal(fixture.capturedRequests.length, 1);
    assert.equal(fixture.capturedRequests[0].sql, definition.sql);
  }
});

test("adapter execution failure rolls back and always releases", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      rowResult,
      Object.freeze({
        failureVersion: "1.0",
        stage: "execute",
        classification: "execution-failure",
        safeReason: "safe-execute-failure",
      }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "failed");
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:renew-processing-reservation",
    "rollback",
    "release",
  ]);
  if (result.status === "failed") {
    assert.equal(result.phase, "execute");
    assert.equal(result.classification, "non-retryable");
  }
});

test("read execution failure retains retryable classification", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      rowResult,
      Object.freeze({
        failureVersion: "1.0",
        stage: "execute",
        classification: "execution-failure",
        safeReason: "safe-read-failure",
      }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(
    Object.freeze({
      inputVersion: "1.0",
      statementId: "lookup-authoritative-replay",
      bindings: bindingsFor("lookup-authoritative-replay"),
    }),
  );
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.classification, "retryable");
  }
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:lookup-authoritative-replay",
    "rollback",
    "release",
  ]);
});

test("commit failure rolls back before release", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      rowResult,
      Object.freeze({
        failureVersion: "1.0",
        stage: "commit",
        classification: "execution-failure",
        safeReason: "safe-commit-failure",
      }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "failed");
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:renew-processing-reservation",
    "commit",
    "rollback",
    "release",
  ]);
});

test("commit-unknown propagates without unsafe rollback and releases", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      rowResult,
      Object.freeze({
        failureVersion: "1.0",
        stage: "commit",
        classification: "commit-unknown",
        safeReason: "safe-commit-unknown",
      }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "failed");
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:renew-processing-reservation",
    "commit",
    "release",
  ]);
  if (result.status === "failed") {
    assert.equal(result.phase, "commit");
    assert.equal(result.classification, "commit-unknown");
    assert.equal(result.safeReason, "safe-commit-unknown");
  }
});

test("adapter commit-unknown propagates without commit or rollback", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      rowResult,
      Object.freeze({
        failureVersion: "1.0",
        stage: "execute",
        classification: "commit-unknown",
        safeReason: "safe-execute-commit-unknown",
      }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.phase, "execute");
    assert.equal(result.classification, "commit-unknown");
  }
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:renew-processing-reservation",
    "release",
  ]);
});

test("begin failure releases without commit or rollback", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      rowResult,
      Object.freeze({
        failureVersion: "1.0",
        stage: "begin",
        classification: "execution-failure",
        safeReason: "safe-begin-failure",
      }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "failed");
  assert.deepEqual(fixture.executionLog, ["acquire", "begin", "release"]);
});

test("zero-row is a deterministic committed adapter result", async () => {
  const fixture =
    createReferenceMultiCutReplayPostgresqlFakeTransactionClient(
      Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "UPDATE" }),
    );
  const result = await createMultiCutReplayPostgresqlExecutionRuntime(
    fixture.provider,
  ).execute(input);
  assert.equal(result.status, "completed");
  if (result.status === "completed") {
    assert.equal(result.adapterResult.status, "zero-row");
  }
  assert.deepEqual(fixture.executionLog, [
    "acquire",
    "begin",
    "execute:renew-processing-reservation",
    "commit",
    "release",
  ]);
});

test("fixture and runtime are deterministic and immutable", async () => {
  const run = async () => {
    const fixture =
      createReferenceMultiCutReplayPostgresqlFakeTransactionClient(rowResult);
    const runtime = createMultiCutReplayPostgresqlExecutionRuntime(
      fixture.provider,
    );
    const result = await runtime.execute(input);
    assert.ok(Object.isFrozen(runtime));
    assert.ok(Object.isFrozen(fixture));
    return { result, log: fixture.executionLog };
  };
  assert.deepEqual(await run(), await run());
});
