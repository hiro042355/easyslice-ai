import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMultiCutReplayLifecycleCompleteParameterInputFailureV1,
  createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1,
} from "../../../lib/server/multiCutReplayLifecycle";
import type { MultiCutReplayLifecycleCompleteAdapterResultV1 } from "../../../lib/server/multiCutReplayLifecycle";
import type { MultiCutReplayLifecycleCompleteProductionResultV1 } from "../../../lib/server/multiCutReplayLifecycle";

test("parameter factory failure preserves its fixed safe reasons", () => {
  const output = createMultiCutReplayLifecycleCompleteParameterInputFailureV1({
    resultVersion: "1.0",
    status: "invalid",
    reason: "typed-input-validation-failure",
    validationReason: "invalid-binding-value",
  });
  assert.equal(output.schemaVersion, "1.0");
  assert.equal(output.contractVersion, "1.0");
  assert.equal(output.kind, "pre-participation-failure");
  assert.equal(output.phase, "parameter-input-validation");
  assert.equal(output.reason, "typed-input-validation-failure");
  assert.equal(output.validationReason, "invalid-binding-value");
});

test("every participation request validation reason remains distinct", () => {
  for (const reason of [
    "invalid-authoritative-identity",
    "invalid-parameter-input",
    "identity-mismatch",
  ] as const) {
    const output = createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1({
      resultVersion: "2.0", status: "invalid", reason,
    });
    assert.equal(output.phase, "participation-request-validation");
    assert.equal(output.reason, reason);
  }
});

test("pre-participation evidence is scoped to Replay participation only", () => {
  const output = createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1({
    resultVersion: "2.0", status: "invalid", reason: "identity-mismatch",
  });
  assert.deepEqual(output.evidence, {
    statementId: "complete-processing-replay",
    operationIdentity: "complete-replay-participation",
    participantInvoked: false,
    replayParticipationStarted: false,
    queryExecuted: false,
    replayMutationAttempted: false,
    adapterRetryAttempted: false,
    recoveryExecuted: false,
    ownerAction: "do-not-commit",
  });
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.evidence), true);
});

test("constructors copy-isolate validation results and expose no raw input", () => {
  const source = {
    resultVersion: "2.0" as const,
    status: "invalid" as const,
    reason: "invalid-parameter-input" as const,
  };
  const output = createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1(source);
  const mutable = source as { reason: string };
  mutable.reason = "changed";
  assert.equal(output.reason, "invalid-parameter-input");
  assert.equal("input" in output, false);
});

test("combined adapter result accepts both pre-failure and existing output V1", () => {
  const failure: MultiCutReplayLifecycleCompleteAdapterResultV1 =
    createMultiCutReplayLifecycleCompleteParticipationRequestFailureV1({
      resultVersion: "2.0", status: "invalid", reason: "identity-mismatch",
    });
  assert.equal(failure.kind, "pre-participation-failure");
  const existing: MultiCutReplayLifecycleCompleteProductionResultV1 = {
    schemaVersion: "1.0", contractVersion: "1.0",
    operationIdentity: "complete-replay-participation",
    transactionOwnership: {
      ownershipVersion: "1.0",
      transactionOwner: "workflow-completion-transaction-owner",
      adapterOwnsTransaction: false,
      ownsStandaloneTransaction: false,
      adapterOwnsRetry: false,
      adapterOwnsRecovery: false,
      durableCompletionAuthority: "workflow-completion-transaction-owner",
    },
    status: "not-applied", durability: "not-durable", ownerAction: "do-not-commit",
    projection: {
      schemaVersion: "1.0", sourceStatus: "zero-row", status: "not-applied",
      classification: "ambiguous-concurrency-miss", projectionReason: "not-single-cause",
      lookupRequired: true, reconciliationRequired: true, ownerAction: "do-not-commit",
      rollbackRequired: true,
      participationEvidence: {
        resultVersion: "2.0", status: "zero-row", command: "UPDATE", rowCount: 0,
        zeroRowClassification: "not-single-cause", lookupRequired: true,
        reconciliationRequired: true,
        queryMetadata: {
          metadataVersion: "1.0", retryClassification: "not-retryable",
          reconciliationClassification: "authoritative-lookup-required",
          logicalAttemptReuse: "reuse-terminal-intent",
        },
        ownerAction: "do-not-commit", rollbackRequired: true,
      },
    },
  };
  const combined: MultiCutReplayLifecycleCompleteAdapterResultV1 = existing;
  assert.equal(combined.status, "not-applied");
});

test("contract contains no query, connection, transaction, or unsafe error fields", () => {
  const types = readFileSync("lib/server/multiCutReplayLifecycle/completePreParticipationFailureTypesV1.ts", "utf8");
  const contract = readFileSync("lib/server/multiCutReplayLifecycle/completePreParticipationFailureContractV1.ts", "utf8");
  for (const forbidden of [
    "queryConnectionDisposition", "sqlStateClass", "commit-unknown", "raw Error",
    "SELECT ", "UPDATE ", "bindings", "default:", "fallback", "begin(",
    "commit(", "rollback(", "from \"pg\"", "unknown as", " as any",
  ]) {
    assert.equal(types.includes(forbidden) || contract.includes(forbidden), false, forbidden);
  }
});
