import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP,
  MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2,
  createMultiCutReplayCompleteParticipationRequestV2,
  type MultiCutReplayCompleteParticipationRequestV2,
  type MultiCutReplayCompleteParticipationResultV2,
  type MultiCutReplayCompleteQueryExecutionPortV2,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type { MultiCutReplayPostgresqlQueryOnlyClientV2 } from "../../../lib/server/multiCutReplayPostgresqlAdapter/pureTypes";
import type {
  MultiCutReplayPostgresqlQueryExecutionFailureV2,
} from "../../../lib/server/multiCutReplayPostgresqlAdapter/pureTypes";
import type {
  DurableWorkflowSameSessionQueryFailure,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
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

const authoritativeReplayIdentity = Object.freeze({
  identityVersion: "2.0",
  protectedScope: Object.freeze({
    scopeVersion: "1.0",
    replayNamespace: "multi-cut",
    tenant: Object.freeze({
      identityVersion: "1.0",
      protectedTenantIdentity: "tenant",
    }),
    operationIdentity: "operation",
  }),
  resolvedIdentity: Object.freeze({
    identityVersion: "1.0",
    keyIdentity: "key",
    requestFingerprintIdentity: "fingerprint-authority",
  }),
} as const);

const createdRequest = createMultiCutReplayCompleteParticipationRequestV2({
  authoritativeReplayIdentity,
  parameterInput,
});
assert.equal(createdRequest.status, "valid");
const request: MultiCutReplayCompleteParticipationRequestV2 =
  createdRequest.status === "valid" ? createdRequest.request : assert.fail();

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
  assert.notEqual(request.parameterInput, parameterInput);
  assert.equal(
    request.authoritativeReplayIdentity.resolvedIdentity.requestFingerprintIdentity,
    "fingerprint-authority",
  );
  assert.deepEqual(MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP_V2.statementScope, [
    "complete-processing-replay",
  ]);
});

test("request factory preserves and copy-isolates the full authoritative identity", () => {
  assert.notEqual(request.authoritativeReplayIdentity, authoritativeReplayIdentity);
  assert.notEqual(
    request.authoritativeReplayIdentity.protectedScope,
    authoritativeReplayIdentity.protectedScope,
  );
  assert.notEqual(
    request.authoritativeReplayIdentity.resolvedIdentity,
    authoritativeReplayIdentity.resolvedIdentity,
  );
  assert.equal(Object.isFrozen(request.authoritativeReplayIdentity), true);
  assert.equal(Object.isFrozen(request.authoritativeReplayIdentity.resolvedIdentity), true);
});

test("overlapping identity mismatch fails closed without choosing either authority", () => {
  const mismatches = [
    { replay_namespace: "other" },
    { protected_tenant_identity: "other" },
    { operation_identity: "other" },
    { key_identity: "other" },
  ];
  for (const mismatch of mismatches) {
    const result = createMultiCutReplayCompleteParticipationRequestV2({
      authoritativeReplayIdentity,
      parameterInput: {
        ...parameterInput,
        bindings: {
          ...parameterInput.bindings,
          replay_identity: {
            ...parameterInput.bindings.replay_identity,
            ...mismatch,
          },
        },
      },
    });
    assert.deepEqual(result, {
      resultVersion: "2.0",
      status: "invalid",
      reason: "identity-mismatch",
    });
  }
});

test("fingerprint remains domain evidence and is absent from SQL parameter input", () => {
  assert.equal(
    request.authoritativeReplayIdentity.resolvedIdentity.requestFingerprintIdentity,
    authoritativeReplayIdentity.resolvedIdentity.requestFingerprintIdentity,
  );
  assert.equal("request_fingerprint_identity" in parameterInput.bindings, false);
  assert.equal("requestFingerprintIdentity" in parameterInput.bindings, false);
});

test("query port is exactly compatible with the Pure Query Mapping Core client", () => {
  const queryPort: MultiCutReplayCompleteQueryExecutionPortV2 = Object.freeze({
    async execute() {
      return Object.freeze({ kind: "success", rows: Object.freeze([]), rowCount: 0, command: "UPDATE" });
    },
  });
  const compatible: MultiCutReplayPostgresqlQueryOnlyClientV2 = queryPort;
  assert.equal(typeof compatible.execute, "function");
  for (const forbidden of ["begin", "commit", "rollback", "acquire", "release", "discard", "close"]) {
    assert.equal(forbidden in queryPort, false);
  }
});

test("query failure V2 mechanically preserves the Same-session transport issue", () => {
  const source: DurableWorkflowSameSessionQueryFailure = Object.freeze({
    resultVersion: "1.0",
    status: "execution-failure",
    phase: "query",
    classification: "connection-unavailable",
    safeReason: "postgresql-connection-unavailable",
    sqlStateClass: "08",
    queryConnectionDisposition: "must-discard",
  });
  const projected: MultiCutReplayPostgresqlQueryExecutionFailureV2 = Object.freeze({
    kind: "execution-failure",
    failureVersion: "2.0",
    classification: "execution-failure",
    issue: source.classification,
    safeReason: source.safeReason,
    ...(source.sqlStateClass !== undefined
      ? { sqlStateClass: source.sqlStateClass }
      : {}),
    ...(source.queryConnectionDisposition !== undefined
      ? { queryConnectionDisposition: source.queryConnectionDisposition }
      : {}),
  });
  assert.equal(projected.kind, "execution-failure");
  assert.equal(projected.issue, "connection-unavailable");
  assert.equal(projected.safeReason, source.safeReason);
  assert.equal(projected.sqlStateClass, source.sqlStateClass);
  assert.equal(
    projected.queryConnectionDisposition,
    source.queryConnectionDisposition,
  );

  // @ts-expect-error V2 requires the authoritative PostgreSQL transport issue.
  const missingIssue: MultiCutReplayPostgresqlQueryExecutionFailureV2 = {
    kind: "execution-failure",
    failureVersion: "2.0",
    classification: "execution-failure",
    safeReason: "postgresql-unknown-failure",
  };
  void missingIssue;
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
        replayIdentity: request.authoritativeReplayIdentity,
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
    Object.freeze({ resultVersion: "2.0", status: "execution-failure", transactionPhase: "query", classification: "execution-failure", issue: "retryable-conflict", safeReason: "query-failed", sqlStateClass: "40", queryConnectionDisposition: "must-rollback-before-reuse", queryMetadata: metadata, ownerAction: "rollback-required", rollbackRequired: true }),
    Object.freeze({ resultVersion: "2.0", status: "execution-failure", transactionPhase: "query", classification: "execution-failure", issue: "unknown-failure", safeReason: "unknown", queryMetadata: metadata, ownerAction: "rollback-required", rollbackRequired: true }),
  ]);
  assert.deepEqual(results.map(({ status }) => status), [
    "one-row", "zero-row", "cardinality-violation", "execution-failure", "execution-failure",
  ]);
  assert.equal("queryConnectionDisposition" in results[4], false);
  assert.equal("sqlStateClass" in results[4], false);
  assert.equal(JSON.stringify(results).includes("commit-unknown"), false);
  assert.equal(
    results[0].status === "one-row" && results[0].projection.replayIdentity,
    request.authoritativeReplayIdentity,
  );
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
