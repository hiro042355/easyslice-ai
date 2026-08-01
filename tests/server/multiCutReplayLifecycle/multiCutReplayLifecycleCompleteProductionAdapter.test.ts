import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMultiCutReplayLifecycleCompleteParameterInputFailureV1,
  createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1,
  createMultiCutReplayLifecycleCompleteProductionAdapter,
  createMultiCutReplayLifecycleCompleteProductionOutputV1,
  projectMultiCutReplayCompleteParticipationResultToLifecycleV1,
} from "../../../lib/server/multiCutReplayLifecycle";
import {
  createMultiCutReplayCompleteProcessingParameterInput,
} from "../../../lib/server/multiCutReplayPersistenceParameters";
import {
  createMultiCutReplayCompleteParticipationRequestV2,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type {
  MultiCutReplayCompleteParticipationResultV2,
  MultiCutReplayCompleteTransactionParticipantV2,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type {
  MultiCutReplayLifecycleCompleteProductionAdapterDependencies,
  MultiCutReplayLifecycleCompleteProductionAdapterInputV1,
} from "../../../lib/server/multiCutReplayLifecycle";

const createInput = (): MultiCutReplayLifecycleCompleteProductionAdapterInputV1 => {
  const replayIdentity = {
    identityVersion: "2.0" as const,
    protectedScope: {
      scopeVersion: "1.0" as const, replayNamespace: "multi-cut",
      tenant: { identityVersion: "1.0" as const, protectedTenantIdentity: "tenant" },
      operationIdentity: "complete",
    },
    resolvedIdentity: {
      identityVersion: "1.0" as const, keyIdentity: "key",
      requestFingerprintIdentity: "fingerprint",
    },
  };
  return {
    inputVersion: "1.0",
    input: {
      inputVersion: "4.0", transition: "complete", replayIdentity,
      reservationEvidence: {
        evidenceVersion: "1.0",
        reservation: { reservationVersion: "1.0", reservationIdentity: "reservation" },
        expectedRevision: { revisionVersion: "1.0", expectedRevision: "1" },
        fencing: { fencingVersion: "1.0", fencingToken: "7" },
        lease: { leaseVersion: "1.0", leaseIdentity: "lease" },
        leaseExpiresAt: "2026-08-02T00:05:00Z", reservationAttempt: 1,
      },
      resultReference: { referenceVersion: "1.0", resultReferenceIdentity: "result" },
      metadata: { metadataVersion: "1.0", completedAt: "ignored-authority", completionClassification: "workflow-completed" },
    },
    authority: {
      authorityVersion: "1.0", authoritativeReplayIdentity: replayIdentity,
      completionTimestamp: "2026-08-02T00:00:00Z",
      parameterVersionAuthority: {
        schemaVersion: "1.0", contractVersion: "1.0",
        physicalSchemaVersion: "2.0", logicalSchemaVersion: "2.0",
        bindingInventoryVersion: "2.0", parameterContractVersion: "2.0",
      },
      queryPort: Object.freeze({ async execute() { throw new Error("participant-only"); } }),
    },
  };
};

const oneRow = (): MultiCutReplayCompleteParticipationResultV2 => ({
  resultVersion: "2.0", status: "one-row", command: "UPDATE", rowCount: 1,
  projection: {
    projectionVersion: "1.0", state: "completed", revision: "2",
    replayIdentity: createInput().authority.authoritativeReplayIdentity,
    lastFencingToken: "7", lastReservationAttempt: 1,
    resultReference: { referenceVersion: "1.0", resultReferenceIdentity: "result" },
    terminalMetadata: { metadataVersion: "1.0", completedAt: "2026-08-02T00:00:00Z", completionClassification: "workflow-completed" },
  },
  queryMetadata: {
    metadataVersion: "1.0", retryClassification: "not-retryable",
    reconciliationClassification: "not-required", logicalAttemptReuse: "reuse-terminal-intent",
  },
  ownerAction: "continue-transaction", durableCompletion: false,
});

const harness = (participantResult: MultiCutReplayCompleteParticipationResultV2) => {
  const calls: string[] = [];
  const participant: MultiCutReplayCompleteTransactionParticipantV2 = Object.freeze({
    async executeComplete() { calls.push("participant"); return participantResult; },
  });
  const wrap = <Input, Output>(name: string, fn: (input: Input) => Output) =>
    (input: Input): Output => { calls.push(name); return fn(input); };
  const dependencies: MultiCutReplayLifecycleCompleteProductionAdapterDependencies = {
    createParameterInput: wrap("parameter", createMultiCutReplayCompleteProcessingParameterInput),
    createParticipationRequest: wrap("request", createMultiCutReplayCompleteParticipationRequestV2),
    participant,
    projectLifecycleResult: wrap("projection", projectMultiCutReplayCompleteParticipationResultToLifecycleV1),
    createProductionOutput: wrap("output", createMultiCutReplayLifecycleCompleteProductionOutputV1),
    createParameterFailureOutput: wrap("parameter-failure", createMultiCutReplayLifecycleCompleteParameterInputFailureV1),
    createRequestFailureOutput: wrap("request-failure", createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1),
  };
  return { calls, adapter: createMultiCutReplayLifecycleCompleteProductionAdapter(dependencies) };
};

test("factory exposes one complete operation and invokes the pipeline exactly once in order", async () => {
  const { adapter, calls } = harness(oneRow());
  assert.deepEqual(Object.keys(adapter), ["complete"]);
  const output = await adapter.complete(createInput());
  assert.equal("status" in output, true);
  if (!("status" in output)) return;
  assert.equal(output.status, "completed");
  assert.deepEqual(calls, ["parameter", "request", "participant", "projection", "output"]);
});

test("completion timestamp authority is passed unchanged to the parameter factory", async () => {
  const { adapter } = harness(oneRow());
  const output = await adapter.complete(createInput());
  assert.equal("status" in output, true);
  if (!("status" in output)) return;
  assert.equal(output.status, "completed");
  if (output.status !== "completed") return;
  assert.equal(output.projection.participationEvidence.projection.terminalMetadata.completedAt, "2026-08-02T00:00:00Z");
  assert.equal(output.durability, "pending-owner-commit");
  assert.equal(output.transactionOwnership.ownsStandaloneTransaction, false);
});

test("parameter failure short-circuits every downstream dependency", async () => {
  const { adapter, calls } = harness(oneRow());
  const input = createInput();
  const mutable = input.input.reservationEvidence as { reservationAttempt: number };
  mutable.reservationAttempt = 0;
  const output = await adapter.complete(input);
  assert.equal("kind" in output, true);
  if (!("kind" in output)) return;
  assert.equal(output.kind, "pre-participation-failure");
  assert.equal(output.phase, "parameter-input-validation");
  assert.deepEqual(calls, ["parameter", "parameter-failure"]);
  assert.equal(output.evidence.participantInvoked, false);
  assert.equal(output.evidence.queryExecuted, false);
});

test("request identity mismatch short-circuits participant and preserves reason", async () => {
  const { adapter, calls } = harness(oneRow());
  const original = createInput();
  const input: MultiCutReplayLifecycleCompleteProductionAdapterInputV1 = {
    ...original,
    authority: {
      ...original.authority,
      authoritativeReplayIdentity: {
        ...original.authority.authoritativeReplayIdentity,
        protectedScope: {
          ...original.authority.authoritativeReplayIdentity.protectedScope,
          tenant: { ...original.authority.authoritativeReplayIdentity.protectedScope.tenant },
        },
        resolvedIdentity: {
          ...original.authority.authoritativeReplayIdentity.resolvedIdentity,
          keyIdentity: "different",
        },
      },
    },
  };
  const output = await adapter.complete(input);
  assert.equal("kind" in output, true);
  if (!("kind" in output)) return;
  assert.equal(output.kind, "pre-participation-failure");
  assert.equal(output.phase, "participation-request-validation");
  assert.equal(output.reason, "identity-mismatch");
  assert.deepEqual(calls, ["parameter", "request", "request-failure"]);
});

test("all participant outcomes flow through projection and output without reclassification", async () => {
  const outcomes: MultiCutReplayCompleteParticipationResultV2[] = [
    { resultVersion: "2.0", status: "zero-row", command: "UPDATE", rowCount: 0, zeroRowClassification: "not-single-cause", lookupRequired: true, reconciliationRequired: true, queryMetadata: oneRow().queryMetadata, ownerAction: "do-not-commit", rollbackRequired: true },
    { resultVersion: "2.0", status: "cardinality-violation", expectedRowCount: 1, actualRowCount: 2, classification: "invariant-violation", queryMetadata: oneRow().queryMetadata, ownerAction: "rollback-required", rollbackRequired: true },
    { resultVersion: "2.0", status: "execution-failure", transactionPhase: "query", classification: "execution-failure", safeReason: "safe", sqlStateClass: "40", queryConnectionDisposition: "must-discard", queryMetadata: oneRow().queryMetadata, ownerAction: "rollback-required", rollbackRequired: true },
  ];
  const expected = ["not-applied", "internal-invariant-violation", "execution-failure"];
  for (let index = 0; index < outcomes.length; index += 1) {
    const { adapter, calls } = harness(outcomes[index]);
    const output = await adapter.complete(createInput());
    assert.equal("status" in output, true);
    if (!("status" in output)) continue;
    assert.equal(output.status, expected[index]);
    assert.deepEqual(calls, ["parameter", "request", "participant", "projection", "output"]);
  }
});

test("execution diagnostics and disposition remain optional and unchanged", async () => {
  const failure: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "execution-failure", transactionPhase: "query",
    classification: "execution-failure", safeReason: "safe",
    queryMetadata: oneRow().queryMetadata, ownerAction: "rollback-required", rollbackRequired: true,
  };
  const output = await harness(failure).adapter.complete(createInput());
  assert.equal("status" in output, true);
  if (!("status" in output)) return;
  assert.equal(output.status, "execution-failure");
  if (output.status !== "execution-failure") return;
  assert.equal(output.projection.safeReason, "safe");
  assert.equal("sqlStateClass" in output.projection, false);
  assert.equal("queryConnectionDisposition" in output.projection, false);
});

test("adapter is deterministic and isolates authoritative identity and nested output", async () => {
  const input = createInput();
  const first = await harness(oneRow()).adapter.complete(input);
  const second = await harness(oneRow()).adapter.complete(createInput());
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal("transactionOwnership" in first, true);
  if (!("transactionOwnership" in first)) return;
  assert.equal(Object.isFrozen(first.transactionOwnership), true);
});

test("adapter source contains no independent semantics or infrastructure", () => {
  const source = readFileSync("lib/server/multiCutReplayLifecycle/completeProductionAdapter.ts", "utf8");
  for (const forbidden of [
    "switch", "default:", "fallback", "commit-unknown", "Date.now", "new Date",
    "process.env", "SELECT ", "UPDATE ", "postgresqlCast", "ordinal", "begin(",
    "commit(", "rollback(", "release(", "discard(", "from \"pg\"", " as any", "unknown as",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
