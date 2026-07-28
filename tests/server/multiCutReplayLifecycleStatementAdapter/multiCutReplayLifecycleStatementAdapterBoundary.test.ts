import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayLifecycleStatementAdapter,
  MULTI_CUT_REPLAY_LIFECYCLE_RUNTIME_REQUEST_BUILDER,
  MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS,
} from "../../../lib/server/multiCutReplayLifecycleStatementAdapter";
import type {
  MultiCutReplayLifecycleStatementAdapterRequest,
} from "../../../lib/server/multiCutReplayLifecycleStatementAdapter";
import type {
  MultiCutReplayPostgresqlStatementExecutionResult,
} from "../../../lib/server/multiCutReplayPostgresqlAdapterPort";
import {
  MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS,
} from "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog";

const replayIdentity = Object.freeze({
  identityVersion: "1.0" as const,
  keyIdentity: "key:one",
  requestFingerprintIdentity: "fingerprint:one",
});

const reservationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  reservation: Object.freeze({
    reservationVersion: "1.0" as const,
    reservationIdentity: "reservation:one",
  }),
  expectedRevision: Object.freeze({
    revisionVersion: "1.0" as const,
    expectedRevision: "revision:one",
  }),
  fencing: Object.freeze({
    fencingVersion: "1.0" as const,
    fencingToken: "fence:one",
  }),
  lease: Object.freeze({
    leaseVersion: "1.0" as const,
    leaseIdentity: "lease:one",
  }),
  leaseExpiresAt: "2030-01-01T00:00:00.000Z",
  reservationAttempt: 1,
});

const requests = {
  renew: Object.freeze({
    requestVersion: "1.0",
    lifecycleInput: Object.freeze({
      inputVersion: "3.0",
      transition: "renew",
      replayIdentity,
      reservationEvidence,
    }),
    transactionContext: Object.freeze({
      contextVersion: "1.0",
      scope: "required",
    }),
  }) satisfies MultiCutReplayLifecycleStatementAdapterRequest<"renew">,
  complete: Object.freeze({
    requestVersion: "1.0",
    lifecycleInput: Object.freeze({
      inputVersion: "3.0",
      transition: "complete",
      replayIdentity,
      reservationEvidence,
      resultReference: Object.freeze({
        referenceVersion: "1.0",
        resultReferenceIdentity: "result:one",
      }),
      metadata: Object.freeze({
        metadataVersion: "1.0",
        completedAt: "2030-01-01T00:01:00.000Z",
        completionClassification: "workflow-completed",
      }),
    }),
    transactionContext: Object.freeze({
      contextVersion: "1.0",
      scope: "workflow-completion",
    }),
  }) satisfies MultiCutReplayLifecycleStatementAdapterRequest<"complete">,
  fail: Object.freeze({
    requestVersion: "1.0",
    lifecycleInput: Object.freeze({
      inputVersion: "3.0",
      transition: "fail",
      replayIdentity,
      reservationEvidence,
      metadata: Object.freeze({
        metadataVersion: "1.0",
        failedAt: "2030-01-01T00:01:00.000Z",
        failureClassification: "workflow-failed",
      }),
    }),
    transactionContext: Object.freeze({
      contextVersion: "1.0",
      scope: "required",
    }),
  }) satisfies MultiCutReplayLifecycleStatementAdapterRequest<"fail">,
  release: Object.freeze({
    requestVersion: "1.0",
    lifecycleInput: Object.freeze({
      inputVersion: "3.0",
      transition: "release",
      replayIdentity,
      reservationEvidence,
      metadata: Object.freeze({
        metadataVersion: "1.0",
        releasedAt: "2030-01-01T00:01:00.000Z",
        releaseClassification: "safe-checkpoint",
      }),
    }),
    transactionContext: Object.freeze({
      contextVersion: "1.0",
      scope: "required",
    }),
  }) satisfies MultiCutReplayLifecycleStatementAdapterRequest<"release">,
} as const;

const executed = (
  statementId: MultiCutReplayPostgresqlStatementExecutionResult["statementId"],
): MultiCutReplayPostgresqlStatementExecutionResult =>
  Object.freeze({
    resultVersion: "1.0",
    status: "executed",
    statementId,
    affectedRowInterpretation: "exactly-one",
    opaquePayload: Object.freeze({ opaque: "projection-input" }),
    executionMetadata: Object.freeze({
      metadataVersion: "1.0",
      transactionScope: "required",
      affectedRowInterpretation: "exactly-one",
    }),
    commitUnknown: "not-unknown",
  });

test("bindings contain exactly the four lifecycle catalog statements", () => {
  const [, , , renewId, completeId, failId, releaseId] =
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS;
  const bindings = MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS;

  assert.deepEqual(
    Object.values(bindings).map((binding) => binding.statementId),
    [renewId, completeId, failId, releaseId],
  );
  assert.equal(Object.values(bindings).length, 4);
  assert.equal(new Set(Object.values(bindings).map((entry) => entry.statementId)).size, 4);
  assert.equal(Object.isFrozen(bindings), true);
});

test("renew boundary preserves ownership evidence and reconciliation metadata", () => {
  const renew = MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.renew;

  assert.equal(renew.accessMode, "write");
  assert.equal(renew.mutationClassification, "reservation-refresh");
  assert.notEqual(renew.mutationClassification, "ownership-takeover");
  assert.equal(renew.transactionRequirement, "required");
  assert.equal(renew.commitUnknownFollowUp, "reservation-reconciliation");
  assert.equal(renew.reconciliationRequirement, "reservation-mutation");
  assert.equal(renew.issuesNewFence, false);
  assert.deepEqual(renew.preservationBoundary, {
    replayIdentity: "preserved",
    reservationIdentity: "preserved",
    leaseIdentity: "preserved",
    fencingToken: "preserved",
    reservationAttempt: "preserved",
    revision: "advanced",
    leaseExpiry: "updated",
  });
});

test("complete boundary preserves workflow-completion transaction ownership", () => {
  const complete =
    MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.complete;

  assert.equal(complete.accessMode, "write");
  assert.equal(complete.mutationClassification, "terminal-transition");
  assert.equal(
    complete.transactionRequirement,
    "workflow-completion-transaction",
  );
  assert.equal(
    complete.commitUnknownFollowUp,
    "workflow-completion-recovery",
  );
  assert.equal(complete.reconciliationRequirement, "none");
  assert.equal(
    complete.participatesInWorkflowCompletionPersistenceTransaction,
    true,
  );
  assert.equal(complete.ownsStandaloneTransaction, false);
  assert.equal(complete.generatesFinalResult, false);
  assert.equal(complete.generatesResultReference, false);
  assert.equal(complete.orchestratesWorkflow, false);
});

test("fail and release retain terminal-only boundaries", () => {
  const { fail, release } =
    MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS;

  for (const terminal of [
    MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.complete,
    fail,
    release,
  ]) {
    assert.equal(terminal.mutationClassification, "terminal-transition");
    assert.equal(terminal.issuesNewFence, false);
    assert.equal(terminal.returnsReservationEvidence, false);
    assert.equal(terminal.generatesResultReference, false);
  }
  assert.equal(fail.commitUnknownFollowUp, "authoritative-lookup");
  assert.equal(fail.returnsResultReference, false);
  assert.equal(release.commitUnknownFollowUp, "authoritative-lookup");
  assert.equal(release.returnsResultReference, false);
  assert.equal(release.rereservationOwner, "resolution");
});

test("request builder retains immutable lifecycle input and transaction scope", () => {
  const bindings = MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS;
  const renewRequest =
    MULTI_CUT_REPLAY_LIFECYCLE_RUNTIME_REQUEST_BUILDER.build(
      bindings.renew,
      requests.renew,
    );
  const completeRequest =
    MULTI_CUT_REPLAY_LIFECYCLE_RUNTIME_REQUEST_BUILDER.build(
      bindings.complete,
      requests.complete,
    );

  assert.equal(Object.isFrozen(renewRequest), true);
  assert.equal(Object.isFrozen(renewRequest.parameters), true);
  assert.equal(
    renewRequest.parameters.lifecycleInput,
    requests.renew.lifecycleInput,
  );
  assert.equal(renewRequest.transactionContext.scope, "required");
  assert.equal(
    completeRequest.transactionContext.scope,
    "workflow-completion",
  );
});

test("adapter wires fixed dispatch and projection hooks only", async () => {
  const invoked: string[] = [];
  const projected: string[] = [];
  const adapter = createMultiCutReplayLifecycleStatementAdapter({
    executor: {
      executeStatement: async (request) => {
        invoked.push(request.statementId);
        return executed(request.statementId);
      },
    },
    projectionHook: {
      project: (context) => {
        projected.push(context.executionResult.statementId);
        return context.executionResult.affectedRowInterpretation;
      },
    },
    failureHook: {
      projectFailure: (context) => context.executionResult.status,
    },
  });

  await adapter.dispatchRenew(requests.renew);
  await adapter.dispatchComplete(requests.complete);
  await adapter.dispatchFail(requests.fail);
  await adapter.dispatchRelease(requests.release);

  assert.deepEqual(invoked, projected);
  assert.deepEqual(
    invoked,
    Object.values(MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS).map(
      (binding) => binding.statementId,
    ),
  );
});

test("affected-row and commit-unknown values pass through without algorithms", async () => {
  const failureStatuses: string[] = [];
  const adapter = createMultiCutReplayLifecycleStatementAdapter({
    executor: {
      executeStatement: async (request) =>
        Object.freeze({
          resultVersion: "1.0",
          status: "commit-unknown",
          statementId: request.statementId,
          affectedRowInterpretation: "not-applicable",
          opaquePayload: undefined,
          executionMetadata: Object.freeze({
            metadataVersion: "1.0",
            transactionScope: request.transactionContext.scope,
            affectedRowInterpretation: "not-applicable",
          }),
          commitUnknown: "commit-unknown",
          retry: "reconcile-first",
        }),
    },
    projectionHook: {
      project: () => "projection",
    },
    failureHook: {
      projectFailure: (context) => {
        failureStatuses.push(context.executionResult.status);
        return context.executionResult.status;
      },
    },
  });

  const result = await adapter.dispatchRenew(requests.renew);
  assert.equal(result.status, "failure-projected");
  assert.deepEqual(failureStatuses, ["commit-unknown"]);
  assert.deepEqual(
    MULTI_CUT_REPLAY_LIFECYCLE_STATEMENT_BINDINGS.renew.affectedRowBoundary,
    {
      success: "exactly-one",
      absence: "zero",
      multipleRows: "invariant-violation",
    },
  );
});

test("package imports are one-way and infrastructure-free", async () => {
  const [
    typesSource,
    adapterSource,
    indexSource,
    runtimeSource,
    portSource,
    catalogSource,
    resolutionAdapterSource,
  ] = await Promise.all([
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayLifecycleStatementAdapter/types.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayLifecycleStatementAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayLifecycleStatementAdapter/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapterRuntime/runtime.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlAdapterPort/types.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayPostgresqlStatementCatalog/catalog.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayResolutionStatementAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const source = `${typesSource}\n${adapterSource}\n${indexSource}`;

  assert.match(typesSource, /import\s+type[\s\S]*multiCutReplayLifecycle/);
  assert.doesNotMatch(
    source,
    /(?:multiCutReplayRecovery|node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|database client|query builder|transaction implementation)/i,
  );
  assert.doesNotMatch(
    source,
    /from\s+["'][^"']*(?:workflow|route|http)[^"']*["']/i,
  );
  assert.doesNotMatch(source, /from\s+["'](?:pg|postgres|postgresql)["']/);
  assert.doesNotMatch(
    source,
    /\b(?:SELECT|INSERT|UPDATE|DELETE|MERGE|RETURNING|ROLLBACK)\b|ON\s+CONFLICT|\$\d+|::[a-z]/,
  );
  for (const upstream of [
    runtimeSource,
    portSource,
    catalogSource,
    resolutionAdapterSource,
  ]) {
    assert.doesNotMatch(
      upstream,
      /multiCutReplayLifecycleStatementAdapter/,
    );
  }
});
