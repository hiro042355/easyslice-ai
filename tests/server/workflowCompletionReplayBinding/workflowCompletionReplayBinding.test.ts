import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkflowCompletionReplayBinding,
  type WorkflowCompletionReplayBindingInputV1,
} from "../../../lib/server/workflowCompletionReplayBinding";
import type {
  MultiCutReplayLifecycleCompleteAdapterResultV1,
  MultiCutReplayLifecycleCompleteProductionAdapter,
} from "../../../lib/server/multiCutReplayLifecycle";
import {
  createDefaultMultiCutReplayLifecycleCompleteProductionAdapter,
} from "../../../lib/server/multiCutReplayLifecycle";
import {
  createMultiCutReplayCompleteTransactionParticipantV2,
} from "../../../lib/server/multiCutReplayPostgresqlTransactionParticipation";
import type {
  DurableWorkflowSameSessionQueryCapability,
  DurableWorkflowTransactionContext,
  DurableWorkflowTransactionContextV3,
} from "../../../lib/server/productionWorkflowRuntime/durableTransaction";

const evidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  sessionScope: "workflow-transaction" as const,
  sessionAffinity: "same-session-required" as const,
  transactionOwnership: "workflow-owner" as const,
  separateConnectionPermitted: false as const,
  capabilityOwnsLifecycle: false as const,
  validOnlyDuringActiveTransaction: true as const,
});

const preParticipation = (): MultiCutReplayLifecycleCompleteAdapterResultV1 =>
  Object.freeze({
    schemaVersion: "1.0",
    contractVersion: "1.0",
    kind: "pre-participation-failure",
    phase: "participation-request-validation",
    reason: "identity-mismatch",
    evidence: Object.freeze({
      statementId: "complete-processing-replay",
      operationIdentity: "complete-replay-participation",
      participantInvoked: false,
      replayParticipationStarted: false,
      queryExecuted: false,
      replayMutationAttempted: false,
      adapterRetryAttempted: false,
      recoveryExecuted: false,
      ownerAction: "do-not-commit",
    }),
  });

const context = (
  capability: DurableWorkflowSameSessionQueryCapability,
): DurableWorkflowTransactionContextV3 => Object.freeze({
  contextVersion: "3.0",
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
  sameSessionQuery: capability,
});

const input = (
  capability: DurableWorkflowSameSessionQueryCapability,
): WorkflowCompletionReplayBindingInputV1 => {
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
  return Object.freeze({
    inputVersion: "1.0",
    transactionContext: context(capability),
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
};

test("factory exposes one versioned execution method", () => {
  const adapter: MultiCutReplayLifecycleCompleteProductionAdapter =
    Object.freeze({ complete: async () => preParticipation() });
  const binding = createWorkflowCompletionReplayBinding({
    lifecycleCompleteAdapter: adapter,
  });
  assert.deepEqual(Object.keys(binding).sort(), [
    "bindingVersion",
    "executeReplayCompletion",
  ]);
  assert.equal(binding.bindingVersion, "1.0");
});

test("Context V3 capability is adapted to the many-only Query Port V2 exactly once", async () => {
  let capabilityCalls = 0;
  let adapterCalls = 0;
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    async executeQuery(request) {
      capabilityCalls += 1;
      assert.equal(request.expectedResult, "many");
      assert.equal(request.statementId, "complete-processing-replay");
      assert.equal(request.values[0]?.kind, "bigint");
      return Object.freeze({
        resultVersion: "1.0",
        status: "success",
        rows: Object.freeze([Object.freeze({ revision: "2" })]),
        rowCount: 1,
        command: "UPDATE",
      });
    },
  });
  const adapter: MultiCutReplayLifecycleCompleteProductionAdapter =
    Object.freeze({
      async complete(request) {
        adapterCalls += 1;
        const result = await request.authority.queryPort.execute(Object.freeze({
          requestVersion: "1.0",
          statementId: "complete-processing-replay",
          sql: "UPDATE replay SET revision = $1::bigint",
          parameters: Object.freeze([Object.freeze({
            ordinal: 1,
            token: "$1",
            postgresqlCast: "bigint",
            physicalField: "revision",
            parameterBinding: "expected_revision",
            value: "1",
          })]),
          values: Object.freeze(["1"]),
        }));
        assert.equal(result.kind, "success");
        if (result.kind === "success") {
          assert.equal(result.command, "UPDATE");
          assert.equal(result.rowCount, 1);
        }
        return preParticipation();
      },
    });
  const result = await createWorkflowCompletionReplayBinding({
    lifecycleCompleteAdapter: adapter,
  }).executeReplayCompletion(input(capability));
  assert.ok("kind" in result);
  if ("kind" in result) assert.equal(result.kind, "pre-participation-failure");
  assert.equal(adapterCalls, 1);
  assert.equal(capabilityCalls, 1);
});

test("transport issue and safe diagnostics pass through without inference", async () => {
  let projectedIssue: string | undefined;
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    executeQuery: async () => Object.freeze({
      resultVersion: "1.0",
      status: "execution-failure",
      phase: "query",
      classification: "connection-unavailable",
      safeReason: "postgresql-connection-unavailable",
      sqlStateClass: "08",
      queryConnectionDisposition: "must-discard",
    }),
  });
  const adapter: MultiCutReplayLifecycleCompleteProductionAdapter =
    Object.freeze({
      async complete(request) {
        const result = await request.authority.queryPort.execute(Object.freeze({
          requestVersion: "1.0",
          statementId: "complete-processing-replay",
          sql: "SELECT 1",
          parameters: Object.freeze([]),
          values: Object.freeze([]),
        }));
        assert.equal(result.kind, "execution-failure");
        if (result.kind === "execution-failure") {
          projectedIssue = result.issue;
          assert.equal(result.classification, "execution-failure");
          assert.equal(result.safeReason, "postgresql-connection-unavailable");
          assert.equal(result.sqlStateClass, "08");
          assert.equal(result.queryConnectionDisposition, "must-discard");
        }
        return preParticipation();
      },
    });
  await createWorkflowCompletionReplayBinding({
    lifecycleCompleteAdapter: adapter,
  }).executeReplayCompletion(input(capability));
  assert.equal(projectedIssue, "connection-unavailable");
});

test("production completion path invokes capability, adapter, participant, and statement once", async () => {
  let capabilityCalls = 0;
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    async executeQuery(request) {
      capabilityCalls += 1;
      assert.equal(request.statementId, "complete-processing-replay");
      assert.equal(request.expectedResult, "many");
      return Object.freeze({
        resultVersion: "1.0",
        status: "success",
        rows: Object.freeze([Object.freeze({
          revision: "2",
          result_reference_version: "1.0",
          result_reference_identity: "result:1",
          terminal_metadata_version: "1.0",
          terminal_at: "2026-08-02T00:00:02.000Z",
          terminal_classification: "workflow-completed",
        })]),
        rowCount: 1,
        command: "UPDATE",
      });
    },
  });
  const adapter = createDefaultMultiCutReplayLifecycleCompleteProductionAdapter(
    createMultiCutReplayCompleteTransactionParticipantV2(),
  );
  const result = await createWorkflowCompletionReplayBinding({
    lifecycleCompleteAdapter: adapter,
  }).executeReplayCompletion(input(capability));
  assert.ok("status" in result);
  if ("status" in result) {
    assert.equal(result.status, "completed");
    assert.equal(result.ownerAction, "continue-transaction");
    assert.equal(result.durability, "pending-owner-commit");
  }
  assert.equal(capabilityCalls, 1);
});

test("pre-participation result is returned unchanged and executes no query", async () => {
  let capabilityCalls = 0;
  const expected = preParticipation();
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    executeQuery: async () => {
      capabilityCalls += 1;
      throw new Error("must-not-run");
    },
  });
  const adapter: MultiCutReplayLifecycleCompleteProductionAdapter =
    Object.freeze({ complete: async () => expected });
  const actual = await createWorkflowCompletionReplayBinding({
    lifecycleCompleteAdapter: adapter,
  }).executeReplayCompletion(input(capability));
  assert.equal(actual, expected);
  assert.equal(capabilityCalls, 0);
});

test("binding copy-isolates lifecycle and authority inputs", async () => {
  const capability: DurableWorkflowSameSessionQueryCapability = Object.freeze({
    capabilityVersion: "1.0",
    evidence,
    executeQuery: async () => Object.freeze({
      resultVersion: "1.0",
      status: "success",
      rows: Object.freeze([]),
      rowCount: 0,
      command: "UPDATE",
    }),
  });
  const source = input(capability);
  const adapter: MultiCutReplayLifecycleCompleteProductionAdapter =
    Object.freeze({
      async complete(request) {
        assert.notEqual(request.input, source.lifecycleInput);
        assert.notEqual(
          request.input.replayIdentity,
          source.lifecycleInput.replayIdentity,
        );
        assert.notEqual(
          request.authority.authoritativeReplayIdentity,
          source.authority.authoritativeReplayIdentity,
        );
        assert.ok(Object.isFrozen(request.input));
        assert.ok(Object.isFrozen(request.input.reservationEvidence));
        assert.ok(Object.isFrozen(request.authority));
        return preParticipation();
      },
    });
  await createWorkflowCompletionReplayBinding({
    lifecycleCompleteAdapter: adapter,
  }).executeReplayCompletion(source);
});

test("Context V2 is not accepted by the public binding input", () => {
  type BindingInput = Parameters<
    ReturnType<typeof createWorkflowCompletionReplayBinding>["executeReplayCompletion"]
  >[0];
  type Context = BindingInput["transactionContext"];
  const acceptsV3 = (_context: Context): void => {};
  const rejectsV2 = (contextV2: DurableWorkflowTransactionContext): void => {
    // @ts-expect-error Context V2 has no mandatory same-session query capability.
    acceptsV3(contextV2);
  };
  assert.equal(typeof rejectsV2, "function");
});
