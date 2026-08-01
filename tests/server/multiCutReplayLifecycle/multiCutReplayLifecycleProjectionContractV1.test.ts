import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MULTI_CUT_REPLAY_LIFECYCLE_PROJECTION_TABLE_V1,
  projectMultiCutReplayCompleteParticipationResultToLifecycleV1,
  validateMultiCutReplayLifecycleProjectionResultV1,
} from "../../../lib/server/multiCutReplayLifecycle";
import type { MultiCutReplayCompleteParticipationResultV2 } from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";

const metadata = Object.freeze({
  metadataVersion: "1.0" as const,
  retryClassification: "not-retryable",
  reconciliationClassification: "authoritative-lookup-required",
  logicalAttemptReuse: "reuse-terminal-intent" as const,
});

const oneRow = (): Extract<MultiCutReplayCompleteParticipationResultV2, { status: "one-row" }> => ({
  resultVersion: "2.0",
  status: "one-row",
  command: "UPDATE",
  rowCount: 1,
  projection: {
    projectionVersion: "1.0",
    replayIdentity: {
      identityVersion: "2.0",
      protectedScope: {
        scopeVersion: "1.0",
        replayNamespace: "multi-cut",
        tenant: { identityVersion: "1.0", protectedTenantIdentity: "tenant" },
        operationIdentity: "complete",
      },
      resolvedIdentity: {
        identityVersion: "1.0",
        keyIdentity: "key",
        requestFingerprintIdentity: "fingerprint",
      },
    },
    state: "completed",
    revision: "2",
    lastFencingToken: "7",
    lastReservationAttempt: 1,
    resultReference: { referenceVersion: "1.0", resultReferenceIdentity: "result" },
    terminalMetadata: {
      metadataVersion: "1.0",
      completedAt: "2026-08-02T00:00:00Z",
      completionClassification: "workflow-completed",
    },
  },
  queryMetadata: metadata,
  ownerAction: "continue-transaction",
  durableCompletion: false,
});

test("projection table is complete and immutable", () => {
  assert.deepEqual(Object.keys(MULTI_CUT_REPLAY_LIFECYCLE_PROJECTION_TABLE_V1).sort(), [
    "cardinality-violation", "execution-failure", "one-row", "zero-row",
  ]);
  assert.equal(Object.isFrozen(MULTI_CUT_REPLAY_LIFECYCLE_PROJECTION_TABLE_V1), true);
});

test("one-row projects one-to-one to the existing Lifecycle V4 completed result", () => {
  const input = oneRow();
  const result = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(input);
  assert.equal(result.status, "completed-candidate");
  if (result.status !== "completed-candidate") return;
  assert.deepEqual(result.lifecycleResult, {
    resultVersion: "4.0",
    status: "completed",
    state: "completed",
    replayIdentity: input.projection.replayIdentity,
    resultReference: input.projection.resultReference,
    revision: "2",
  });
  assert.deepEqual(result.participationEvidence, input);
  assert.notEqual(result.participationEvidence, input);
  assert.notEqual(result.lifecycleResult.replayIdentity, input.projection.replayIdentity);
});

test("zero-row preserves its non-inferred projection reason and recovery requirements", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "zero-row", command: "UPDATE", rowCount: 0,
    zeroRowClassification: "not-single-cause", lookupRequired: true,
    reconciliationRequired: true, queryMetadata: metadata,
    ownerAction: "do-not-commit", rollbackRequired: true,
  };
  const result = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(input);
  assert.equal(result.status, "not-applied");
  if (result.status !== "not-applied") return;
  assert.equal(result.projectionReason, "not-single-cause");
  assert.equal(result.lookupRequired, true);
  assert.equal(result.reconciliationRequired, true);
});

test("cardinality is an internal invariant violation rather than a domain conflict", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "cardinality-violation", expectedRowCount: 1,
    actualRowCount: 2, classification: "invariant-violation", queryMetadata: metadata,
    ownerAction: "rollback-required", rollbackRequired: true,
  };
  const result = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(input);
  assert.equal(result.status, "internal-invariant-violation");
  if (result.status !== "internal-invariant-violation") return;
  assert.equal(result.actualRowCount, 2);
  assert.equal(result.reconciliationRequired, true);
  assert.equal("lifecycleResult" in result, false);
});

test("execution failure retains only safe diagnostics and optional fields", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "execution-failure", transactionPhase: "query",
    classification: "execution-failure", safeReason: "safe", sqlStateClass: "40",
    queryConnectionDisposition: "must-discard", queryMetadata: metadata,
    ownerAction: "rollback-required", rollbackRequired: true,
  };
  const result = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(input);
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") return;
  assert.equal(result.safeReason, "safe");
  assert.equal(result.sqlStateClass, "40");
  assert.equal(result.queryConnectionDisposition, "must-discard");
  assert.equal(result.retryMetadata, "not-retryable");
  assert.equal(result.reconciliationMetadata, "authoritative-lookup-required");
});

test("execution failure preserves absence of optional diagnostics", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "execution-failure", transactionPhase: "query",
    classification: "execution-failure", safeReason: "safe", queryMetadata: metadata,
    ownerAction: "rollback-required", rollbackRequired: true,
  };
  const result = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(input);
  assert.equal("sqlStateClass" in result, false);
  assert.equal("queryConnectionDisposition" in result, false);
});

test("projection is deterministic, deeply frozen, and validates its version", () => {
  const first = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(oneRow());
  const second = projectMultiCutReplayCompleteParticipationResultToLifecycleV1(oneRow());
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.participationEvidence), true);
  assert.equal(validateMultiCutReplayLifecycleProjectionResultV1(first).status, "valid");
  assert.equal(validateMultiCutReplayLifecycleProjectionResultV1({ ...first, schemaVersion: "2.0" }).status, "invalid");
});

test("contract source has no commit-unknown, raw SQL, IO, or default branch", () => {
  const source = readFileSync(
    "lib/server/multiCutReplayLifecycle/projectionContractV1.ts", "utf8",
  );
  assert.equal(source.includes("commit-unknown"), false);
  assert.equal(source.includes("SELECT "), false);
  assert.equal(source.includes("UPDATE "), false);
  assert.equal(source.includes("default:"), false);
  assert.equal(source.includes("node:fs"), false);
});
