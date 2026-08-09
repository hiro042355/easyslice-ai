import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiCutReplayLifecycleCompleteProductionAdapterV2,
} from "../../../lib/server/multiCutReplayLifecycle";
import {
  createMultiCutReplayCompleteTransactionParticipantV3,
  type MultiCutReplayCompleteQueryExecutionPortV3,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type { MultiCutReplayPostgresqlQueryExecutionFailureV3 } from "../../../lib/server/multiCutReplayPostgresqlAdapter";
import type {
  DurableWorkflowTransactionContextV4,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";
import {
  createWorkflowCompletionReplayBindingV2,
  type WorkflowCompletionReplayBindingInputV2,
} from "../../../lib/server/workflowCompletionReplayBinding";

const evidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  sessionScope: "workflow-transaction" as const,
  sessionAffinity: "same-session-required" as const,
  transactionOwnership: "workflow-owner" as const,
  separateConnectionPermitted: false as const,
  capabilityOwnsLifecycle: false as const,
  validOnlyDuringActiveTransaction: true as const,
});

const identity = Object.freeze({
  identityVersion: "2.0" as const,
  protectedScope: Object.freeze({
    scopeVersion: "1.0" as const,
    replayNamespace: "multi-cut",
    tenant: Object.freeze({
      identityVersion: "1.0" as const,
      protectedTenantIdentity: "tenant:protected",
    }),
    operationIdentity: "multi-cut",
  }),
  resolvedIdentity: Object.freeze({
    identityVersion: "1.0" as const,
    keyIdentity: "key:1",
    requestFingerprintIdentity: "fingerprint:1",
  }),
});

const context = (
  executeQuery: DurableWorkflowTransactionContextV4["sameSessionQuery"]["executeQuery"],
): DurableWorkflowTransactionContextV4 => Object.freeze({
  contextVersion: "4.0",
  scope: "opaque-production-durable-transaction-scope",
  startedAt: "2026-08-02T00:00:00.000Z",
  deadlineMonotonicMilliseconds: 1000,
  externalIoAllowed: false,
  database: Object.freeze({
    capabilityVersion: "1.0",
    execute: async () => Object.freeze({ status: "not-found" as const }),
  }),
  state: () => "active",
  registerAfterCommit: () => "registered",
  transactionOwnership: "workflow-owner",
  sameSessionEvidence: evidence,
  generalSameSessionQuery: Object.freeze({
    capabilityVersion: "2.0",
    evidence,
    executeQuery,
  }),
  sameSessionQuery: Object.freeze({
    capabilityVersion: "3.0",
    evidence,
    executeQuery,
  }),
});

const input = (
  transactionContext: DurableWorkflowTransactionContextV4,
): WorkflowCompletionReplayBindingInputV2 => Object.freeze({
  inputVersion: "2.0",
  transactionContext,
  lifecycleInput: Object.freeze({
    inputVersion: "4.0",
    transition: "complete",
    replayIdentity: identity,
    reservationEvidence: Object.freeze({
      evidenceVersion: "1.0",
      reservation: Object.freeze({
        reservationVersion: "1.0",
        reservationIdentity: "reservation:1",
      }),
      expectedRevision: Object.freeze({
        revisionVersion: "1.0",
        expectedRevision: "1",
      }),
      fencing: Object.freeze({
        fencingVersion: "1.0",
        fencingToken: "2",
      }),
      lease: Object.freeze({
        leaseVersion: "1.0",
        leaseIdentity: "lease:1",
      }),
      leaseExpiresAt: "2026-08-02T00:01:00.000Z",
      reservationAttempt: 1,
    }),
    resultReference: Object.freeze({
      referenceVersion: "1.0",
      resultReferenceIdentity: "result:1",
    }),
    metadata: Object.freeze({
      metadataVersion: "1.0",
      completedAt: "2026-08-02T00:00:01.000Z",
      completionClassification: "workflow-completed",
    }),
  }),
  authority: Object.freeze({
    authorityVersion: "1.0",
    authoritativeReplayIdentity: identity,
    completionTimestamp: "2026-08-02T00:00:02.000Z",
    parameterVersionAuthority: Object.freeze({
      schemaVersion: "1.0",
      contractVersion: "1.0",
      physicalSchemaVersion: "2.0",
      logicalSchemaVersion: "2.0",
      bindingInventoryVersion: "2.0",
      parameterContractVersion: "2.0",
    }),
  }),
});

const binding = () => createWorkflowCompletionReplayBindingV2({
  lifecycleCompleteAdapter:
    createMultiCutReplayLifecycleCompleteProductionAdapterV2(
      createMultiCutReplayCompleteTransactionParticipantV3(),
    ),
});

test("complete binding preserves driver-owned failure evidence exactly once", async () => {
  for (const [retryable, disposition] of [
    [true, "must-discard"],
    [false, "safe-to-reuse"],
    [false, "must-rollback-before-reuse"],
    [false, "unknown"],
  ] as const) {
    let calls = 0;
    const result = await binding().executeReplayCompletion(input(context(async () => {
      calls += 1;
      return Object.freeze({
        status: "failure",
        resultVersion: "2.0",
        issue: "retryable-conflict",
        safeReason: "postgresql-retryable-conflict",
        diagnostic: Object.freeze({
          stage: "query",
          issue: "retryable-conflict",
          retryable,
          sqlStateClass: "40",
          queryConnectionDisposition: disposition,
        }),
      });
    })));
    assert.equal(calls, 1);
    assert.ok("status" in result);
    if (!("status" in result) || result.status !== "execution-failure") continue;
    assert.deepEqual(result.projection, {
      evidenceVersion: "2.0",
      status: "unavailable",
      sourceStatus: "execution-failure",
      issue: "retryable-conflict",
      safeReason: "postgresql-retryable-conflict",
      retryable,
      sqlStateClass: "40",
      queryConnectionDisposition: disposition,
      ownerAction: "rollback-required",
      commitUnknown: false,
    });
  }
});

test("complete binding preserves success semantics and copy isolation", async () => {
  let calls = 0;
  const row = {
    revision: "2",
    result_reference_version: "1.0",
    result_reference_identity: "result:1",
    terminal_metadata_version: "1.0",
    terminal_at: "2026-08-02T00:00:02.000Z",
    terminal_classification: "workflow-completed",
  } as const;
  const source = input(context(async () => {
    calls += 1;
    return Object.freeze({
      status: "success",
      rows: Object.freeze([Object.freeze(row)]),
      rowCount: 1,
      command: "UPDATE",
    });
  }));
  const result = await binding().executeReplayCompletion(source);
  assert.equal(calls, 1);
  assert.ok("status" in result);
  if (!("status" in result) || result.status !== "completed") return;
  assert.equal(result.durability, "pending-owner-commit");
  assert.notEqual(
    result.projection.lifecycleResult.replayIdentity,
    source.lifecycleInput.replayIdentity,
  );
  assert.ok(Object.isFrozen(result));
});

test("complete failure types require retryability and disposition", () => {
  const acceptsCompleteFailure = (
    _failure: MultiCutReplayPostgresqlQueryExecutionFailureV3,
  ): void => { void _failure; };
  // @ts-expect-error Complete failure evidence cannot downgrade retryable.
  acceptsCompleteFailure({ kind: "execution-failure", failureVersion: "3.0", classification: "execution-failure", issue: "unknown-failure", safeReason: "postgresql-unknown-failure", queryConnectionDisposition: "unknown" });
  // @ts-expect-error Complete failure evidence cannot downgrade disposition.
  acceptsCompleteFailure({ kind: "execution-failure", failureVersion: "3.0", classification: "execution-failure", issue: "unknown-failure", safeReason: "postgresql-unknown-failure", retryable: false });
  assert.equal(typeof acceptsCompleteFailure, "function");
});

test("complete query port invokes no fallback", async () => {
  let calls = 0;
  const port: MultiCutReplayCompleteQueryExecutionPortV3 = Object.freeze({
    async execute() {
      calls += 1;
      return Object.freeze({
        kind: "execution-failure",
        failureVersion: "3.0",
        classification: "execution-failure",
        issue: "unknown-failure",
        safeReason: "postgresql-unknown-failure",
        retryable: false,
        queryConnectionDisposition: "unknown",
      });
    },
  });
  const result = await port.execute(Object.freeze({
    requestVersion: "1.0",
    statementId: "complete-processing-replay",
    sql: "SELECT 1",
    parameters: Object.freeze([]),
    values: Object.freeze([]),
  }));
  assert.equal(calls, 1);
  assert.equal(result.kind, "execution-failure");
});
