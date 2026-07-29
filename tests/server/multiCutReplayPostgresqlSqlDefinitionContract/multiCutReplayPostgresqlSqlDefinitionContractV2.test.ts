import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2 } from "../../../lib/server/multiCutReplayPersistenceParameters";
import { MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 } from "../../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";
import { MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract";
import { MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS } from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";

test("contract covers exactly the eight catalog statements", () => {
  assert.deepEqual(
    contract.statements.map(({ statementId }) => statementId),
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
  );
});

test("placeholder ordinals, casts, and physical bindings are canonical", () => {
  const columns = new Set(
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name),
  );
  for (const statement of contract.statements) {
    assert.deepEqual(
      statement.placeholders.map(({ ordinal }) => ordinal),
      statement.placeholders.map((_, index) => index + 1),
      statement.statementId,
    );
    for (const placeholder of statement.placeholders) {
      assert.equal(placeholder.placeholder, `$${placeholder.ordinal}`);
      assert.ok(placeholder.postgresqlCast);
      assert.ok(
        columns.has(placeholder.physicalField) ||
          placeholder.parameterBinding === "lease_duration_milliseconds",
        `${statement.statementId}:${placeholder.physicalField}`,
      );
    }
  }
});

test("predicate and continuity order are fixed", () => {
  assert.deepEqual(contract.canonicalContinuityOrder, [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ]);
  assert.deepEqual(contract.successorSources, {
    revision: "revision",
    last_fencing_token: "last_fencing_token",
    last_reservation_attempt: "last_reservation_attempt",
  });
  const released = contract.statements.find(
    ({ statementId }) => statementId === "resolve-existing-replay",
  );
  const positions = contract.canonicalContinuityOrder.map((field) =>
    released?.orderedPredicates.indexOf(field),
  );
  assert.ok(positions.every((position) => position !== undefined && position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left! - right!));
});

test("mutation and projection matrices cover every physical field", () => {
  const physicalFields =
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name);
  for (const statement of contract.statements) {
    assert.deepEqual(
      statement.mutations.map(({ physicalField }) => physicalField),
      physicalFields,
      statement.statementId,
    );
    assert.ok(statement.projections.length >= 2, statement.statementId);
    assert.deepEqual(statement.cardinality, {
      success: "one",
      zeroAllowed: true,
      multiple: "invariant-violation",
    });
    assert.equal(statement.zeroRowContract.ambiguity, "not-single-cause");
  }
});

test("resolve-new insert source matrix is complete", () => {
  const insert = contract.statements.find(
    ({ statementId }) => statementId === "resolve-new-reservation",
  );
  assert.equal(
    insert?.insertSources.length,
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.length,
  );
  for (const field of [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ]) {
    assert.equal(
      insert?.insertSources.find(({ physicalField }) => physicalField === field)
        ?.source,
      "generated",
      field,
    );
  }
});

test("contract remains aligned with parameter bindings and contains no SQL body", async () => {
  const parameterIds =
    MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2.statementBindings.map(
      ({ statementId }) => statementId,
    );
  assert.deepEqual(
    contract.statements.map(({ statementId }) => statementId),
    parameterIds,
  );
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract/contractV2.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+/i);
  assert.doesNotMatch(source, /(?:Runtime|Adapter|Executor|Client|node:pg|from\s+["']pg["'])/);
});
