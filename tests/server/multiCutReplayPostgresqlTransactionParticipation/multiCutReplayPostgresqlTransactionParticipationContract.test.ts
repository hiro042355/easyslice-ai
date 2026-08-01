import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type {
  MultiCutReplayCompleteParticipationRequest,
  MultiCutReplayCompleteTransactionParticipant,
  MultiCutReplayCompleteTransactionQueryPort,
  MultiCutReplayCompleteTransactionQueryResult,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";

const request: MultiCutReplayCompleteParticipationRequest = Object.freeze({
  requestVersion: "1.0",
  statementId: "complete-processing-replay",
  replayIdentity: Object.freeze({
    identityVersion: "2.0",
    protectedScope: Object.freeze({
      scopeVersion: "1.0",
      replayNamespace: "multi-cut",
      tenant: Object.freeze({
        identityVersion: "1.0",
        protectedTenantIdentity: "tenant-fixture",
      }),
      operationIdentity: "operation-fixture",
    }),
    resolvedIdentity: Object.freeze({
      identityVersion: "1.0",
      keyIdentity: "key-fixture",
      requestFingerprintIdentity: "fingerprint-fixture",
    }),
  }),
  expectedReservationEvidence: Object.freeze({
    evidenceVersion: "1.0",
    reservation: Object.freeze({
      reservationVersion: "1.0",
      reservationIdentity: "reservation-fixture",
    }),
    expectedRevision: Object.freeze({
      revisionVersion: "1.0",
      expectedRevision: "1",
    }),
    fencing: Object.freeze({
      fencingVersion: "1.0",
      fencingToken: "1",
    }),
    lease: Object.freeze({
      leaseVersion: "1.0",
      leaseIdentity: "lease-fixture",
    }),
    leaseExpiresAt: "2026-08-01T00:00:00.000Z",
    reservationAttempt: 1,
  }),
  resultReference: Object.freeze({
    referenceVersion: "1.0",
    resultReferenceIdentity: "result-fixture",
  }),
  terminalMetadata: Object.freeze({
    metadataVersion: "1.0",
    completedAt: "2026-08-01T00:00:00.000Z",
    completionClassification: "workflow-completed",
  }),
});

const oneRow: MultiCutReplayCompleteTransactionQueryResult = Object.freeze({
  resultVersion: "1.0",
  status: "one-row",
  command: "UPDATE",
  rowCount: 1,
  projection: Object.freeze({
    projectionVersion: "1.0",
    replayIdentity: request.replayIdentity,
    state: "completed",
    revision: "2",
    lastFencingToken: "1",
    lastReservationAttempt: 1,
    resultReference: request.resultReference,
    terminalMetadata: request.terminalMetadata,
  }),
  retryMetadata: "not-retryable",
  reconciliationMetadata: "not-required",
  connectionDisposition: "reusable",
  ownerDirective: "continue-transaction",
});

test("contract fixes complete-only ownership and same-session participation", () => {
  const ownership = MULTI_CUT_REPLAY_COMPLETE_PARTICIPATION_OWNERSHIP;
  assert.equal(ownership.contractVersion, "1.0");
  assert.deepEqual(ownership.statementScope, ["complete-processing-replay"]);
  assert.equal(ownership.transactionOwner, "workflow-completion-transaction-owner");
  assert.equal(ownership.participantOwnsTransaction, false);
  assert.equal(ownership.participantOwnsConnection, false);
  assert.equal(ownership.participantOwnsRetry, false);
  assert.equal(ownership.participantMayEmitDuplicatePersistenceFailure, false);
  assert.equal(ownership.commitUnknownOwner, "workflow-completion-transaction-owner");
  assert.equal(ownership.timeoutAuthority, "owner-connection-statement-timeout");
  assert.equal(ownership.sameSessionRequired, true);
  assert.equal(ownership.durableOnlyAfterOwnerCommit, true);
  assert.equal(Object.isFrozen(ownership), true);
  assert.equal(Object.isFrozen(ownership.statementScope), true);
});

test("query-only port and participant preserve deterministic results", async () => {
  let calls = 0;
  const query: MultiCutReplayCompleteTransactionQueryPort = Object.freeze({
    async executeComplete(received) {
      calls += 1;
      assert.equal(received, request);
      return oneRow;
    },
  });
  const participant: MultiCutReplayCompleteTransactionParticipant = Object.freeze({
    executeComplete(transaction, received) {
      return transaction.executeComplete(received);
    },
  });
  assert.equal(await participant.executeComplete(query, request), oneRow);
  assert.equal(calls, 1);
  assert.equal(oneRow.status, "one-row");
  assert.equal(oneRow.rowCount, 1);
  assert.equal(oneRow.command, "UPDATE");
  assert.equal(oneRow.ownerDirective, "continue-transaction");
  assert.equal(Object.isFrozen(oneRow), true);
});

test("zero-row, cardinality, and failure variants cannot represent commit unknown", () => {
  const results: readonly MultiCutReplayCompleteTransactionQueryResult[] = [
    Object.freeze({
      resultVersion: "1.0",
      status: "zero-row",
      command: "UPDATE",
      rowCount: 0,
      zeroRowClassification: "ambiguous-concurrency-miss",
      retryMetadata: "not-retryable",
      reconciliationMetadata: "authoritative-lookup-required",
      connectionDisposition: "reusable",
      ownerDirective: "do-not-commit",
    }),
    Object.freeze({
      resultVersion: "1.0",
      status: "cardinality-violation",
      rowCount: 2,
      classification: "invariant-violation",
      retryMetadata: "not-retryable",
      reconciliationMetadata: "owner-decision-required",
      connectionDisposition: "unknown",
      ownerDirective: "do-not-commit",
    }),
    Object.freeze({
      resultVersion: "1.0",
      status: "execution-failure",
      transactionPhase: "query",
      classification: "timeout",
      retryMetadata: "not-retryable",
      reconciliationMetadata: "owner-decision-required",
      safeReason: "statement-timeout",
      sqlStateClass: "57",
      connectionDisposition: "unknown",
      ownerDirective: "do-not-commit",
    }),
  ];
  assert.deepEqual(results.map(({ status }) => status), [
    "zero-row",
    "cardinality-violation",
    "execution-failure",
  ]);
  for (const result of results) {
    assert.equal(result.resultVersion, "1.0");
    assert.equal("commitUnknown" in result, false);
    assert.equal("transaction" in result, false);
    assert.equal("sql" in result, false);
    assert.equal("bindings" in result, false);
    assert.equal("rawError" in result, false);
  }
});

test("source boundary exposes no transaction control, raw database, or arbitrary SQL", () => {
  const root = join(process.cwd(), "lib", "server", "multiCutReplayPostgresqlTransactionParticipation");
  const types = readFileSync(join(root, "types.ts"), "utf8");
  const contract = readFileSync(join(root, "contractV1.ts"), "utf8");
  const source = `${types}\n${contract}`;
  for (const forbidden of [
    "begin(", "commit(", "rollback(", "release(", "discard(", "acquire(",
    "PoolClient", "from \"pg\"", "process.env", "AbortSignal", "query_timeout",
    "SET LOCAL", "unknown as", " as any", "Record<string, unknown>",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal((source.match(/complete-processing-replay/g) ?? []).length >= 2, true);
  for (const other of [
    "renew-processing-reservation", "fail-processing-replay", "release-processing-replay",
    "takeover-stale-processing-replay", "lookup-authoritative-replay",
    "resolve-new-reservation", "resolve-existing-replay",
  ]) assert.equal(source.includes(other), false, other);
});

test("request and successful projection reuse authoritative immutable contracts", () => {
  assert.equal(request.requestVersion, "1.0");
  assert.equal(request.statementId, "complete-processing-replay");
  assert.equal(oneRow.projection.replayIdentity, request.replayIdentity);
  assert.equal(oneRow.projection.resultReference, request.resultReference);
  assert.equal(oneRow.projection.terminalMetadata, request.terminalMetadata);
  assert.equal("transaction" in request, false);
  assert.equal("sql" in request, false);
  assert.equal("placeholder" in request, false);
  assert.equal("postgresqlCast" in request, false);
  assert.equal("timeout" in request, false);
  assert.equal("retryCount" in request, false);
});
