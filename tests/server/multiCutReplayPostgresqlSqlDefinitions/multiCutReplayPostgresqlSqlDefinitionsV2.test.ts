import assert from "node:assert/strict";
import test from "node:test";

import { MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2 as parameters } from "../../../lib/server/multiCutReplayPersistenceParameters";
import { MULTI_CUT_REPLAY_SQL_DEFINITION_CONTRACT_V2 as contract } from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitionContract";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_SQL_DEFINITIONS_V2 as definitions,
  renderMultiCutReplayPostgresqlSqlV2,
} from "../../../lib/server/multiCutReplayPostgresqlSqlDefinitions";
import { MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS } from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";

test("renders exactly the eight authoritative statement definitions", () => {
  assert.equal(definitions.definitionVersion, "2.0");
  assert.equal(definitions.tableName, "multi_cut_replay_records_v2");
  assert.deepEqual(
    definitions.statements.map(({ statementId }) => statementId),
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
  );
  for (const statement of definitions.statements) {
    assert.equal(definitions.byStatementId[statement.statementId], statement);
  }
});

test("rendering is deterministic and contains no transaction control or DDL", () => {
  for (const [index, statement] of contract.statements.entries()) {
    const definition = definitions.statements[index];
    assert.equal(
      definition.sql,
      renderMultiCutReplayPostgresqlSqlV2(
        statement,
        contract.terminalResolutionRegistry,
      ),
    );
    assert.equal(definition.sql, definition.sql.trim());
    assert.doesNotMatch(definition.sql, /[ \t]+$/m);
    assert.doesNotMatch(
      definition.sql,
      /\b(?:BEGIN|COMMIT|ROLLBACK|CREATE|ALTER|DROP|TRUNCATE)\b/i,
    );
    assert.doesNotMatch(definition.sql, /SELECT\s+\*/i);
    assert.equal(definition.transactionControlIncluded, false);
    assert.equal(definition.ddlIncluded, false);
  }
});

test("placeholder tokens, ordinals, casts, and binding order are exact", () => {
  for (const definition of definitions.statements) {
    const tokens = [
      ...definition.sql.matchAll(/\$(\d+)::(uuid|text|integer|bigint|timestamptz)/g),
    ];
    const usedOrdinals = new Set(tokens.map((match) => Number(match[1])));
    for (const placeholder of definition.placeholders) {
      assert.equal(
        definition.bindingOrder[placeholder.ordinal - 1],
        placeholder.parameterBinding,
      );
      if (usedOrdinals.has(placeholder.ordinal)) {
        assert.ok(
          tokens.some(
            (match) =>
              Number(match[1]) === placeholder.ordinal &&
              match[2] === placeholder.postgresqlCast,
          ),
          `${definition.statementId}:${placeholder.placeholder}`,
        );
      }
    }
  }
});

test("INSERT, UPDATE, SELECT, and RETURNING shapes follow the contract", () => {
  const insert = definitions.statements[0].sql;
  assert.match(insert, /^INSERT INTO multi_cut_replay_records_v2 \(/);
  assert.match(insert, /\nON CONFLICT ON CONSTRAINT uq_multi_cut_replay_v2_authority DO NOTHING\n/);
  assert.match(insert, /\nRETURNING\n/);

  const lookup = definitions.statements.find(
    ({ statementId }) => statementId === "lookup-authoritative-replay",
  )?.sql;
  assert.match(lookup ?? "", /^SELECT\n/);
  assert.match(lookup ?? "", /\nFROM multi_cut_replay_records_v2\n/);
  assert.doesNotMatch(lookup ?? "", /\bUPDATE\b|\bINSERT\b/);

  for (const definition of definitions.statements.slice(1)) {
    if (definition.statementId === "lookup-authoritative-replay") continue;
    assert.match(definition.sql, /^UPDATE multi_cut_replay_records_v2\nSET\n/);
    assert.match(definition.sql, /\nWHERE\n/);
    assert.match(definition.sql, /\nRETURNING\n/);
  }
});

test("predicates, assignments, projections, and successors need no renderer inference", () => {
  for (const [index, statement] of contract.statements.entries()) {
    const sql = definitions.statements[index].sql;
    if (statement.statementId !== "resolve-new-reservation") {
      for (const predicate of statement.orderedPredicates) {
        assert.match(sql, new RegExp(`\\b${predicate.physicalField}\\s+${predicate.comparisonOperator.replace("=", "\\=")}\\s+`));
      }
    }
    for (const mutation of statement.mutations.filter(
      ({ action }) => action !== "retain",
    )) {
      if (statement.statementId !== "resolve-new-reservation") {
        assert.match(sql, new RegExp(`\\b${mutation.physicalField}\\s*=`));
      }
    }
    for (const field of statement.projections.find(
      ({ kind }) => kind === "select" || kind === "returning",
    )?.orderedFields ?? []) {
      assert.match(
        sql,
        new RegExp(`${field.physicalField}\\s+AS\\s+${field.canonicalAlias}`),
      );
    }
    for (const reference of Object.values(statement.successorReferences)) {
      if (statement.statementId === "resolve-new-reservation") continue;
      if (reference === "not-used" || reference.endsWith(":retain")) continue;
      const field = reference.split(":")[2];
      const authority = parameters.continuitySuccessors.find(
        ({ field: candidate }) => candidate === field,
      );
      assert.ok(authority);
      assert.ok(sql.includes(authority.checkedExpression), reference);
    }
  }
});

test("lease, reconciliation, retry, and logical-attempt metadata remain compatible", () => {
  for (const [index, statement] of contract.statements.entries()) {
    const definition = definitions.statements[index];
    assert.equal(definition.statementId, statement.statementId);
    assert.equal(definition.retryClass, statement.retryClass);
    assert.equal(definition.reconciliationClass, statement.reconciliationClass);
    assert.equal(
      definition.commitUnknown,
      statement.zeroRowContract.commitUnknown,
    );
    assert.equal(
      definition.logicalAttemptReuse,
      statement.zeroRowContract.logicalAttemptReuse,
    );
    assert.ok(
      statement.projections.some(({ purpose }) => purpose === "reconciliation"),
    );
  }
  const leaseStatements = definitions.statements.filter(({ statementId }) =>
    [
      "resolve-new-reservation",
      "resolve-existing-replay",
      "renew-processing-reservation",
      "takeover-stale-processing-replay",
    ].includes(statementId),
  );
  for (const statement of leaseStatements) {
    assert.match(statement.sql, /transaction_timestamp\(\)/);
  }
});

test("all rendered definitions are deeply immutable at the public boundary", () => {
  assert.ok(Object.isFrozen(definitions));
  assert.ok(Object.isFrozen(definitions.statements));
  assert.ok(Object.isFrozen(definitions.byStatementId));
  for (const statement of definitions.statements) {
    assert.ok(Object.isFrozen(statement));
    assert.ok(Object.isFrozen(statement.placeholders));
    assert.ok(Object.isFrozen(statement.bindingOrder));
  }
});
