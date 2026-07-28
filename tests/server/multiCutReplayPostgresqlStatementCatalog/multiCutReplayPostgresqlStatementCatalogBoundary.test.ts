import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";
import type {
  MultiCutReplayPostgresqlStatementCatalogEntry,
  MultiCutReplayPostgresqlStatementId,
} from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/types";

const expectedIds = [
  "resolve-new-reservation",
  "resolve-existing-replay",
  "lookup-authoritative-replay",
  "renew-processing-reservation",
  "complete-processing-replay",
  "fail-processing-replay",
  "release-processing-replay",
  "takeover-stale-processing-replay",
] as const;

test("catalog exports exactly eight stable statement identifiers", () => {
  assert.deepEqual(MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS, expectedIds);
  assert.equal(MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS.length, 8);
  assert.equal(new Set(MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS).size, 8);
});

test("catalog completely and immutably covers every identifier", () => {
  const catalogKeys = Object.keys(
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG,
  ).sort();
  assert.deepEqual(catalogKeys, [...expectedIds].sort());
  assert.equal(catalogKeys.length, 8);
  assert.equal(Object.isFrozen(MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG), true);

  for (const statementId of MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS) {
    const entry = MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[statementId];
    assert.equal(entry.statementId, statementId);
    assert.equal(Object.isFrozen(entry), true);
  }
});

test("catalog preserves statement architecture invariants", () => {
  const catalog = MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG;

  assert.deepEqual(
    {
      owner: catalog["resolve-new-reservation"].capabilityOwner,
      access: catalog["resolve-new-reservation"].accessMode,
      mutation: catalog["resolve-new-reservation"].mutationClassification,
    },
    {
      owner: "resolution",
      access: "write",
      mutation: "reservation-create",
    },
  );
  assert.equal(
    catalog["resolve-existing-replay"].accessMode,
    "write",
  );
  assert.equal(
    catalog["lookup-authoritative-replay"].mutationClassification,
    "none",
  );
  assert.equal(
    catalog["renew-processing-reservation"].mutationClassification,
    "reservation-refresh",
  );
  assert.equal(
    catalog["renew-processing-reservation"].reconciliationRequirement,
    "reservation-mutation",
  );
  assert.equal(
    catalog["complete-processing-replay"].transactionRequirement,
    "workflow-completion-transaction",
  );
  assert.equal(
    catalog["complete-processing-replay"].commitUnknownStrategy,
    "workflow-completion-recovery",
  );
  assert.equal(
    catalog["complete-processing-replay"].reconciliationRequirement,
    "none",
  );
  assert.equal(
    catalog["fail-processing-replay"].mutationClassification,
    "terminal-transition",
  );
  assert.equal(
    catalog["release-processing-replay"].mutationClassification,
    "terminal-transition",
  );
  assert.equal(
    catalog["takeover-stale-processing-replay"].mutationClassification,
    "ownership-takeover",
  );
  assert.equal(
    catalog["takeover-stale-processing-replay"].reconciliationRequirement,
    "reservation-mutation",
  );

  const terminalTransitions = Object.values(catalog)
    .filter((entry) => entry.mutationClassification === "terminal-transition")
    .map((entry) => entry.operationKind)
    .sort();
  assert.deepEqual(terminalTransitions, ["complete", "fail", "release"]);
});

test("typed lookup needs no undefined widening and supports exhaustive dispatch", () => {
  const lookup = (
    statementId: MultiCutReplayPostgresqlStatementId,
  ): MultiCutReplayPostgresqlStatementCatalogEntry =>
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_CATALOG[statementId];

  const dispatch = (statementId: MultiCutReplayPostgresqlStatementId): string => {
    switch (statementId) {
      case "resolve-new-reservation":
      case "resolve-existing-replay":
      case "lookup-authoritative-replay":
      case "renew-processing-reservation":
      case "complete-processing-replay":
      case "fail-processing-replay":
      case "release-processing-replay":
      case "takeover-stale-processing-replay":
        return lookup(statementId).operationKind;
      default: {
        const exhaustive: never = statementId;
        return exhaustive;
      }
    }
  };

  for (const statementId of MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS) {
    assert.equal(typeof dispatch(statementId), "string");
  }
});

test("catalog package contains static metadata only and no infrastructure", async () => {
  const [typesSource, catalogSource] = await Promise.all([
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/types.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const source = `${typesSource}\n${catalogSource}`;

  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|filesystem|node:fs|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|console\.|database|transaction function|query builder)/i,
  );
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|RETURNING|ROLLBACK)\b|ON\s+CONFLICT|\$\d+|::[a-z]/,
  );
  assert.doesNotMatch(
    source,
    /(?:multiCutRequestAdmission|multiCutReplayLifecycle|multiCutReplayShared)/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:function|class|new\s+Map|new\s+Set)\b/,
  );
  assert.match(catalogSource, /import\s+type\s*\{/);
  assert.doesNotMatch(catalogSource, /import\s+(?!type\b)/);
});
