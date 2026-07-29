import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2,
} from "../../../lib/server/multiCutReplayPersistenceParameters";

const contract = MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2;

test("contract contains every required CS-07.5 parameter", () => {
  const names = new Set(contract.parameters.map(({ name }) => name));
  for (const name of [
    "internal_record_id",
    "replay_identity",
    "fingerprint",
    "reservation_identity",
    "lease_identity",
    "initial_revision",
    "initial_fence",
    "initial_lease_expiry",
    "initial_reservation_attempt",
    "expected_revision",
    "expected_ownership_evidence",
    "next_revision",
    "expected_fence",
    "renewed_lease_expiry",
    "takeover_expected_revision",
    "takeover_next_revision",
    "takeover_expected_fence",
    "takeover_next_fence",
    "takeover_reservation_identity",
    "takeover_lease_identity",
    "takeover_lease_expiry",
    "takeover_reservation_attempt",
    "reconciliation_evidence",
  ]) {
    assert.equal(names.has(name as never), true, name);
  }
});

test("every parameter has one complete authority and SQL binding", () => {
  assert.equal(contract.contractVersion, "2.0");
  assert.equal(
    contract.authoritySource,
    "replay-concurrency-authority-and-generation-ownership-adr-v1",
  );

  const bindingNames = new Set<string>();
  for (const item of contract.parameters) {
    assert.ok(item.authority);
    assert.ok(item.generationOwner);
    assert.ok(item.validationOwner);
    assert.ok(item.persistenceOwner);
    assert.ok(item.sqlBindingName);
    assert.ok(item.retryBehavior);
    assert.ok(item.transactionVisibility);
    assert.ok(item.statementConsumers.length > 0);
    assert.equal(bindingNames.has(item.sqlBindingName), false, item.sqlBindingName);
    bindingNames.add(item.sqlBindingName);
  }
});

test("authoritative selector is complete and fingerprint is separate", () => {
  const identity = contract.parameters.find(
    ({ name }) => name === "replay_identity",
  );
  const fingerprint = contract.parameters.find(
    ({ name }) => name === "fingerprint",
  );

  assert.deepEqual(identity?.physicalBindings, [
    "physical_schema_version",
    "logical_schema_version",
    "identity_version",
    "scope_version",
    "replay_namespace",
    "tenant_identity_version",
    "protected_tenant_identity",
    "operation_identity",
    "key_identity",
  ]);
  assert.deepEqual(fingerprint?.physicalBindings, [
    "request_fingerprint_identity",
  ]);
  assert.equal(
    identity?.physicalBindings.includes("request_fingerprint_identity"),
    false,
  );
});

test("database-owned results are never predicted or supplied as inputs", () => {
  const generated = contract.parameters.filter(
    ({ generationInstruction }) =>
      generationInstruction === "database-generate-per-adr",
  );
  assert.ok(generated.length >= 8);
  for (const item of generated) {
    assert.equal(item.generationOwner, "postgresql");
    assert.equal(item.generationTiming, "within-statement");
    assert.equal(item.sqlDirection, "returning");
    assert.equal(
      item.transactionVisibility,
      "generated-and-returned-by-statement",
    );
    assert.equal(item.retryBehavior, "never-predict-reconcile-first");
  }
});

test("logical-attempt identities and policy inputs are reused on retry", () => {
  for (const name of [
    "internal_record_id",
    "replay_identity",
    "fingerprint",
    "reservation_identity",
    "lease_identity",
    "lease_duration",
    "takeover_lease_identity",
  ]) {
    const item = contract.parameters.find((candidate) => candidate.name === name);
    assert.equal(item?.sqlDirection, "input", name);
    assert.equal(item?.retryBehavior, "reuse-for-logical-attempt", name);
    assert.equal(item?.transactionVisibility, "known-before-statement", name);
  }
});

test("SQL readiness decisions are closed", () => {
  assert.deepEqual(contract.readiness, {
    sqlMayChooseAuthority: false,
    sqlMayChooseRetrySemantics: false,
    sqlMayChooseRevisionSemantics: false,
    sqlMayChooseFenceSemantics: false,
    runtimeMayPredictDatabaseValues: false,
  });
});

test("contract package has no SQL, Runtime, Adapter, Client, or database dependency", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayPersistenceParameters/contractV2.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+/i);
  assert.doesNotMatch(
    source,
    /(?:from\s+["'][^"']*(?:Runtime|Adapter|Executor|Client)|node:pg|from\s+["']pg["']|query\s*\(|execute\s*\()/,
  );
});
