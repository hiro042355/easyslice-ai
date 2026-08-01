import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP,
  MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2,
  type MultiCutReplayCompleteParticipationRequestV2,
  type MultiCutReplayCompleteParticipationResultV2,
  type MultiCutReplayCompleteQueryExecutionPortV2,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type { MultiCutReplayPostgresqlQueryOnlyClient } from "../../../lib/server/multiCutReplayPostgresqlAdapter/pureTypes";
import {
  WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP,
} from "../../../lib/server/workflowCompletionAtomicRecovery";

const parameterInput = Object.freeze({
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
      protected_tenant_identity: "tenant",
      operation_identity: "operation",
      key_identity: "key",
    }),
    expected_revision: "4",
    expected_ownership_evidence: Object.freeze({
      reservation_identity: "reservation",
      lease_identity: "lease",
      reservation_attempt: 1,
    }),
    expected_fence: "8",
    result_reference_version: "1.0",
    result_reference_identity: "result",
    terminal_metadata_version: "1.0",
    terminal_at: "2026-08-02T00:00:00.000Z",
    terminal_classification: "workflow-completed",
  }),
} as const);

const request: MultiCutReplayCompleteParticipationRequestV2 = Object.freeze({
  schemaVersion: "2.0",
  contractVersion: "2.0",
  statementId: "complete-processing-replay",
  operationIdentity: "complete-replay-participation",
  sameSessionRequirement: "workflow-completion-transaction-session",
  transactionOwner: "workflow-completion-transaction-owner",
  parameterInput,
});

const metadata = Object.freeze({
  metadataVersion: "1.0",
  retryClassification: "workflow-completion-recovery-after-unknown-commit",
  reconciliationClassification: "workflow-completion-recovery",
  logicalAttemptReuse: "reuse-terminal-intent",
} as const);

test("V2 is additive, complete-only, and retains the typed parameter input", () => {
  assert.equal(MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP.contractVersion, "1.0");
  assert.equal(MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2.contractVersion, "2.0");
  assert.equal(request.statementId, "complete-processing-replay");
  assert.equal(request.parameterInput, parameterInput);
  assert.deepEqual(MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2.statementScope, [
    "complete-processing-replay",
  ]);
});

test("query port is exactly compatible with the Pure Query Mapping Core client", () => {
  const queryPort: MultiCutReplayCompleteQueryExecutionPortV2 = Object.freeze({
    async execute() {
      return Object.freeze({ kind: "success", rows: Object.freeze([]), rowCount: 0, command: "UPDATE" });
    },
  });
  const compatible: MultiCutReplayPostgresqlQueryOnlyClient = queryPort;
  assert.equal(typeof compatible.execute, "function");
  for (const forbidden of ["begin", "commit", "rollback", "acquire", "release", "discard", "close"]) {
    assert.equal(forbidden in queryPort, false);
  }
});

test("V2 result union covers one-row, zero-row, cardinality, and query failure only", () => {
  const results: readonly MultiCutReplayCompleteParticipationResultV2[] = Object.freeze([
    Object.freeze({
      resultVersion: "2.0",
      status: "one-row",
      command: "UPDATE",
      rowCount: 1,
      projection: Object.freeze({
        projectionVersion: "1.0",
        replayIdentity: Object.freeze({
          identityVersion: "2.0",
          protectedScope: Object.freeze({
            scopeVersion: "1.0",
            replayNamespace: "multi-cut",
            tenant: Object.freeze({ identityVersion: "1.0", protectedTenantIdentity: "tenant" }),
            operationIdentity: "operation",
          }),
          resolvedIdentity: Object.freeze({ identityVersion: "1.0", keyIdentity: "key", requestFingerprintIdentity: "fingerprint" }),
        }),
        state: "completed",
        revision: "5",
        lastFencingToken: "8",
        lastReservationAttempt: 1,
        resultReference: Object.freeze({ referenceVersion: "1.0", resultReferenceIdentity: "result" }),
        terminalMetadata: Object.freeze({ metadataVersion: "1.0", completedAt: "2026-08-02T00:00:00.000Z", completionClassification: "workflow-completed" }),
      }),
      queryMetadata: metadata,
      ownerAction: "continue-transaction",
      durableCompletion: false,
    }),
    Object.freeze({ resultVersion: "2.0", status: "zero-row", command: "UPDATE", rowCount: 0, zeroRowClassification: "not-single-cause", lookupRequired: false, reconciliationRequired: true, queryMetadata: metadata, ownerAction: "do-not-commit", rollbackRequired: true }),
    Object.freeze({ resultVersion: "2.0", status: "cardinality-violation", expectedRowCount: 1, actualRowCount: 2, classification: "invariant-violation", queryMetadata: metadata, ownerAction: "rollback-required", rollbackRequired: true }),
    Object.freeze({ resultVersion: "2.0", status: "execution-failure", transactionPhase: "query", classification: "execution-failure", safeReason: "query-failed", sqlStateClass: "40", queryConnectionDisposition: "must-rollback-before-reuse", queryMetadata: metadata, ownerAction: "rollback-required", rollbackRequired: true }),
    Object.freeze({ resultVersion: "2.0", status: "execution-failure", transactionPhase: "query", classification: "execution-failure", safeReason: "unknown", queryMetadata: metadata, ownerAction: "rollback-required", rollbackRequired: true }),
  ]);
  assert.deepEqual(results.map(({ status }) => status), [
    "one-row", "zero-row", "cardinality-violation", "execution-failure", "execution-failure",
  ]);
  assert.equal("queryConnectionDisposition" in results[4], false);
  assert.equal("sqlStateClass" in results[4], false);
  assert.equal(JSON.stringify(results).includes("commit-unknown"), false);
});

test("all four authoritative query connection dispositions remain representable", () => {
  const dispositions = [
    "safe-to-reuse",
    "must-rollback-before-reuse",
    "must-discard",
    "unknown",
  ] as const;
  assert.equal(new Set(dispositions).size, 4);
});

test("ownership is sourced from atomic recovery and reserves lifecycle for the owner", () => {
  const ownership = MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2;
  assert.equal(ownership.transactionOwner, WORKFLOW_COMPLETION_ATOMIC_RECOVERY_OWNERSHIP.commitOwner);
  assert.equal(ownership.participantOwnsCommitUnknown, false);
  assert.equal(ownership.participantOwnsRetry, false);
  assert.equal(ownership.zeroRowRequiresOwnerRollback, true);
  assert.equal(ownership.cardinalityRequiresOwnerRollback, true);
  assert.equal(ownership.durableOnlyAfterOwnerCommit, true);
});

test("V2 contract source exposes no implementation or transaction lifecycle authority", async () => {
  const source = await readFile(
    new URL("../../../lib/server/multiCutReplayPostgresqlTransactionParticipation/typesV2.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "Record<string, unknown>",
    "from \"pg\"",
    "PoolClient",
    "process.env",
    "AbortSignal",
    "sql:",
    "values:",
    "postgresqlCast",
    "ordinal:",
    "commit-unknown",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
