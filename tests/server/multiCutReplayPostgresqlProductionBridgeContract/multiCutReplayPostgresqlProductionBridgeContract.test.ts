import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MULTI_CUT_REPLAY_PRODUCTION_BRIDGE_CONTRACT as contract } from "../../../lib/server/multiCutReplayPostgresqlProductionBridgeContract";

test("command and zero-row ownership are unique and inference-free", () => {
  assert.deepEqual(contract.command, {
    owner: "pg-query-result",
    productionSource: "PostgreSQLQueryResult.command",
    replayTarget: "MultiCutReplayPostgresqlFakeClientResult.command",
    projection: "direct",
    inference: "forbidden",
  });
  assert.equal(contract.zeroRow.owner, "multi-cut-replay-postgresql-pure-adapter");
  assert.equal(contract.zeroRow.driverExpectedResult, "many");
  assert.deepEqual(contract.zeroRow.preservedCardinalities, [0, 1, "multiple"]);
});

test("parameter matrix covers every SQL Definition cast exactly once", () => {
  assert.deepEqual(
    contract.parameters.map(({ cast }) => cast).sort(),
    ["bigint", "integer", "text", "timestamptz", "uuid"],
  );
  for (const projection of contract.parameters) {
    assert.equal(projection.nullable, false);
    assert.equal(projection.invalidInput, "fail-closed-before-query");
    assert.equal(projection.precision, "exact");
  }
});

test("result projection preserves transport fields without domain mapping", () => {
  assert.deepEqual(contract.result.fields, ["rows", "rowCount", "command"]);
  assert.equal(contract.result.command, "direct");
  assert.equal(contract.result.null, "preserve");
  assert.equal(contract.result.undefined, "fail-closed");
  assert.equal(contract.result.domainMapping, "forbidden");
});

test("failure matrix covers every Production Driver issue and boundary failure", () => {
  const expected = [
    "invalid-request", "query-cancelled", "timeout", "connection-unavailable",
    "schema-mismatch", "constraint-conflict", "retryable-conflict",
    "read-only", "insufficient-privilege", "unknown-failure", "disposed",
    "commit-outcome-unknown", "non-postgresql-thrown-value",
  ];
  assert.deepEqual(contract.failures.map(({ source }) => source), expected);
  assert.equal(new Set(expected).size, contract.failures.length);
  assert.equal(
    contract.failures.find(({ source }) => source === "retryable-conflict")
      ?.retryable,
    true,
  );
  const unknown = contract.failures.find(
    ({ source }) => source === "commit-outcome-unknown",
  );
  assert.equal(unknown?.target, "commit-outcome-unknown");
  assert.equal(unknown?.commitUnknown, true);
  assert.equal(unknown?.reconciliation, "required");
});

test("connection matrix covers lifecycle states and unsafe discard", () => {
  assert.deepEqual(
    contract.connections.map(({ state }) => state),
    [
      "acquired", "transaction-open", "committed", "rolled-back",
      "commit-unknown", "discarded", "released",
    ],
  );
  const unknown = contract.connections.find(
    ({ state }) => state === "commit-unknown",
  );
  assert.equal(unknown?.discard, "required");
  assert.equal(unknown?.release, "idempotent-no-op");
  assert.equal(unknown?.underlyingAction, "destroy-connection");
});

test("dependency direction is one-way and the package contains no bridge", async () => {
  assert.deepEqual(contract.dependencyDirection.bridgeDependsOn, [
    "multi-cut-replay-postgresql-driver-types",
    "production-postgresql-driver-types",
  ]);
  const source = await readFile(
    "lib/server/multiCutReplayPostgresqlProductionBridgeContract/contract.ts",
    "utf8",
  );
  for (const forbidden of [
    "createMultiCutReplayPostgresqlDriverConnectionProvider",
    "PostgreSQLConnectionPoolAdapter",
    "async execute",
    "client.query",
    "from \"pg\"",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
