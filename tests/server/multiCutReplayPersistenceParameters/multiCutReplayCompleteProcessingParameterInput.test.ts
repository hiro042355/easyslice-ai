import assert from "node:assert/strict";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2,
  MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2,
  createCompleteProcessingReplayParameterValues,
  validateMultiCutReplayCompleteProcessingParameterInput,
  type MultiCutReplayCompleteProcessingParameterInputV1,
} from "../../../lib/server/multiCutReplayPersistenceParameters";
import type { MultiCutReplayPostgresqlPureAdapterInput } from "../../../lib/server/multiCutReplayPostgresqlAdapter/pureTypes";

const createInput = (): MultiCutReplayCompleteProcessingParameterInputV1 =>
  Object.freeze({
    schemaVersion: "1.0",
    contractVersion: "1.0",
    statementId: "complete-processing-replay",
    bindingInventoryVersion: "2.0",
    parameterContractVersion: "2.0",
    bindings: Object.freeze({
      replay_identity: Object.freeze({
        physical_schema_version: "2.0",
        logical_schema_version: "2.0",
        identity_version: "2.0",
        scope_version: "1.0",
        replay_namespace: "multi-cut",
        tenant_identity_version: "1.0",
        protected_tenant_identity: "tenant-fixture",
        operation_identity: "operation-fixture",
        key_identity: "key-fixture",
      }),
      expected_revision: "7",
      expected_ownership_evidence: Object.freeze({
        reservation_identity: "reservation-fixture",
        lease_identity: "lease-fixture",
        reservation_attempt: 2,
      }),
      expected_fence: "11",
      result_reference_version: "1.0",
      result_reference_identity: "result-fixture",
      terminal_metadata_version: "1.0",
      terminal_at: "2026-08-02T00:00:00.000Z",
      terminal_classification: "workflow-completed",
    }),
  });

test("canonical inventory is complete-only and drives the typed binding keys", () => {
  assert.deepEqual(MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2, [
    "replay_identity",
    "expected_revision",
    "expected_ownership_evidence",
    "expected_fence",
    "result_reference_version",
    "result_reference_identity",
    "terminal_metadata_version",
    "terminal_at",
    "terminal_classification",
  ]);
  const authoritative =
    MULTI_CUT_REPLAY_PERSISTENCE_PARAMETER_CONTRACT_V2.statementBindings.find(
      ({ statementId }) => statementId === "complete-processing-replay",
    );
  assert.equal(authoritative?.inputBindings, MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2);
  assert.equal(new Set(MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2).size, 9);
});

test("validates and copy-isolates an exact complete parameter input", () => {
  const source = createInput();
  const result = validateMultiCutReplayCompleteProcessingParameterInput(source);
  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;
  assert.notEqual(result.value, source);
  assert.notEqual(result.value.bindings, source.bindings);
  assert.notEqual(result.value.bindings.replay_identity, source.bindings.replay_identity);
  assert.notEqual(
    result.value.bindings.expected_ownership_evidence,
    source.bindings.expected_ownership_evidence,
  );
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.bindings), true);
  assert.equal(Object.isFrozen(result.value.bindings.replay_identity), true);
});

test("rejects missing, extra, undefined, null, and wrong-type bindings", () => {
  const valid = createInput();
  const cases = [
    { ...valid.bindings, terminal_at: undefined },
    { ...valid.bindings, terminal_at: null },
    { ...valid.bindings, expected_revision: 7 },
    { ...valid.bindings, expected_revision: "01" },
    { ...valid.bindings, expected_fence: "1.5" },
    { ...valid.bindings, terminal_at: "2026-08-02 00:00:00" },
    {
      ...valid.bindings,
      expected_ownership_evidence: {
        ...valid.bindings.expected_ownership_evidence,
        reservation_attempt: Number.MAX_SAFE_INTEGER + 1,
      },
    },
    { ...valid.bindings, unrelated: "forbidden" },
    Object.fromEntries(
      Object.entries(valid.bindings).filter(([key]) => key !== "expected_fence"),
    ),
  ];
  for (const bindings of cases) {
    const result = validateMultiCutReplayCompleteProcessingParameterInput({
      ...valid,
      bindings,
    });
    assert.deepEqual(result, {
      resultVersion: "1.0",
      status: "invalid",
      reason: "invalid-binding-value",
    });
  }
});

test("accepts binding keys independently of object insertion order", () => {
  const valid = createInput();
  const reversedBindings = Object.fromEntries(
    Object.entries(valid.bindings).reverse(),
  );
  assert.equal(
    validateMultiCutReplayCompleteProcessingParameterInput({
      ...valid,
      bindings: reversedBindings,
    }).status,
    "valid",
  );
});

test("rejects arbitrary envelope metadata", () => {
  assert.deepEqual(
    validateMultiCutReplayCompleteProcessingParameterInput({
      ...createInput(),
      metadata: "forbidden",
    }),
    { resultVersion: "1.0", status: "invalid", reason: "invalid-input" },
  );
});

test("rejects non-complete and unsupported contract envelopes", () => {
  const valid = createInput();
  assert.equal(
    validateMultiCutReplayCompleteProcessingParameterInput({
      ...valid,
      statementId: "fail-processing-replay",
    }).status,
    "invalid",
  );
  assert.deepEqual(
    validateMultiCutReplayCompleteProcessingParameterInput({
      ...valid,
      bindingInventoryVersion: "3.0",
    }),
    {
      resultVersion: "1.0",
      status: "invalid",
      reason: "invalid-binding-inventory",
    },
  );
});

test("projects safely into the existing generic Core input without arrays or SQL metadata", () => {
  const source = createInput();
  const projected = createCompleteProcessingReplayParameterValues(source);
  const compatibleCoreInput: MultiCutReplayPostgresqlPureAdapterInput = projected;
  assert.deepEqual(Object.keys(projected).sort(), [
    "bindings",
    "inputVersion",
    "statementId",
  ]);
  assert.equal(projected.statementId, "complete-processing-replay");
  assert.equal(compatibleCoreInput.inputVersion, "1.0");
  assert.deepEqual(
    Object.keys(projected.bindings),
    MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2,
  );
  assert.equal("sql" in projected, false);
  assert.equal("values" in projected, false);
  assert.equal("casts" in projected, false);
  assert.equal("ordinals" in projected, false);
  assert.notEqual(projected.bindings, source.bindings);
});

test("projection refuses an invalid value even when a caller bypasses static typing", () => {
  const invalid = {
    ...createInput(),
    bindings: { ...createInput().bindings, terminal_at: undefined },
  } as unknown as MultiCutReplayCompleteProcessingParameterInputV1;
  assert.throws(
    () => createCompleteProcessingReplayParameterValues(invalid),
    /invalid-complete-processing-parameter-input:invalid-binding-value/,
  );
});
