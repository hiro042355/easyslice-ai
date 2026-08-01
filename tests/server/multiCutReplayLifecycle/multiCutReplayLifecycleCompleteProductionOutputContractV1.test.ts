import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMultiCutReplayLifecycleCompleteProductionOutputV1,
  MULTI_CUT_REPLAY_LIFECYCLE_COMPLETE_PRODUCTION_TRANSACTION_OWNERSHIP_V1,
  projectMultiCutReplayCompleteParticipationResultToLifecycleV1,
} from "../../../lib/server/multiCutReplayLifecycle";
import type { MultiCutReplayCompleteParticipationResultV2 } from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";

const metadata = Object.freeze({
  metadataVersion: "1.0" as const,
  retryClassification: "not-retryable",
  reconciliationClassification: "authoritative-lookup-required",
  logicalAttemptReuse: "reuse-terminal-intent" as const,
});

const project = (result: MultiCutReplayCompleteParticipationResultV2) =>
  projectMultiCutReplayCompleteParticipationResultToLifecycleV1(result);

const oneRow = (): Extract<MultiCutReplayCompleteParticipationResultV2, { status: "one-row" }> => ({
  resultVersion: "2.0", status: "one-row", command: "UPDATE", rowCount: 1,
  projection: {
    projectionVersion: "1.0",
    replayIdentity: {
      identityVersion: "2.0",
      protectedScope: {
        scopeVersion: "1.0", replayNamespace: "multi-cut",
        tenant: { identityVersion: "1.0", protectedTenantIdentity: "tenant" },
        operationIdentity: "complete",
      },
      resolvedIdentity: { identityVersion: "1.0", keyIdentity: "key", requestFingerprintIdentity: "fingerprint" },
    },
    state: "completed", revision: "2", lastFencingToken: "7", lastReservationAttempt: 1,
    resultReference: { referenceVersion: "1.0", resultReferenceIdentity: "result" },
    terminalMetadata: { metadataVersion: "1.0", completedAt: "2026-08-02T00:00:00Z", completionClassification: "workflow-completed" },
  },
  queryMetadata: metadata, ownerAction: "continue-transaction", durableCompletion: false,
});

test("contract is versioned and assigns transaction authority without standalone ownership", () => {
  const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(project(oneRow()));
  assert.equal(output.schemaVersion, "1.0");
  assert.equal(output.contractVersion, "1.0");
  assert.equal(output.transactionOwnership.ownsStandaloneTransaction, false);
  assert.equal(output.transactionOwnership.transactionOwner, "workflow-completion-transaction-owner");
  assert.equal(Object.isFrozen(MULTI_CUT_REPLAY_LIFECYCLE_COMPLETE_PRODUCTION_TRANSACTION_OWNERSHIP_V1), true);
});

test("completed remains pending owner commit and preserves every projection field", () => {
  const input = project(oneRow());
  const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(input);
  assert.equal(output.status, "completed");
  if (output.status !== "completed") return;
  assert.equal(output.durability, "pending-owner-commit");
  assert.equal(output.ownerAction, "continue-transaction");
  assert.deepEqual(output.projection, input);
  assert.notEqual(output.projection, input);
});

test("zero row remains independently not-applied with complete recovery evidence", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "zero-row", command: "UPDATE", rowCount: 0,
    zeroRowClassification: "not-single-cause", lookupRequired: true,
    reconciliationRequired: true, queryMetadata: metadata,
    ownerAction: "do-not-commit", rollbackRequired: true,
  };
  const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(project(input));
  assert.equal(output.status, "not-applied");
  if (output.status !== "not-applied") return;
  assert.equal(output.projection.projectionReason, "not-single-cause");
  assert.equal(output.projection.lookupRequired, true);
  assert.equal(output.projection.participationEvidence.command, "UPDATE");
  assert.equal(output.projection.participationEvidence.rowCount, 0);
});

test("cardinality remains an internal invariant with expected and actual counts", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "cardinality-violation", expectedRowCount: 1,
    actualRowCount: 3, classification: "invariant-violation", queryMetadata: metadata,
    ownerAction: "rollback-required", rollbackRequired: true,
  };
  const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(project(input));
  assert.equal(output.status, "internal-invariant-violation");
  if (output.status !== "internal-invariant-violation") return;
  assert.equal(output.projection.expectedRowCount, 1);
  assert.equal(output.projection.actualRowCount, 3);
  assert.equal(output.projection.reconciliationRequired, true);
});

test("execution failure preserves safe metadata and every disposition", () => {
  for (const disposition of ["safe-to-reuse", "must-rollback-before-reuse", "must-discard", "unknown"] as const) {
    const input: MultiCutReplayCompleteParticipationResultV2 = {
      resultVersion: "2.0", status: "execution-failure", transactionPhase: "query",
      classification: "execution-failure", safeReason: "safe", sqlStateClass: "40",
      queryConnectionDisposition: disposition, queryMetadata: metadata,
      ownerAction: "rollback-required", rollbackRequired: true,
    };
    const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(project(input));
    assert.equal(output.status, "execution-failure");
    if (output.status !== "execution-failure") continue;
    assert.equal(output.projection.safeReason, "safe");
    assert.equal(output.projection.sqlStateClass, "40");
    assert.equal(output.projection.queryConnectionDisposition, disposition);
    assert.equal(output.projection.retryMetadata, "not-retryable");
    assert.equal(output.projection.reconciliationMetadata, "authoritative-lookup-required");
  }
});

test("missing optional failure diagnostics remain absent", () => {
  const input: MultiCutReplayCompleteParticipationResultV2 = {
    resultVersion: "2.0", status: "execution-failure", transactionPhase: "query",
    classification: "execution-failure", safeReason: "safe", queryMetadata: metadata,
    ownerAction: "rollback-required", rollbackRequired: true,
  };
  const output = createMultiCutReplayLifecycleCompleteProductionOutputV1(project(input));
  assert.equal("sqlStateClass" in output.projection, false);
  assert.equal("queryConnectionDisposition" in output.projection, false);
});

test("output is deterministic, frozen, and nested-copy-isolated", () => {
  const input = project(oneRow());
  const first = createMultiCutReplayLifecycleCompleteProductionOutputV1(input);
  const second = createMultiCutReplayLifecycleCompleteProductionOutputV1(input);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.projection), true);
  assert.notEqual(first.projection.participationEvidence, input.participationEvidence);
});

test("contract has four exact variants and no forbidden execution semantics", () => {
  const types = readFileSync("lib/server/multiCutReplayLifecycle/completeProductionOutputTypesV1.ts", "utf8");
  const contract = readFileSync("lib/server/multiCutReplayLifecycle/completeProductionOutputContractV1.ts", "utf8");
  for (const status of ["completed", "not-applied", "internal-invariant-violation", "execution-failure"]) {
    assert.equal(types.includes(`status: \"${status}\"`), true);
  }
  for (const forbidden of ["default:", "fallback", "raw Error", "SELECT ", "UPDATE ", "process.env", "begin(", "commit(", "rollback(", "release(", "discard("]) {
    assert.equal(contract.includes(forbidden), false, forbidden);
  }
});
