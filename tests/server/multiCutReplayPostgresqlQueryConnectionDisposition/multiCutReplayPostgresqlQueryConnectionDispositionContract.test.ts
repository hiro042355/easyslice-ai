import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_PRODUCTION_BRIDGE_CONTRACT,
} from "../../../lib/server/multiCutReplayPostgresqlProductionBridgeContract";
import type {
  MultiCutReplayPostgresqlDriverError,
  MultiCutReplayPostgresqlDriverFailure,
} from "../../../lib/server/multiCutReplayPostgresqlDriver";
import type {
  PostgreSQLExecutionFailure,
  PostgreSQLQueryConnectionDisposition,
} from "../../../lib/server/productionWorkflowRuntime/postgresqlDriver";

const values = Object.freeze([
  "safe-to-reuse",
  "must-rollback-before-reuse",
  "must-discard",
  "unknown",
] as const satisfies readonly PostgreSQLQueryConnectionDisposition[]);

test("Production PostgreSQL Driver is the sole disposition authority", () => {
  const projection =
    MULTI_CUT_REPLAY_PRODUCTION_BRIDGE_CONTRACT.queryConnectionDisposition;
  assert.equal(projection.authorityOwner, "production-postgresql-driver");
  assert.deepEqual(projection.values, values);
  assert.equal(projection.projection, "direct");
  assert.equal(projection.inference, "forbidden");
  assert.equal(projection.overwrite, "forbidden");
  assert.equal(projection.queryFailureOnly, true);
  assert.equal(projection.commitUnknownIncluded, false);
});

test("all fixed values project identically through Driver, Bridge, and Replay Driver types", () => {
  for (const disposition of values) {
    const diagnostic: PostgreSQLExecutionFailure = Object.freeze({
      status: "failure",
      issue: "unknown-failure",
      diagnostic: Object.freeze({
        stage: "query",
        issue: "unknown-failure",
        retryable: false,
        queryConnectionDisposition: disposition,
      }),
    });
    const bridge: MultiCutReplayPostgresqlDriverError = Object.freeze({
      errorVersion: "1.0",
      kind: "query-rejected",
      safeReason: "safe-query-failure",
      queryConnectionDisposition:
        diagnostic.diagnostic.queryConnectionDisposition,
    });
    const replay: MultiCutReplayPostgresqlDriverFailure = Object.freeze({
      failureVersion: "1.0",
      classification: "execution-failure",
      retryClassification: "non-retryable",
      safeReason: bridge.safeReason,
      queryConnectionDisposition: bridge.queryConnectionDisposition,
    });
    assert.equal(replay.queryConnectionDisposition, disposition);
  }
});

test("optional addition preserves legacy failures and unknown is never inferred", () => {
  const legacy: MultiCutReplayPostgresqlDriverFailure = Object.freeze({
    failureVersion: "1.0",
    classification: "execution-failure",
    retryClassification: "non-retryable",
    safeReason: "legacy-safe-reason",
  });
  assert.equal("queryConnectionDisposition" in legacy, false);

  const unknown: MultiCutReplayPostgresqlDriverFailure = Object.freeze({
    ...legacy,
    queryConnectionDisposition: "unknown",
  });
  assert.equal(unknown.queryConnectionDisposition, "unknown");
  assert.equal(
    MULTI_CUT_REPLAY_PRODUCTION_BRIDGE_CONTRACT
      .queryConnectionDisposition.compatibility,
    "optional-field-addition",
  );
});

test("contract sources add no inference, transaction action, or commit-unknown disposition", () => {
  const sources = [
    "lib/server/productionWorkflowRuntime/postgresqlDriver/types.ts",
    "lib/server/multiCutReplayPostgresqlDriver/types.ts",
    "lib/server/multiCutReplayPostgresqlProductionBridgeContract/types.ts",
    "lib/server/multiCutReplayPostgresqlProductionBridgeContract/contract.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  for (const forbidden of [
    "queryConnectionDisposition: \"commit-unknown\"",
    "queryConnectionDisposition: \"reusable\"",
    "queryConnectionDisposition: \"discard-required\"",
    "from \"pg\"",
    " as any",
    "unknown as",
  ]) assert.equal(sources.includes(forbidden), false, forbidden);

  const projectionSources = [
    "lib/server/multiCutReplayPostgresqlProductionBridgeContract/types.ts",
    "lib/server/multiCutReplayPostgresqlProductionBridgeContract/contract.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  for (const forbidden of [
    "client.query(", "begin()", "commit()", "rollback()", "release()",
    "discard()",
  ]) assert.equal(projectionSources.includes(forbidden), false, forbidden);
});
