import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2 as physical } from "../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";
import { MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as sqlContract } from "../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract";
import { MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions } from "../../lib/server/multiCutReplayPostgresqlSqlDefinitions";

const migrationUrl = new URL(
  "../../db/workflow/migrations/V000004__add_multi_cut_replay_postgresql_foundation.sql",
  import.meta.url,
);

const quotedIdentifier = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("migration table and columns exactly cover Physical Schema V2", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(
    sql,
    new RegExp(`CREATE TABLE ${quotedIdentifier(physical.table.name)} \\(`),
  );
  for (const column of physical.table.columns) {
    const type =
      column.type === "timestamp-with-time-zone" ? "timestamptz" : column.type;
    const nullability = column.nullable ? "" : " NOT NULL";
    assert.match(
      sql,
      new RegExp(
        `^  ${quotedIdentifier(column.name)} ${quotedIdentifier(type)}${nullability},?$`,
        "m",
      ),
      column.name,
    );
  }
  assert.equal(physical.table.columns.length, 31);
  const declaredColumns = [...sql.matchAll(
    /^  ([a-z][a-z0-9_]*) (uuid|text|integer|timestamptz)(?: NOT NULL)?,?$/gm,
  )].map((match) => match[1]);
  assert.deepEqual(
    declaredColumns,
    physical.table.columns.map(({ name }) => name),
  );
  assert.doesNotMatch(sql, /\bDEFAULT\b/i);
  assert.doesNotMatch(sql, /\bGENERATED\b/i);
  assert.doesNotMatch(sql, /\bREFERENCES\b/i);
});

test("migration declares every Physical Schema constraint and index", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const constraint of [
    ...physical.constraints,
    physical.authoritativeUniqueConstraint,
  ]) {
    assert.match(
      sql,
      new RegExp(`CONSTRAINT ${quotedIdentifier(constraint.name)}\\b`),
      constraint.name,
    );
    for (const column of constraint.columns) {
      assert.match(sql, new RegExp(`\\b${quotedIdentifier(column)}\\b`));
    }
  }
  assert.deepEqual(
    [...sql.matchAll(/^\s*CONSTRAINT ([a-z][a-z0-9_]*)\b/gm)].map(
      (match) => match[1],
    ).sort(),
    [
      ...physical.constraints,
      physical.authoritativeUniqueConstraint,
    ].map(({ name }) => name).sort(),
  );
  for (const index of physical.indexes) {
    assert.match(
      sql,
      new RegExp(
        `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quotedIdentifier(index.name)}\\b`,
      ),
      index.name,
    );
    for (const column of index.columns) {
      assert.match(sql, new RegExp(`\\b${quotedIdentifier(column)}\\b`));
    }
  }
  assert.deepEqual(
    [...sql.matchAll(/^CREATE (?:UNIQUE )?INDEX ([a-z][a-z0-9_]*)\b/gm)].map(
      (match) => match[1],
    ),
    physical.indexes.map(({ name }) => name),
  );
  assert.equal(physical.relationships.length, 0);
});

test("all SQL Definition physical fields exist in the migration", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const columns = new Set(physical.table.columns.map(({ name }) => name));
  assert.equal(definitions.tableName, physical.table.name);
  for (const statement of definitions.statements) {
    for (const placeholder of statement.placeholders) {
      if (placeholder.physicalField === "lease_duration_milliseconds") {
        continue;
      }
      assert.ok(columns.has(placeholder.physicalField), placeholder.physicalField);
    }
    assert.match(sql, new RegExp(`CREATE TABLE ${definitions.tableName}\\b`));
  }
  for (const statement of sqlContract.statements) {
    for (const field of [
      ...statement.orderedPredicates.map(({ physicalField }) => physicalField),
      ...statement.mutations.map(({ physicalField }) => physicalField),
      ...statement.insertSources.map(({ physicalField }) => physicalField),
      ...statement.projections.flatMap(({ orderedFields }) =>
        orderedFields.map(({ physicalField }) => physicalField),
      ),
    ]) {
      assert.ok(columns.has(field), `${statement.statementId}:${field}`);
    }
  }
});

test("migration preserves processing, result, terminal, and continuity invariants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const required of [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
    "reservation_evidence_version",
    "reservation_identity",
    "lease_identity",
    "lease_expires_at",
    "reservation_attempt",
    "result_reference_version",
    "result_reference_identity",
    "terminal_metadata_version",
    "terminal_at",
    "terminal_classification",
  ]) {
    assert.match(sql, new RegExp(`\\b${required}\\b`), required);
  }
  assert.match(sql, /state IN \('processing', 'completed', 'failed', 'released'\)/);
  assert.match(sql, /fencing_token = last_fencing_token/);
  assert.match(sql, /reservation_attempt = last_reservation_attempt/);
});

test("migration is forward-only DDL without runtime or transaction control", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|SELECT)\b/i);
  assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT|ROLLBACK)\b/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /[ \t]+$/m);
  assert.equal(sql.endsWith("\n"), true);
});
