import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2,
} from "../../../lib/server/multiCutReplayPersistenceParameters";
import {
  MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2,
} from "../../../lib/server/multiCutReplayPhysicalSchema/physicalSchemaV2";

const contract = MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2;

test("contract contains every required CS-07.6 parameter", () => {
  const names = new Set(contract.parameters.map(({ name }) => name));
  for (const name of [
    "internal_record_id",
    "replay_identity",
    "fingerprint",
    "reservation_identity",
    "lease_identity",
    "lease_duration",
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
    "result_reference_version",
    "result_reference_identity",
    "terminal_metadata_version",
    "terminal_timestamp",
    "terminal_classification",
    "reconciliation_evidence",
  ]) {
    assert.equal(names.has(name as never), true, name);
  }
});

test("every parameter has one complete authority and SQL binding", () => {
  assert.equal(contract.contractVersion, "2.0");
  assert.deepEqual(
    contract.authoritySources,
    [
      "replay-identity-authority-and-contract-versioning-adr-v1",
      "replay-concurrency-authority-and-generation-ownership-adr-v1",
      "replay-lease-and-attempt-persistence-policy-adr-v1",
      "replay-terminal-boundary-concurrency-continuity-adr-v1",
      "shared-identity-schema-v2",
      "replay-contracts-v4",
      "logical-schema-v2",
      "physical-schema-v2",
      "replay-persistence-statement-catalog",
    ],
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

test("persistent continuity bindings exactly match Physical Schema V2", () => {
  assert.deepEqual(
    contract.physicalContinuityBindings.map(({ physicalColumn }) => physicalColumn),
    ["revision", "last_fencing_token", "last_reservation_attempt"],
  );
  const physicalColumns = new Map(
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map((column) => [
      column.name,
      column,
    ]),
  );
  for (const binding of contract.physicalContinuityBindings) {
    const physical = physicalColumns.get(binding.physicalColumn);
    assert.equal(binding.postgresqlType, physical?.type, binding.physicalColumn);
    assert.equal(binding.nullable, physical?.nullable, binding.physicalColumn);
    assert.equal(binding.generationOwner, "postgresql", binding.physicalColumn);
    assert.equal(
      binding.retryReuseRule,
      "retain-expectation-never-predict-successor",
      binding.physicalColumn,
    );
  }
});

test("continuity successors are exact, overflow-safe, and authoritative", () => {
  assert.deepEqual(
    contract.continuitySuccessors.map(({ sourcePhysicalField }) => sourcePhysicalField),
    ["revision", "last_fencing_token", "last_reservation_attempt"],
  );
  for (const successor of contract.continuitySuccessors) {
    assert.equal(successor.progression, "exactly-one-successor");
    assert.equal(successor.generationAuthority, "postgresql");
    assert.equal(
      successor.overflowClassification,
      "dependency-internal-failure",
    );
    assert.equal(
      successor.retryClassification,
      "non-retryable-with-same-record-state",
    );
    assert.equal(successor.transactionBehavior, "rollback-without-row-mutation");
    assert.equal(
      successor.reconciliationBehavior,
      "authoritative-lookup-before-any-retry",
    );
    assert.ok(successor.checkedExpression.length > 0);
  }
});

test("initial reservation uses one canonical continuity order and source", () => {
  assert.deepEqual(contract.initialContinuity.canonicalOrder, [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ]);
  assert.deepEqual(
    contract.initialContinuity.fields.map(({ physicalField }) => physicalField),
    [
      "revision",
      "last_fencing_token",
      "last_reservation_attempt",
      "fencing_token",
      "reservation_attempt",
    ],
  );
  for (const field of contract.initialContinuity.fields) {
    assert.equal(field.sourceKind, "fixed-literal");
    assert.equal(field.value, "1");
    assert.equal(field.generationOwner, "postgresql");
  }
});

test("released re-reservation is complete without inventing quarantine SQL", () => {
  const semantics = contract.releasedRereservation;
  assert.equal(semantics.statementId, "resolve-existing-replay");
  for (const predicate of [
    "state=released",
    "revision=expected_revision",
    "last_fencing_token=expected_last_fencing_token",
    "last_reservation_attempt=expected_last_reservation_attempt",
  ]) {
    assert.ok(semantics.orderedPredicates.includes(predicate), predicate);
  }
  assert.equal(
    semantics.quarantinePolicy,
    "migration-eligibility-note-not-sql-predicate",
  );
  for (const field of [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
    "fencing_token",
    "reservation_attempt",
    "lease_identity",
    "lease_expires_at",
  ]) {
    assert.ok(semantics.mutation.update.includes(field), field);
    assert.ok(semantics.returningBindings.includes(field), field);
  }
  for (const immutable of [
    "internal_record_id",
    "key_identity",
    "request_fingerprint_identity",
  ]) {
    assert.ok(semantics.mutation.preserve.includes(immutable), immutable);
    assert.equal(semantics.mutation.update.includes(immutable), false, immutable);
  }
  assert.equal(semantics.zeroRow.classification, "ambiguous-concurrency-miss");
  assert.equal(
    semantics.zeroRow.nextAction,
    "authoritative-lookup-and-reconciliation",
  );
  assert.deepEqual(semantics.cardinality, {
    successRows: 1,
    zeroRowsAllowed: true,
    multipleRows: "invariant-violation",
    uniquenessDependency: "authoritative-protected-scope-and-key",
    commitUnknown: "authoritative-reconciliation-required",
  });
});

test("renew, terminal, and takeover semantics preserve the authority split", () => {
  const byId = new Map(
    contract.statementSemantics.map((statement) => [
      statement.statementId,
      statement,
    ]),
  );
  const renew = byId.get("renew-processing-reservation");
  assert.deepEqual(renew?.persistentContinuity.advance, ["revision"]);
  assert.deepEqual(renew?.persistentContinuity.retain, [
    "last_fencing_token",
    "last_reservation_attempt",
  ]);
  assert.deepEqual(renew?.activeProcessingEvidence.replace, ["lease_expires_at"]);
  assert.ok(renew?.activeProcessingEvidence.retain.includes("fencing_token"));

  for (const id of [
    "complete-processing-replay",
    "fail-processing-replay",
    "release-processing-replay",
  ] as const) {
    const terminal = byId.get(id);
    assert.deepEqual(terminal?.persistentContinuity.advance, ["revision"], id);
    assert.ok(
      terminal?.activeProcessingEvidence.clear.includes("fencing_token"),
      id,
    );
    assert.ok(
      terminal?.activeProcessingEvidence.clear.includes("reservation_attempt"),
      id,
    );
  }

  const takeover = byId.get("takeover-stale-processing-replay");
  assert.deepEqual(takeover?.persistentContinuity.advance, [
    "revision",
    "last_fencing_token",
    "last_reservation_attempt",
  ]);
  assert.ok(takeover?.activeProcessingEvidence.replace.includes("lease_identity"));
  assert.ok(takeover?.activeProcessingEvidence.replace.includes("fencing_token"));
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
    sqlMayChooseAttemptSemantics: false,
    sqlMayChooseDurationSemantics: false,
    sqlMayChooseClockExpression: false,
    sqlMayChooseExpiryExpression: false,
    sqlMayChooseStaleBoundary: false,
    runtimeMayPredictDatabaseValues: false,
  });
});

test("attempt policy is complete and preserves independent evidence semantics", () => {
  assert.deepEqual(contract.attemptPolicy, {
    initialValue: 1,
    postgresqlType: "integer",
    minimum: 1,
    maximum: 2147483647,
    progression: "advance-by-one-on-successful-ownership-replacement-only",
    renewalBehavior: "preserve",
    terminalTransitionBehavior: "no-successor",
    overflowBehavior: "reject-mutation",
  });

  const initial = contract.postgresqlExpressions.find(
    ({ name }) => name === "initial-reservation-attempt",
  );
  const takeover = contract.postgresqlExpressions.find(
    ({ name }) => name === "takeover-reservation-attempt",
  );
  assert.equal(initial?.expression, "1::integer");
  assert.equal(
    takeover?.expression,
    "(last_reservation_attempt::bigint + 1)::integer",
  );
});

test("lease duration, database clock, expiry, and stale boundary require no inference", () => {
  assert.deepEqual(contract.leaseDurationPolicy, {
    policyVersion: "1.0",
    logicalType: "lease-duration-milliseconds-v1",
    canonicalUnit: "milliseconds",
    typescriptType: "finite-safe-integer-number",
    postgresqlType: "bigint",
    sqlBindingName: "lease_duration_milliseconds",
    minimumInclusive: 1,
    maximumInclusive: 86400000,
    zeroAllowed: false,
    negativeAllowed: false,
    fractionalAllowed: false,
    persistence: "not-persisted",
    serialization: "canonical-base-10-integer",
  });
  assert.deepEqual(contract.databaseClockPolicy, {
    authority: "postgresql",
    expression: "transaction_timestamp()",
    outputType: "timestamp-with-time-zone",
    stability: "transaction-stable",
    applicationClockAllowed: false,
  });
  assert.deepEqual(contract.staleLeasePolicy, {
    comparisonOperator: "<=",
    staleExpression: "lease_expires_at <= transaction_timestamp()",
    renewableExpression: "lease_expires_at > transaction_timestamp()",
    expiryInstantIsStale: true,
    nullExpiryEligible: false,
    nonProcessingStateEligible: false,
  });

  const expiry = contract.postgresqlExpressions.filter(({ name }) =>
    name.endsWith("-lease-expiry"),
  );
  assert.equal(expiry.length, 3);
  for (const item of expiry) {
    assert.equal(
      item.expression,
      "transaction_timestamp() + ($lease_duration_milliseconds::bigint * INTERVAL '1 millisecond')",
    );
    assert.deepEqual(item.requiredBindings, [
      "lease_duration_milliseconds",
    ]);
  }
});

test("result reference and terminal metadata have explicit physical bindings", () => {
  const expected = {
    result_reference_version: ["result_reference_version"],
    result_reference_identity: ["result_reference_identity"],
    terminal_metadata_version: ["terminal_metadata_version"],
    terminal_timestamp: ["terminal_at"],
    terminal_classification: ["terminal_classification"],
  } as const;

  for (const [name, physicalBindings] of Object.entries(expected)) {
    const item = contract.parameters.find((candidate) => candidate.name === name);
    assert.deepEqual(item?.physicalBindings, physicalBindings, name);
    assert.equal(item?.sqlDirection, "input", name);
    assert.equal(item?.transactionVisibility, "known-before-statement", name);
    assert.equal(item?.retryBehavior, "reuse-for-logical-attempt", name);
  }
});

test("all eight statements have complete input, returning, visibility, and retry metadata", () => {
  const expectedStatements = [
    "resolve-new-reservation",
    "resolve-existing-replay",
    "lookup-authoritative-replay",
    "renew-processing-reservation",
    "complete-processing-replay",
    "fail-processing-replay",
    "release-processing-replay",
    "takeover-stale-processing-replay",
  ];
  assert.deepEqual(
    contract.statementBindings.map(({ statementId }) => statementId),
    expectedStatements,
  );

  for (const statement of contract.statementBindings) {
    assert.ok(statement.inputBindings.length > 0, statement.statementId);
    assert.ok(statement.returningBindings.length > 0, statement.statementId);
    assert.ok(statement.transactionVisibility, statement.statementId);
    assert.ok(statement.retryRule, statement.statementId);
    assert.equal(statement.cardinality.successRows, 1, statement.statementId);
    assert.equal(
      statement.cardinality.zeroRowsAllowed,
      true,
      statement.statementId,
    );
    assert.equal(
      statement.cardinality.multipleRows,
      "invariant-violation",
      statement.statementId,
    );
    assert.equal(
      statement.cardinality.uniquenessDependency,
      "authoritative-protected-scope-and-key",
      statement.statementId,
    );
  }

  const completion = contract.statementBindings.find(
    ({ statementId }) => statementId === "complete-processing-replay",
  );
  assert.deepEqual(
    completion?.returningBindings,
    [
      "next_revision",
      "result_reference_version",
      "result_reference_identity",
      "terminal_metadata_version",
      "terminal_at",
      "terminal_classification",
    ],
  );
});

test("every persisted parameter binding is compatible with Physical Schema V2", () => {
  const columns = new Set(
    MULTI_CUT_REPLAY_PHYSICAL_SCHEMA_V2.table.columns.map(({ name }) => name),
  );
  for (const parameter of contract.parameters) {
    for (const binding of parameter.physicalBindings) {
      assert.equal(columns.has(binding), true, `${parameter.name}:${binding}`);
    }
  }
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
