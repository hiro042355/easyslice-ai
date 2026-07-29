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
    released?.orderedPredicates.findIndex(
      ({ physicalField }) => physicalField === field,
    ),
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
    for (const projection of statement.projections) {
      for (const field of projection.orderedFields) {
        assert.ok(field.physicalField);
        assert.ok(field.logicalOutput);
        assert.equal(field.canonicalAlias, field.physicalField);
      }
    }
    assert.deepEqual(statement.cardinality, {
      success: "one",
      zeroAllowed: true,
      multiple: "invariant-violation",
    });
    assert.equal(statement.zeroRowContract.ambiguity, "not-single-cause");
  }
});

test("predicate authority is complete and source-explicit", () => {
  for (const statement of contract.statements) {
    for (const predicate of statement.orderedPredicates) {
      assert.ok(predicate.comparisonOperator, statement.statementId);
      assert.ok(predicate.comparisonSource, statement.statementId);
      assert.ok(predicate.sourceReference, statement.statementId);
      assert.ok(predicate.literalSource, statement.statementId);
      assert.ok(predicate.nullSemantics, statement.statementId);
      assert.ok(predicate.evaluationRole, statement.statementId);
    }
  }
  const released = contract.statements.find(
    ({ statementId }) => statementId === "resolve-existing-replay",
  );
  assert.deepEqual(
    released?.orderedPredicates.find(({ physicalField }) => physicalField === "state"),
    {
      physicalField: "state",
      comparisonOperator: "=",
      comparisonSource: "literal",
      sourceReference: "literal:released",
      literalSource: "statement-lifecycle-authority",
      nullSemantics: "null-never-matches",
      evaluationRole: "state",
    },
  );
});

test("assignment and successor authorities are complete", () => {
  for (const statement of contract.statements) {
    for (const mutation of statement.mutations) {
      assert.ok(mutation.assignmentSource, statement.statementId);
      assert.ok(mutation.sourceReference, statement.statementId);
    }
    for (const field of contract.canonicalContinuityOrder) {
      const reference = statement.successorReferences[field];
      assert.ok(
        reference === "not-used" ||
          reference === `successor:${statement.statementId}:${field}:checked` ||
          reference === `successor:${statement.statementId}:${field}:retain`,
      );
    }
  }
});

test("reference registry is unique and resolves every assignment and successor", () => {
  const ids = contract.referenceRegistry.map(({ referenceId }) => referenceId);
  assert.equal(new Set(ids).size, ids.length);
  const registry = new Map(
    contract.referenceRegistry.map((entry) => [entry.referenceId, entry]),
  );
  for (const required of [
    "parameter-successor:revision",
    "parameter-successor:last_fencing_token",
    "parameter-successor:last_reservation_attempt",
    "initial:revision",
    "initial:last_fencing_token",
    "initial:last_reservation_attempt",
    "initial:state",
    "initial:schema_version",
    "projection:lookup",
    "projection:returning",
    "projection:reconciliation",
  ]) {
    assert.ok(registry.has(required), required);
  }
  for (const statement of contract.statements) {
    for (const mutation of statement.mutations) {
      const resolution = registry.get(mutation.sourceReference);
      assert.ok(resolution, mutation.sourceReference);
      assert.equal(resolution.targetMetadata.physicalFields.length, 1);
      assert.equal(
        resolution.targetMetadata.physicalFields[0],
        mutation.physicalField,
      );
      assert.doesNotMatch(resolution.targetMetadata.valueReference, /^projection:/);
    }
    for (const reference of Object.values(statement.successorReferences)) {
      assert.ok(reference === "not-used" || registry.has(reference), reference);
    }
  }
});

test("checked successors share one authoritative expression per reference", () => {
  const checked = contract.referenceRegistry.filter(
    ({ referenceId }) =>
      referenceId.startsWith("successor:") && referenceId.endsWith(":checked"),
  );
  assert.ok(checked.length > 0);
  for (const resolution of checked) {
    assert.equal(
      resolution.expressionSharing,
      "same-reference-same-authoritative-expression",
    );
    assert.match(
      resolution.targetMetadata.valueReference,
      /^parameter-successor:/,
    );
  }
});

test("lookup projection registry is complete and absence is explicit", () => {
  assert.deepEqual(
    contract.lookupProjectionRegistry.map(({ group }) => group),
    [
      "identity",
      "protected-scope",
      "semantic-fingerprint",
      "replay-state",
      "persistent-continuity",
      "active-processing-evidence",
      "terminal-metadata",
      "result-metadata",
      "reconciliation-metadata",
      "created-metadata",
      "updated-metadata",
    ],
  );
  const projected = new Set(
    contract.lookupProjectionRegistry
      .filter(({ availability }) => availability === "projected")
      .flatMap(({ physicalFields }) => physicalFields),
  );
  const physicalFields =
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name);
  assert.equal(projected.size, physicalFields.length);
  assert.ok(physicalFields.every((field) => projected.has(field)));
  for (const group of contract.lookupProjectionRegistry.filter(
    ({ group }) => group === "created-metadata" || group === "updated-metadata",
  )) {
    assert.equal(group.availability, "not-present-in-physical-schema");
    assert.equal(group.resolutionRule, "explicitly-omit");
  }
  const lookup = contract.statements.find(
    ({ statementId }) => statementId === "lookup-authoritative-replay",
  );
  assert.deepEqual(
    lookup?.projections[0]?.orderedFields.map(({ physicalField }) => physicalField),
    physicalFields,
  );
});

test("zero-row contracts define logical-attempt reuse by statement responsibility", () => {
  const lookup = contract.statements.find(
    ({ statementId }) => statementId === "lookup-authoritative-replay",
  );
  assert.equal(lookup?.zeroRowContract.logicalAttemptReuse, "repeat-authoritative-read");
  for (const statement of contract.statements) {
    assert.ok(statement.zeroRowContract.logicalAttemptReuse);
    if (
      [
        "complete-processing-replay",
        "fail-processing-replay",
        "release-processing-replay",
      ].includes(statement.statementId)
    ) {
      assert.equal(
        statement.zeroRowContract.logicalAttemptReuse,
        "reuse-terminal-intent",
      );
    }
  }
});

test("insert literals and generated values identify their authority", () => {
  const insert = contract.statements.find(
    ({ statementId }) => statementId === "resolve-new-reservation",
  );
  for (const source of insert?.insertSources ?? []) {
    if (source.source === "literal") {
      assert.ok(source.exactLiteral);
      assert.ok(source.sourceAuthority);
    }
    if (source.source === "generated") {
      assert.equal(source.generatedAuthority, "postgresql");
      assert.ok(source.expressionReference);
    }
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
