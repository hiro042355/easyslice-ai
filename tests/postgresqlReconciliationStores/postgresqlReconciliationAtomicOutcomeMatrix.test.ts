import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import {
  createDurableWorkflowTransactionManagerV2,
  durableTransactionSuccess,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  createPostgreSQLReconciliationAtomicExecutorV2,
  createPostgreSQLReconciliationObservationStore,
  createPostgreSQLReconciliationOutboxStore,
  createPostgreSQLReconciliationRequestStore,
  createPostgreSQLReconciliationRequestStoreV2,
  createPostgreSQLReconciliationResolutionStore,
  createPostgreSQLReconciliationResolutionStoreV2,
  registerPostgreSQLReconciliationStatements,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {
  ProtectedIdentity,
  ReconciliationAtomicInputV2,
  ReconciliationDigestDomain,
  ReconciliationFingerprintDomain,
  ReconciliationRequestDraft,
  SemanticFingerprint,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = (prefix = "b") => {
  let value = 1100;
  return Object.freeze({
    generatorVersion: "1.0" as const,
    generate: () => `${prefix}0000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  });
};
const invalidIds = Object.freeze({ generatorVersion: "1.0" as const, generate: () => "invalid" });
const options = Object.freeze({
  isolation: "read-committed" as const,
  accessMode: "read-write" as const,
  deadlineMonotonicMilliseconds: 100000,
});
const clock = Object.freeze({ nowUtc: () => "2026-07-17T00:00:00.000Z", monotonicMilliseconds: () => 1 });

type OutcomeCase =
  | "created"
  | "replayed"
  | "partial-replay"
  | "semantic-conflict"
  | "stale-revision"
  | "stale-fence"
  | "wrong-prior-state"
  | "terminal-preserved"
  | "decode-validation"
  | "writer-epoch-mismatch";

const outcomeCases: readonly OutcomeCase[] = Object.freeze([
  "created",
  "replayed",
  "partial-replay",
  "semantic-conflict",
  "stale-revision",
  "stale-fence",
  "wrong-prior-state",
  "terminal-preserved",
  "decode-validation",
  "writer-epoch-mismatch",
]);

for (const [caseIndex, caseLabel] of outcomeCases.entries()) {
  test(`Fixture Group 5 verifies Atomic V2 ${caseLabel} without partial state`, async () =>
    withPostgreSqlTestEnvironment(async environment => {
      const bridge = new SliceATestStatementBridge({
        ...environment.connection,
        maxConnections: 8,
        connectionTimeoutMs: 5000,
        idleTimeoutMs: 5000,
        applicationName: `reconciliation-atomic-outcome-${caseLabel}`,
        tls: { mode: "disabled" },
      });
      assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
      assert.equal(await bridge.start(), "ready");
      const seed = 20 + caseIndex * 8;
      const generator = ids();
      const requestsV1 = createPostgreSQLReconciliationRequestStore(generator);
      const requestsV2 = createPostgreSQLReconciliationRequestStoreV2(requestsV1);
      const observations =
        caseLabel === "decode-validation"
          ? createPostgreSQLReconciliationObservationStore(invalidIds)
          : createPostgreSQLReconciliationObservationStore(generator);
      const setupObservations = createPostgreSQLReconciliationObservationStore(generator);
      const resolutionsV1 = createPostgreSQLReconciliationResolutionStore(generator);
      const resolutionsV2 = createPostgreSQLReconciliationResolutionStoreV2(resolutionsV1, generator);
      const outbox = createPostgreSQLReconciliationOutboxStore(generator);
      const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
      const tenant = identity("tenant", seed);
      const owner = identity("claim-owner", seed + 1);
      const tx = async <T>(operation: Parameters<typeof manager.runInTransaction<T>>[1]) => {
        const result = await manager.runInTransaction(options, operation);
        if (result.status !== "committed") throw new Error("safe-atomic-matrix-setup");
        return result.value;
      };
      try {
        const request: ReconciliationRequestDraft = Object.freeze({
          identity: identity("reconciliation-request", seed + 2),
          tenant,
          workflow: identity("workflow", seed + 3),
          fingerprint: fingerprint("reconciliation-request-semantic", seed + 2),
          reconciliationClass: "database-commit-unknown",
          operation: "generate-music",
          region: "test-region",
          state: "pending-observation",
          policyClass: "immediate-database",
          maxObservations: 8,
          maxAttempts: 4,
          writerEpoch: "1",
          nextEligibleAt: "2027-01-01T00:00:00.000Z",
          policyDeadlineAt: "2027-01-02T00:00:00.000Z",
          retentionClass: "reconciliation-standard",
        });
        const createdParent = await tx(async context =>
          durableTransactionSuccess(await requestsV1.createIfAbsent(context, request)),
        );
        if (createdParent.status !== "created") throw new Error("safe-atomic-matrix-parent");
        const expiry = String(
          (await environment.pool.query("SELECT (transaction_timestamp()+interval '1 hour')::text value")).rows[0]
            .value,
        );
        const claimed = await tx(async context =>
          durableTransactionSuccess(
            await requestsV1.claimDue(
              context,
              { owner, expectedFence: "0", writerEpoch: "1", leaseExpiresAt: expiry },
              1,
            ),
          ),
        );
        assert.equal(claimed.length, 1, "safe-atomic-matrix-claim-count");
        let parent = claimed[0];
        if (!parent) throw new Error("safe-atomic-matrix-claim-missing");
        const observation = Object.freeze({
          requestId: parent.id,
          identity: identity("observation", seed + 4),
          tenant,
          fingerprint: fingerprint("observation-semantic", seed + 4),
          sequence: "1",
          source: "slice-a-store",
          result: "committed",
          evidence: "authoritative-summary",
          attempt: 1,
          observedAt: "2020-01-01T00:00:00.000Z",
          payload: Object.freeze({ status: "committed", outcomeVersion: 1 }),
        });
        const resolution = Object.freeze({
          requestId: parent.id,
          identity: identity("resolution", seed + 5),
          tenant,
          fingerprint: fingerprint("resolution-semantic", seed + 5),
          sequence: "1",
          resolutionClass: "committed",
          reasonCode: "database-commit-acknowledgement-lost",
          summary: Object.freeze({ status: "committed", outcomeVersion: 1, authoritative: true }),
          committedRevision: String(Number(parent.revision) + 1),
          resolvedAt: "2020-01-01T00:00:00.000Z",
        });
        const event = Object.freeze({
          requestId: parent.id,
          identity: identity("reconciliation-outbox", seed + 6),
          tenant,
          fingerprint: fingerprint("reconciliation-outbox-semantic", seed + 6),
          eventType: "reconciliation.atomic-v2",
          payload: Object.freeze({ status: "committed", outcomeVersion: 1 }),
          nextEligibleAt: "2027-01-01T00:00:00.000Z",
          retentionClass: "reconciliation-standard",
        });
        if (caseLabel === "wrong-prior-state") {
          const observing = await tx(async context =>
            durableTransactionSuccess(
              await requestsV2.transitionV2(context, {
                identity: request.identity,
                expectedRevision: parent.revision,
                expectedPriorStates: ["claimed"],
                authority: {
                  writerEpoch: parent.writerEpoch,
                  expectedFence: parent.fencingRevision,
                  owner,
                },
                nextState: "observing",
              }),
            ),
          );
          if (observing.status !== "updated") throw new Error("safe-atomic-prior-setup");
          parent = observing.record;
        }
        if (caseLabel === "terminal-preserved") {
          const terminal = await tx(async context =>
            durableTransactionSuccess(
              await requestsV2.transitionV2(context, {
                identity: request.identity,
                expectedRevision: parent.revision,
                expectedPriorStates: ["claimed"],
                authority: {
                  writerEpoch: parent.writerEpoch,
                  expectedFence: parent.fencingRevision,
                  owner,
                },
                nextState: "cancelled",
                resolutionClass: "cancelled",
              }),
            ),
          );
          if (terminal.status !== "updated") throw new Error("safe-atomic-terminal-setup");
          parent = terminal.record;
        }
        const baseInput: ReconciliationAtomicInputV2 = Object.freeze({
          observation,
          requestIdentity: request.identity,
          expectedRevision: parent.revision,
          expectedPriorStates:
            caseLabel === "wrong-prior-state" ? (["claimed"] as const) : (["claimed"] as const),
          authority: Object.freeze({
            writerEpoch: parent.writerEpoch,
            expectedFence: parent.fencingRevision,
            owner,
          }),
          nextState: "resolved",
          resolution,
          outbox: event,
        });
        if (caseLabel === "replayed" || caseLabel === "partial-replay") {
          const observationSetup = await tx(async context =>
            durableTransactionSuccess(await setupObservations.appendIfAbsent(context, observation)),
          );
          assert.equal(observationSetup.status, "created", "safe-atomic-replay-observation");
          if (caseLabel === "replayed") {
            const resolutionSetup = await tx(async context =>
              durableTransactionSuccess(
                await resolutionsV2.appendForAtomicTransitionV2(context, {
                  draft: resolution,
                  requestIdentity: request.identity,
                  expectedRequestRevision: parent.revision,
                  expectedPriorStates: ["claimed"],
                  authority: baseInput.authority,
                }),
              ),
            );
            const outboxSetup = await tx(async context =>
              durableTransactionSuccess(await outbox.appendIfAbsent(context, event)),
            );
            assert.equal(resolutionSetup.status, "created", "safe-atomic-replay-resolution");
            assert.equal(outboxSetup.status, "created", "safe-atomic-replay-outbox");
          }
        }
        if (caseLabel === "semantic-conflict") {
          const conflictObservation = Object.freeze({
            ...observation,
            fingerprint: fingerprint("observation-semantic", seed + 7),
            payload: Object.freeze({ status: "conflict-seed", outcomeVersion: 2 }),
          });
          const setup = await tx(async context =>
            durableTransactionSuccess(await setupObservations.appendIfAbsent(context, conflictObservation)),
          );
          assert.equal(setup.status, "created", "safe-atomic-conflict-setup");
        }
        const countsBefore = (
          await environment.pool.query(
            "SELECT (SELECT count(*)::int FROM workflow.workflow_reconciliation_observations WHERE reconciliation_id=$1) observations,(SELECT count(*)::int FROM workflow.workflow_reconciliation_resolutions WHERE reconciliation_id=$1) resolutions,(SELECT count(*)::int FROM workflow.workflow_reconciliation_outbox_events WHERE reconciliation_id=$1) outbox",
            [parent.id],
          )
        ).rows[0];
        const parentBefore = parent;
        const input: ReconciliationAtomicInputV2 =
          caseLabel === "stale-revision"
            ? Object.freeze({ ...baseInput, expectedRevision: String(Math.max(0, Number(parent.revision) - 1)) })
            : caseLabel === "stale-fence"
              ? Object.freeze({
                  ...baseInput,
                  authority: Object.freeze({ ...baseInput.authority, expectedFence: "0" }),
                })
              : caseLabel === "writer-epoch-mismatch"
                ? Object.freeze({
                    ...baseInput,
                    authority: Object.freeze({ ...baseInput.authority, writerEpoch: "999" }),
                  })
                : baseInput;
        const executor = createPostgreSQLReconciliationAtomicExecutorV2(manager, options, {
          requests: requestsV2,
          observations,
          resolutions: resolutionsV2,
          outbox,
        });
        const result = await executor.execute(input);
        const expected =
          caseLabel === "created" || caseLabel === "partial-replay"
            ? { status: "committed", outcome: "created" }
            : caseLabel === "replayed"
              ? { status: "committed", outcome: "replayed" }
              : caseLabel === "semantic-conflict"
                ? { status: "conflict", conflictClass: "semantic-conflict" }
                : caseLabel === "stale-revision"
                  ? { status: "conflict", conflictClass: "stale-revision" }
                  : caseLabel === "stale-fence"
                    ? { status: "conflict", conflictClass: "stale-fence" }
                    : caseLabel === "wrong-prior-state"
                      ? { status: "conflict", conflictClass: "wrong-prior-state" }
                      : caseLabel === "terminal-preserved"
                        ? { status: "conflict", conflictClass: "terminal-preserved" }
                        : caseLabel === "decode-validation"
                          ? { status: "corrupted" }
                          : { status: "conflict", conflictClass: "writer-epoch-mismatch" };
        assert.deepEqual(result, expected, `safe-atomic-${caseLabel}-result`);
        const countsAfter = (
          await environment.pool.query(
            "SELECT (SELECT count(*)::int FROM workflow.workflow_reconciliation_observations WHERE reconciliation_id=$1) observations,(SELECT count(*)::int FROM workflow.workflow_reconciliation_resolutions WHERE reconciliation_id=$1) resolutions,(SELECT count(*)::int FROM workflow.workflow_reconciliation_outbox_events WHERE reconciliation_id=$1) outbox",
            [parent.id],
          )
        ).rows[0];
        const parentAfterResult = await tx(async context =>
          durableTransactionSuccess(await requestsV1.readInTransaction(context, request.identity)),
        );
        if (parentAfterResult.status !== "found") throw new Error("safe-atomic-parent-after");
        const parentAfter = parentAfterResult.record;
        const succeeds = ["created", "replayed", "partial-replay"].includes(caseLabel);
        if (succeeds) {
          assert.equal(countsAfter.observations, 1, `safe-atomic-${caseLabel}-observation`);
          assert.equal(countsAfter.resolutions, 1, `safe-atomic-${caseLabel}-resolution`);
          assert.equal(countsAfter.outbox, 1, `safe-atomic-${caseLabel}-outbox`);
          assert.equal(Number(parentAfter.revision) - Number(parentBefore.revision) === 1, true, `safe-atomic-${caseLabel}-revision`);
          assert.equal(parentAfter.state === "resolved", true, `safe-atomic-${caseLabel}-terminal`);
        } else {
          assert.equal(countsAfter.observations === countsBefore.observations, true, `safe-atomic-${caseLabel}-observation-rollback`);
          assert.equal(countsAfter.resolutions === countsBefore.resolutions, true, `safe-atomic-${caseLabel}-resolution-rollback`);
          assert.equal(countsAfter.outbox === countsBefore.outbox, true, `safe-atomic-${caseLabel}-outbox-rollback`);
          assert.equal(parentAfter.revision === parentBefore.revision, true, `safe-atomic-${caseLabel}-revision-rollback`);
          assert.equal(parentAfter.state === parentBefore.state, true, `safe-atomic-${caseLabel}-state-rollback`);
        }
        assert.equal(parentAfter.writerEpoch === parentBefore.writerEpoch, true, `safe-atomic-${caseLabel}-writer`);
        assert.equal(parentAfter.fencingRevision === parentBefore.fencingRevision, true, `safe-atomic-${caseLabel}-fence`);
      } finally {
        assert.equal(manager.dispose(), "disposed");
        assert.equal(await bridge.close(), "closed");
      }
    }));
}
