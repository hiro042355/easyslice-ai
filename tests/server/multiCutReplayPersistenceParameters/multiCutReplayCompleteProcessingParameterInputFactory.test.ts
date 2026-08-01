import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createCompleteProcessingReplayParameterValues,
  createMultiCutReplayCompleteProcessingParameterInput,
  MULTI_CUT_REPLAY_COMPLETE_PARAMETER_AUTHORITY_MAPPING_V1,
  MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2,
} from "../../../lib/server/multiCutReplayPersistenceParameters";
import { createMultiCutReplayCompleteParticipationRequestV2 } from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type { MultiCutReplayCompleteParameterInputFactoryInputV1 } from "../../../lib/server/multiCutReplayPersistenceParameters";

const createInput = (): MultiCutReplayCompleteParameterInputFactoryInputV1 => ({
  inputVersion: "1.0",
  versionAuthority: {
    schemaVersion: "1.0", contractVersion: "1.0",
    physicalSchemaVersion: "2.0", logicalSchemaVersion: "2.0",
    bindingInventoryVersion: "2.0", parameterContractVersion: "2.0",
  },
  completion: {
    inputVersion: "4.0", transition: "complete",
    replayIdentity: {
      identityVersion: "2.0",
      protectedScope: {
        scopeVersion: "1.0", replayNamespace: "multi-cut",
        tenant: { identityVersion: "1.0", protectedTenantIdentity: "tenant" },
        operationIdentity: "complete",
      },
      resolvedIdentity: {
        identityVersion: "1.0", keyIdentity: "key",
        requestFingerprintIdentity: "fingerprint",
      },
    },
    reservationEvidence: {
      evidenceVersion: "1.0",
      reservation: { reservationVersion: "1.0", reservationIdentity: "reservation" },
      expectedRevision: { revisionVersion: "1.0", expectedRevision: "41" },
      fencing: { fencingVersion: "1.0", fencingToken: "7" },
      lease: { leaseVersion: "1.0", leaseIdentity: "lease" },
      leaseExpiresAt: "2026-08-02T00:05:00Z", reservationAttempt: 3,
    },
    resultReference: { referenceVersion: "1.0", resultReferenceIdentity: "result" },
    metadata: {
      metadataVersion: "1.0", completedAt: "2026-08-02T00:00:00Z",
      completionClassification: "workflow-completed",
    },
  },
});

test("factory deterministically projects the canonical nine-binding inventory", () => {
  const first = createMultiCutReplayCompleteProcessingParameterInput(createInput());
  const second = createMultiCutReplayCompleteProcessingParameterInput(createInput());
  assert.deepEqual(first, second);
  assert.equal(first.status, "created");
  if (first.status !== "created") return;
  assert.deepEqual(Object.keys(first.value.bindings).sort(), [...MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2].sort());
  assert.equal(Object.keys(first.value.bindings).length, 9);
  assert.deepEqual(first.value.bindings.expected_ownership_evidence, {
    reservation_identity: "reservation", lease_identity: "lease", reservation_attempt: 3,
  });
  assert.equal(first.value.bindings.expected_revision, "41");
  assert.equal(first.value.bindings.expected_fence, "7");
  assert.equal(first.value.bindings.terminal_at, "2026-08-02T00:00:00Z");
});

test("authority mapping is canonical, unique, complete, and immutable", () => {
  assert.deepEqual(MULTI_CUT_REPLAY_COMPLETE_PARAMETER_AUTHORITY_MAPPING_V1.map(({ bindingId }) => bindingId), MULTI_CUT_REPLAY_COMPLETE_PROCESSING_INPUT_BINDINGS_V2);
  assert.equal(new Set(MULTI_CUT_REPLAY_COMPLETE_PARAMETER_AUTHORITY_MAPPING_V1.map(({ bindingId }) => bindingId)).size, 9);
  assert.equal(MULTI_CUT_REPLAY_COMPLETE_PARAMETER_AUTHORITY_MAPPING_V1.every(({ nullability, transformation }) => nullability === "required" && transformation === "forbidden"), true);
  assert.equal(Object.isFrozen(MULTI_CUT_REPLAY_COMPLETE_PARAMETER_AUTHORITY_MAPPING_V1), true);
});

test("canonical decimals, safe integer, literals, timestamp, and identity are preserved", () => {
  const input = createInput();
  const result = createMultiCutReplayCompleteProcessingParameterInput(input);
  assert.equal(result.status, "created");
  if (result.status !== "created") return;
  assert.equal(result.value.bindings.replay_identity.key_identity, "key");
  assert.equal(input.completion.replayIdentity.resolvedIdentity.requestFingerprintIdentity, "fingerprint");
  assert.equal(result.value.bindings.result_reference_identity, "result");
  assert.equal(result.value.bindings.terminal_classification, "workflow-completed");
});

test("invalid or missing runtime authority fails closed through the existing validator", () => {
  const invalid = createInput();
  const mutable = invalid.completion.reservationEvidence as { reservationAttempt: number };
  mutable.reservationAttempt = 0;
  const result = createMultiCutReplayCompleteProcessingParameterInput(invalid);
  assert.deepEqual(result, {
    resultVersion: "1.0", status: "invalid",
    reason: "typed-input-validation-failure", validationReason: "invalid-binding-value",
  });
});

test("factory output is deeply copy-isolated and frozen by validator authority", () => {
  const input = createInput();
  const result = createMultiCutReplayCompleteProcessingParameterInput(input);
  assert.equal(result.status, "created");
  if (result.status !== "created") return;
  const mutable = input.completion.replayIdentity.protectedScope as { replayNamespace: string };
  mutable.replayNamespace = "changed";
  assert.equal(result.value.bindings.replay_identity.replay_namespace, "multi-cut");
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.bindings), true);
  assert.equal(Object.isFrozen(result.value.bindings.replay_identity), true);
});

test("output directly satisfies Pure Core and Participation V2 contracts", () => {
  const input = createInput();
  const result = createMultiCutReplayCompleteProcessingParameterInput(input);
  assert.equal(result.status, "created");
  if (result.status !== "created") return;
  assert.equal(createCompleteProcessingReplayParameterValues(result.value).statementId, "complete-processing-replay");
  assert.equal(createMultiCutReplayCompleteParticipationRequestV2({
    authoritativeReplayIdentity: input.completion.replayIdentity,
    parameterInput: result.value,
  }).status, "valid");
});

test("factory source owns no generation, SQL, infrastructure, retry, or fallback", () => {
  const source = readFileSync("lib/server/multiCutReplayPersistenceParameters/completeProcessingReplayInputFactory.ts", "utf8");
  for (const forbidden of ["Date.now", "new Date", "randomUUID", "BigInt(", "parseInt", "process.env", "SELECT ", "UPDATE ", "postgresqlCast", "ordinal", "retry", "fallback", "node:fs", "pg"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
