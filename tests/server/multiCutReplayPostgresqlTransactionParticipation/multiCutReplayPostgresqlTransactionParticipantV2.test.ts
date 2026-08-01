import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayCompleteParticipationRequestV2,
  createMultiCutReplayCompleteTransactionParticipantV2,
  type MultiCutReplayCompleteParticipationRequestV2,
  type MultiCutReplayCompleteQueryExecutionPortV2,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type {
  MultiCutReplayPostgresqlQueryExecutionResultV2,
} from "../../../lib/server/multiCutReplayPostgresqlAdapter/pureTypes";

const createRequest = (): MultiCutReplayCompleteParticipationRequestV2 => {
  const result = createMultiCutReplayCompleteParticipationRequestV2({
    authoritativeReplayIdentity: Object.freeze({
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
    }),
    parameterInput: Object.freeze({
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
          reservation_attempt: 3,
        }),
        expected_fence: "8",
        result_reference_version: "1.0",
        result_reference_identity: "result",
        terminal_metadata_version: "1.0",
        terminal_at: "2026-08-02T00:00:00.000Z",
        terminal_classification: "workflow-completed",
      }),
    }),
  });
  return result.status === "valid" ? result.request : assert.fail();
};

const completeRow = Object.freeze({
  revision: "5",
  expected_revision: null,
  result_reference_version: "1.0",
  result_reference_identity: "result",
  terminal_metadata_version: "1.0",
  terminal_at: "2026-08-02T00:00:00.000Z",
  terminal_classification: "workflow-completed",
});

const createFake = (configured: MultiCutReplayPostgresqlQueryExecutionResultV2) => {
  let invocations = 0;
  const captured: unknown[] = [];
  const port: MultiCutReplayCompleteQueryExecutionPortV2 = Object.freeze({
    async execute(executionRequest) {
      invocations += 1;
      captured.push(executionRequest);
      if (configured.kind === "execution-failure") {
        return Object.freeze({ ...configured });
      }
      return Object.freeze({
        ...configured,
        rows: Object.freeze(
          configured.rows.map((row) => Object.freeze({ ...row })),
        ),
      });
    },
  });
  return Object.freeze({
    port,
    invocationCount: () => invocations,
    capturedRequests: () => Object.freeze([...captured]),
  });
};

test("factory exposes one complete-only public operation", () => {
  const participant = createMultiCutReplayCompleteTransactionParticipantV2();
  assert.deepEqual(Object.keys(participant), ["executeComplete"]);
  assert.equal(Object.isFrozen(participant), true);
});

test("one row executes once and preserves authoritative identity evidence", async () => {
  const request = createRequest();
  const fake = createFake(Object.freeze({
    kind: "success",
    rows: Object.freeze([completeRow]),
    rowCount: 1,
    command: "UPDATE",
  }));
  const result = await createMultiCutReplayCompleteTransactionParticipantV2()
    .executeComplete(fake.port, request);
  assert.equal(fake.invocationCount(), 1);
  assert.equal(fake.capturedRequests().length, 1);
  assert.equal(result.status, "one-row");
  if (result.status !== "one-row") return;
  assert.deepEqual(result.projection.replayIdentity, request.authoritativeReplayIdentity);
  assert.notEqual(result.projection.replayIdentity, request.authoritativeReplayIdentity);
  assert.equal(
    result.projection.replayIdentity.resolvedIdentity.requestFingerprintIdentity,
    "fingerprint-authority",
  );
  assert.equal(result.projection.revision, "5");
  assert.equal(result.projection.lastFencingToken, "8");
  assert.equal(result.projection.lastReservationAttempt, 3);
  assert.equal(result.ownerAction, "continue-transaction");
  assert.equal(result.durableCompletion, false);
  assert.equal(Object.isFrozen(result.projection.resultReference), true);
  assert.equal(Object.isFrozen(result.projection.terminalMetadata), true);
});

test("zero row remains success-shaped and requires owner rollback", async () => {
  const fake = createFake(Object.freeze({
    kind: "success", rows: Object.freeze([]), rowCount: 0, command: "UPDATE",
  }));
  const result = await createMultiCutReplayCompleteTransactionParticipantV2()
    .executeComplete(fake.port, createRequest());
  assert.equal(fake.invocationCount(), 1);
  assert.equal(result.status, "zero-row");
  if (result.status !== "zero-row") return;
  assert.equal(result.ownerAction, "do-not-commit");
  assert.equal(result.rollbackRequired, true);
  assert.equal(result.zeroRowClassification, "not-single-cause");
});

test("multiple rows map to cardinality violation without another query", async () => {
  const fake = createFake(Object.freeze({
    kind: "success",
    rows: Object.freeze([completeRow, completeRow]),
    rowCount: 2,
    command: "UPDATE",
  }));
  const result = await createMultiCutReplayCompleteTransactionParticipantV2()
    .executeComplete(fake.port, createRequest());
  assert.equal(fake.invocationCount(), 1);
  assert.deepEqual(result.status === "cardinality-violation" && {
    expected: result.expectedRowCount,
    actual: result.actualRowCount,
    action: result.ownerAction,
  }, { expected: 1, actual: 2, action: "rollback-required" });
});

test("execution failure preserves optional safe diagnostics and every disposition", async () => {
  for (const disposition of [
    "safe-to-reuse",
    "must-rollback-before-reuse",
    "must-discard",
    "unknown",
  ] as const) {
    const fake = createFake(Object.freeze({
      kind: "execution-failure",
      failureVersion: "2.0",
      classification: "execution-failure",
      issue: "retryable-conflict",
      safeReason: "query-failed",
      sqlStateClass: "40",
      queryConnectionDisposition: disposition,
    }));
    const result = await createMultiCutReplayCompleteTransactionParticipantV2()
      .executeComplete(fake.port, createRequest());
    assert.equal(fake.invocationCount(), 1);
    assert.equal(result.status, "execution-failure");
    if (result.status !== "execution-failure") continue;
    assert.equal(result.safeReason, "query-failed");
    assert.equal(result.issue, "retryable-conflict");
    assert.equal(result.sqlStateClass, "40");
    assert.equal(result.queryConnectionDisposition, disposition);
    assert.equal(result.ownerAction, "rollback-required");
  }
});

test("missing optional failure diagnostics remain absent", async () => {
  const fake = createFake(Object.freeze({
    kind: "execution-failure",
    failureVersion: "2.0",
    classification: "execution-failure",
    issue: "unknown-failure",
    safeReason: "query-failed",
  }));
  const result = await createMultiCutReplayCompleteTransactionParticipantV2()
    .executeComplete(fake.port, createRequest());
  assert.equal(result.status, "execution-failure");
  assert.equal("sqlStateClass" in result, false);
  assert.equal("queryConnectionDisposition" in result, false);
});

test("participant source has no transaction, retry, infrastructure, or fingerprint authority", async () => {
  const source = await readFile(
    new URL("../../../lib/server/multiCutReplayPostgresqlTransactionParticipation/participantV2.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "commit-unknown",
    ".begin(",
    ".commit(",
    ".rollback(",
    ".acquire(",
    ".release(",
    ".discard(",
    "multiCutReplayPostgresqlStatementExecutor",
    "multiCutReplayPostgresqlExecutionDriver",
    "multiCutReplayPostgresqlTransactionRuntime",
    "multiCutReplayPostgresqlClient",
    "multiCutReplayPostgresqlAdapterRuntime",
    "from \"pg\"",
    "process.env",
    "setTimeout",
    "setInterval",
    "requestFingerprintIdentity:",
    " as any",
    "unknown as",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
