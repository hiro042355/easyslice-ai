import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMultiCutReplayRecoveryStatementAdapter,
  MULTI_CUT_REPLAY_RECOVERY_RUNTIME_REQUEST_BUILDER,
  MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS,
} from "../../../lib/server/multiCutReplayRecoveryStatementAdapter";
import type {
  MultiCutReplayRecoveryStatementAdapterRequest,
} from "../../../lib/server/multiCutReplayRecoveryStatementAdapter";
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
    reservationIdentity: "reservation:current",
  }),
  expectedRevision: Object.freeze({
    revisionVersion: "1.0" as const,
    expectedRevision: "revision:current",
  }),
  fencing: Object.freeze({
    fencingVersion: "1.0" as const,
    fencingToken: "fence:current",
  }),
  lease: Object.freeze({
    leaseVersion: "1.0" as const,
    leaseIdentity: "lease:current",
  }),
  leaseExpiresAt: "2030-01-01T00:00:00.000Z",
  reservationAttempt: 1,
});

const lookupRequest = Object.freeze({
  requestVersion: "1.0",
  recoveryInput: Object.freeze({
    inputVersion: "3.0",
    replayIdentity,
    reason: "authoritative-lookup",
  }),
  transactionContext: Object.freeze({
    contextVersion: "1.0",
    scope: "none",
  }),
}) satisfies MultiCutReplayRecoveryStatementAdapterRequest<"lookup">;

const takeoverRequest = Object.freeze({
  requestVersion: "1.0",
  recoveryInput: Object.freeze({
    inputVersion: "3.0",
    replayIdentity,
    reservationEvidence,
  }),
  reconciliationInput: Object.freeze({
    inputVersion: "3.0",
    mutation: "takeover",
    replayIdentity,
    previousReservationEvidence: reservationEvidence,
    requestedNextReservation: Object.freeze({
      reservationVersion: "1.0",
      reservationIdentity: "reservation:next",
    }),
    requestedNextLease: Object.freeze({
      leaseVersion: "1.0",
      leaseIdentity: "lease:next",
    }),
  }),
  transactionContext: Object.freeze({
    contextVersion: "1.0",
    scope: "required",
  }),
}) satisfies MultiCutReplayRecoveryStatementAdapterRequest<"takeover">;

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

test("bindings contain exactly the two recovery catalog statements", () => {
  const [, , lookupId, , , , , takeoverId] =
    MULTI_CUT_REPLAY_POSTGRESQL_STATEMENT_IDS;
  const bindings = MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS;

  assert.deepEqual(
    Object.values(bindings).map((binding) => binding.statementId),
    [lookupId, takeoverId],
  );
  assert.equal(Object.values(bindings).length, 2);
  assert.equal(
    new Set(Object.values(bindings).map((binding) => binding.statementId))
      .size,
    2,
  );
  assert.equal(Object.isFrozen(bindings), true);
});

test("lookup retains read-only authoritative boundaries", () => {
  const lookup = MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.lookup;

  assert.equal(lookup.capabilityOwner, "recovery");
  assert.equal(lookup.accessMode, "read");
  assert.equal(lookup.mutationClassification, "none");
  assert.equal(lookup.transactionRequirement, "read-consistent");
  assert.equal(lookup.commitUnknownFollowUp, "not-applicable");
  assert.equal(lookup.reconciliationRequirement, "none");
  assert.equal(lookup.readBoundary, "authoritative-state");
  assert.deepEqual(lookup.authoritativeStates, [
    "processing",
    "completed",
    "failed",
    "released",
  ]);
  assert.equal(lookup.exposesReservationEvidence, false);
  assert.equal(lookup.resultReferenceVisibility, "completed-only");
  assert.equal(lookup.issuesNewFence, false);
  assert.equal(lookup.updatesLease, false);
  assert.equal(lookup.updatesRevision, false);
});

test("takeover retains ownership and new-fence boundaries", () => {
  const takeover =
    MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.takeover;

  assert.equal(takeover.capabilityOwner, "recovery");
  assert.equal(takeover.accessMode, "write");
  assert.equal(takeover.mutationClassification, "ownership-takeover");
  assert.equal(takeover.transactionRequirement, "required");
  assert.notEqual(
    takeover.transactionRequirement,
    "workflow-completion-transaction",
  );
  assert.equal(
    takeover.commitUnknownFollowUp,
    "reservation-reconciliation",
  );
  assert.equal(takeover.reconciliationRequirement, "reservation-mutation");
  assert.equal(takeover.targetState, "stale-processing-only");
  assert.equal(takeover.issuesNewFence, true);
  assert.equal(takeover.advancesReservationAttempt, true);
  assert.equal(takeover.advancesRevision, true);
  assert.equal(takeover.updatesLeaseExpiry, true);
  assert.equal(takeover.comparesPreviousOwnership, true);
  assert.equal(takeover.requestedNextReservationIdentity, "retained");
  assert.equal(takeover.requestedNextLeaseIdentity, "retained");
  assert.equal(takeover.callerGeneratedFenceAllowed, false);
  assert.equal(
    takeover.callerGeneratedAuthoritativeLeaseExpiryAllowed,
    false,
  );
});

test("request builder retains existing recovery and reconciliation inputs", () => {
  const lookupRuntimeRequest =
    MULTI_CUT_REPLAY_RECOVERY_RUNTIME_REQUEST_BUILDER.build(
      MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.lookup,
      lookupRequest,
    );
  const takeoverRuntimeRequest =
    MULTI_CUT_REPLAY_RECOVERY_RUNTIME_REQUEST_BUILDER.build(
      MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.takeover,
      takeoverRequest,
    );

  assert.equal(Object.isFrozen(lookupRuntimeRequest), true);
  assert.equal(Object.isFrozen(lookupRuntimeRequest.parameters), true);
  assert.equal(
    lookupRuntimeRequest.parameters.recoveryInput,
    lookupRequest.recoveryInput,
  );
  assert.equal(
    takeoverRuntimeRequest.parameters.recoveryInput,
    takeoverRequest.recoveryInput,
  );
  assert.equal(
    takeoverRuntimeRequest.parameters.reconciliationInput,
    takeoverRequest.reconciliationInput,
  );
  assert.equal(takeoverRuntimeRequest.transactionContext.scope, "required");
});

test("adapter wires fixed dispatch and projection hooks", async () => {
  const invoked: string[] = [];
  const projected: string[] = [];
  const adapter = createMultiCutReplayRecoveryStatementAdapter({
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
    reconciliationHook: {
      projectReconciliation: (context) => context.executionResult.status,
    },
  });

  await adapter.dispatchLookup(lookupRequest);
  await adapter.dispatchTakeover(takeoverRequest);

  assert.deepEqual(invoked, projected);
  assert.deepEqual(
    invoked,
    Object.values(MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS).map(
      (binding) => binding.statementId,
    ),
  );
});

test("takeover commit unknown routes only to the reconciliation hook boundary", async () => {
  let failureCalls = 0;
  let reconciliationCalls = 0;
  const adapter = createMultiCutReplayRecoveryStatementAdapter({
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
      projectFailure: () => {
        failureCalls += 1;
        return "failure";
      },
    },
    reconciliationHook: {
      projectReconciliation: (context) => {
        reconciliationCalls += 1;
        return context.executionResult.status;
      },
    },
  });

  const result = await adapter.dispatchTakeover(takeoverRequest);

  assert.equal(result.status, "failure-projected");
  assert.equal(failureCalls, 0);
  assert.equal(reconciliationCalls, 1);
  assert.equal(
    MULTI_CUT_REPLAY_RECOVERY_STATEMENT_BINDINGS.takeover
      .reconciliationBoundary.algorithmOwner,
    "recovery-capability",
  );
});

test("ordinary takeover failure remains on the failure hook", async () => {
  let failureCalls = 0;
  let reconciliationCalls = 0;
  const adapter = createMultiCutReplayRecoveryStatementAdapter({
    executor: {
      executeStatement: async (request) =>
        Object.freeze({
          resultVersion: "1.0",
          status: "failed",
          statementId: request.statementId,
          affectedRowInterpretation: "zero",
          opaquePayload: undefined,
          executionMetadata: Object.freeze({
            metadataVersion: "1.0",
            transactionScope: request.transactionContext.scope,
            affectedRowInterpretation: "zero",
          }),
          failure: "invariant-violation",
          commitUnknown: "not-unknown",
          retry: "not-retryable",
        }),
    },
    projectionHook: {
      project: () => "projection",
    },
    failureHook: {
      projectFailure: (context) => {
        failureCalls += 1;
        return context.executionResult.status;
      },
    },
    reconciliationHook: {
      projectReconciliation: () => {
        reconciliationCalls += 1;
        return "reconciliation";
      },
    },
  });

  await adapter.dispatchTakeover(takeoverRequest);
  assert.equal(failureCalls, 1);
  assert.equal(reconciliationCalls, 0);
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
    lifecycleAdapterSource,
  ] = await Promise.all([
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayRecoveryStatementAdapter/types.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayRecoveryStatementAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayRecoveryStatementAdapter/index.ts",
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
    readFile(
      new URL(
        "../../../lib/server/multiCutReplayLifecycleStatementAdapter/adapter.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const source = `${typesSource}\n${adapterSource}\n${indexSource}`;

  assert.match(typesSource, /import\s+type[\s\S]*multiCutReplayLifecycle/);
  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|node:fs|filesystem|process\.env|globalThis|Date\.now|Math\.random|fetch\s*\(|database client|query builder|transaction implementation)/i,
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
  assert.doesNotMatch(
    adapterSource,
    /multiCutReplay(?:Resolution|Lifecycle)StatementAdapter/,
  );
  for (const upstream of [
    runtimeSource,
    portSource,
    catalogSource,
    resolutionAdapterSource,
    lifecycleAdapterSource,
  ]) {
    assert.doesNotMatch(
      upstream,
      /multiCutReplayRecoveryStatementAdapter/,
    );
  }
});
