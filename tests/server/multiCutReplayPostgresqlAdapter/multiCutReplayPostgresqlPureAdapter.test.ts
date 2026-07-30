import assert from "node:assert/strict";
import test from "node:test";

import { MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract";
import { MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitions";
import {
  createMultiCutReplayPostgresqlPureAdapter,
  createReferenceMultiCutReplayPostgresqlFakeClient,
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
      const placeholders =
        definitions.byStatementId[statementId].placeholders.filter(
          (placeholder) =>
            placeholder.parameterBinding === parameterBinding,
        );
      return [
        parameterBinding,
        placeholders.length === 1
          ? `${parameterBinding}:${placeholders[0].ordinal}`
          : Object.freeze(Object.fromEntries(
              placeholders.map(({ physicalField, ordinal }) => [
                physicalField,
                `${parameterBinding}:${physicalField}:${ordinal}`,
              ]),
            )),
      ];
    }),
  ));

test("all eight statements produce exact SQL, parameter order, casts, and count", () => {
  for (const definition of definitions.statements) {
    const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
      Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "TEST" }),
    );
    const adapter = createMultiCutReplayPostgresqlPureAdapter(fixture.client);
    const request = adapter.createExecutionRequest(
      Object.freeze({
        inputVersion: "1.0",
        statementId: definition.statementId,
        bindings: bindingsFor(definition.statementId),
      }),
    );
    assert.equal(request.sql, definition.sql);
    assert.equal(request.parameters.length, definition.placeholders.length);
    assert.equal(request.values.length, definition.placeholders.length);
    assert.deepEqual(
      request.parameters.map(
        ({ ordinal, token, postgresqlCast, parameterBinding }) => ({
          ordinal,
          token,
          postgresqlCast,
          parameterBinding,
        }),
      ),
      definition.placeholders.map(
        ({ ordinal, placeholder, postgresqlCast, parameterBinding }) => ({
          ordinal,
          token: placeholder,
          postgresqlCast,
          parameterBinding,
        }),
      ),
    );
  }
});

test("fake client captures one immutable execution request", async () => {
  const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
    Object.freeze({
      rows: Object.freeze([Object.freeze({ revision: "2" })]),
      rowCount: 1,
      command: "UPDATE",
    }),
  );
  const adapter = createMultiCutReplayPostgresqlPureAdapter(fixture.client);
  await adapter.execute(
    Object.freeze({
      inputVersion: "1.0",
      statementId: "renew-processing-reservation",
      bindings: bindingsFor("renew-processing-reservation"),
    }),
  );
  assert.equal(fixture.capturedRequests.length, 1);
  assert.ok(Object.isFrozen(fixture.capturedRequests[0]));
  assert.ok(Object.isFrozen(fixture.capturedRequests[0].parameters));
  assert.ok(Object.isFrozen(fixture.capturedRequests[0].values));
});

test("duplicate physical fields retain distinct parameter-binding values", () => {
  const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
    Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "UPDATE" }),
  );
  const adapter = createMultiCutReplayPostgresqlPureAdapter(fixture.client);
  const bindings = bindingsFor("takeover-stale-processing-replay");
  const request = adapter.createExecutionRequest(
    Object.freeze({
      inputVersion: "1.0",
      statementId: "takeover-stale-processing-replay",
      bindings,
    }),
  );
  const reservationValues = request.parameters
    .filter(({ physicalField }) => physicalField === "reservation_identity")
    .map(({ value }) => value);
  assert.deepEqual(reservationValues, [
    "expected_ownership_evidence:reservation_identity:13",
    "takeover_reservation_identity:17",
  ]);
});

test("one row is deterministically copied and mapped", async () => {
  const row = Object.freeze({ revision: "2", lease_expires_at: "fixed" });
  const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
    Object.freeze({
      rows: Object.freeze([row]),
      rowCount: 1,
      command: "UPDATE",
    }),
  );
  const adapter = createMultiCutReplayPostgresqlPureAdapter(fixture.client);
  const result = await adapter.execute(
    Object.freeze({
      inputVersion: "1.0",
      statementId: "renew-processing-reservation",
      bindings: bindingsFor("renew-processing-reservation"),
    }),
  );
  assert.equal(result.status, "mapped");
  if (result.status !== "mapped") return;
  assert.deepEqual(result.row, row);
  assert.notEqual(result.row, row);
  assert.ok(Object.isFrozen(result.row));
});

test("zero row classification exactly follows every statement contract", async () => {
  for (const statement of contract.statements) {
    const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
      Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "TEST" }),
    );
    const result = await createMultiCutReplayPostgresqlPureAdapter(
      fixture.client,
    ).execute(
      Object.freeze({
        inputVersion: "1.0",
        statementId: statement.statementId,
        bindings: bindingsFor(statement.statementId),
      }),
    );
    assert.equal(result.status, "zero-row");
    if (result.status !== "zero-row") continue;
    assert.equal(result.classification, statement.zeroRowContract.ambiguity);
    assert.equal(
      result.lookupRequired,
      statement.zeroRowContract.lookupRequired,
    );
    assert.equal(
      result.reconciliationRequired,
      statement.zeroRowContract.reconciliationRequired,
    );
  }
});

test("multiple or inconsistent rows fail cardinality closed", async () => {
  for (const fixtureResult of [
    { rows: [{ value: 1 }, { value: 2 }], rowCount: 2, command: "SELECT" },
    { rows: [], rowCount: 1, command: "UPDATE" },
  ] as const) {
    const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
      fixtureResult,
    );
    const result = await createMultiCutReplayPostgresqlPureAdapter(
      fixture.client,
    ).execute(
      Object.freeze({
        inputVersion: "1.0",
        statementId: "lookup-authoritative-replay",
        bindings: bindingsFor("lookup-authoritative-replay"),
      }),
    );
    assert.equal(result.status, "cardinality-failure");
    if (result.status === "cardinality-failure") {
      assert.equal(result.classification, "invariant-violation");
    }
  }
});

test("retry and commit-unknown metadata exactly follow SQL Definitions", async () => {
  for (const definition of definitions.statements) {
    const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
      Object.freeze({
        failureVersion: "1.0",
        classification: "commit-unknown",
        safeReason: "safe-commit-unknown",
      }),
    );
    const result = await createMultiCutReplayPostgresqlPureAdapter(
      fixture.client,
    ).execute(
      Object.freeze({
        inputVersion: "1.0",
        statementId: definition.statementId,
        bindings: bindingsFor(definition.statementId),
      }),
    );
    assert.equal(result.status, "execution-failure");
    assert.equal(result.metadata.retryClassification, definition.retryClass);
    assert.equal(
      result.metadata.commitUnknownClassification,
      definition.commitUnknown,
    );
    assert.equal(
      result.metadata.reconciliationClassification,
      definition.reconciliationClass,
    );
    if (result.status === "execution-failure") {
      assert.equal(result.classification, "commit-unknown");
      assert.equal(result.safeReason, "safe-commit-unknown");
    }
  }
});

test("missing physical placeholder binding is rejected before client execution", () => {
  const fixture = createReferenceMultiCutReplayPostgresqlFakeClient(
    Object.freeze({ rows: Object.freeze([]), rowCount: 0, command: "TEST" }),
  );
  const adapter = createMultiCutReplayPostgresqlPureAdapter(fixture.client);
  assert.throws(
    () =>
      adapter.createExecutionRequest(
        Object.freeze({
          inputVersion: "1.0",
          statementId: "lookup-authoritative-replay",
          bindings: Object.freeze({}),
        }),
      ),
    /missing-placeholder-binding/,
  );
  assert.equal(fixture.capturedRequests.length, 0);
});
