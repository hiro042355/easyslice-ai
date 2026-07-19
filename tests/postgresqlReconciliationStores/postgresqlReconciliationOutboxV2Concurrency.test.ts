import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import { createDurableWorkflowTransactionManagerV2, durableTransactionSuccess } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  createPostgreSQLReconciliationOutboxStore,
  createPostgreSQLReconciliationOutboxStoreV2,
  createPostgreSQLReconciliationRequestStore,
  registerPostgreSQLReconciliationStatements,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {
  ProtectedIdentity,
  ReconciliationDigestDomain,
  ReconciliationFingerprintDomain,
  ReconciliationOutboxDraft,
  ReconciliationRequestDraft,
  SemanticFingerprint,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = () => {
  let value = 800;
  return Object.freeze({
    generatorVersion: "1.0" as const,
    generate: () => `80000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  });
};
const options = Object.freeze({
  isolation: "read-committed" as const,
  accessMode: "read-write" as const,
  deadlineMonotonicMilliseconds: 100000,
});
const clock = Object.freeze({ nowUtc: () => "2026-07-17T00:00:00.000Z", monotonicMilliseconds: () => 1 });

const createBarrier = (parties: number) => {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === parties) release();
    await gate;
  };
};

const sameIdentity = (
  left: ProtectedIdentity<"reconciliation-outbox">,
  right: ProtectedIdentity<"reconciliation-outbox">,
) =>
  left.domain === right.domain &&
  left.algorithm === right.algorithm &&
  left.algorithmVersion === right.algorithmVersion &&
  left.digest.length === right.digest.length &&
  left.digest.every((value, index) => value === right.digest[index]);

for (const race of ["delivery", "takeover"] as const) {
  test(`Fixture Group 2 verifies deterministic Outbox V2 ${race} race`, async () =>
    withPostgreSqlTestEnvironment(async environment => {
      const bridge = new SliceATestStatementBridge({
        ...environment.connection,
        maxConnections: 8,
        connectionTimeoutMs: 5000,
        idleTimeoutMs: 5000,
        applicationName: `reconciliation-outbox-v2-${race}-race`,
        tls: { mode: "disabled" },
      });
      assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
      assert.equal(await bridge.start(), "ready");
      const seed = race === "delivery" ? 81 : 91;
      const generator = ids();
      const requests = createPostgreSQLReconciliationRequestStore(generator);
      const outboxV1 = createPostgreSQLReconciliationOutboxStore(generator);
      const outboxV2 = createPostgreSQLReconciliationOutboxStoreV2();
      const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
      const tenant = identity("tenant", seed);
      const workflow = identity("workflow", seed + 1);
      const originalOwner = identity("claim-owner", seed + 2);
      const run = <T>(operation: (context: Parameters<typeof outboxV2.transitionV2>[0]) => Promise<T>) =>
        manager.runInTransaction(options, async context => durableTransactionSuccess(await operation(context)));
      try {
        const request: ReconciliationRequestDraft = Object.freeze({
          identity: identity("reconciliation-request", seed + 3),
          tenant,
          workflow,
          fingerprint: fingerprint("reconciliation-request-semantic", seed + 3),
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
        const parent = await run(context => requests.createIfAbsent(context, request));
        if (parent.status !== "committed" || parent.value.status !== "created") {
          throw new Error("safe-group2-parent");
        }
        const draft: ReconciliationOutboxDraft = Object.freeze({
          requestId: parent.value.record.id,
          identity: identity("reconciliation-outbox", seed + 4),
          tenant,
          fingerprint: fingerprint("reconciliation-outbox-semantic", seed + 4),
          eventType: "reconciliation.concurrent-v2",
          payload: Object.freeze({ marker: seed, status: "pending" }),
          nextEligibleAt: "2027-01-01T00:00:00.000Z",
          retentionClass: "reconciliation-standard",
        });
        const created = await run(context => outboxV1.appendIfAbsent(context, draft));
        assert.equal(created.status, "committed");
        const leaseExpiresAt = String(
          (
            await environment.pool.query(
              `SELECT (transaction_timestamp()+interval '${race === "delivery" ? "1 hour" : "100 milliseconds"}')::text value`,
            )
          ).rows[0].value,
        );
        const claimed = await run(context =>
          outboxV1.claimBatch(
            context,
            { owner: originalOwner, expectedFence: "0", writerEpoch: "1", leaseExpiresAt },
            1,
          ),
        );
        assert.equal(claimed.status, "committed", "safe-group2-claim-status");
        if (claimed.status !== "committed") throw new Error("safe-group2-claim-unavailable");
        assert.equal(claimed.value.length, 1, "safe-group2-claim-count");
        const target = claimed.value[0];
        if (!target) throw new Error("safe-group2-claim-missing");
        assert.equal(sameIdentity(target.identity, draft.identity), true, "safe-group2-fixture-isolation");
        const before = (
          await environment.pool.query(
            "SELECT revision::text,fencing_revision::text,safe_payload FROM workflow.workflow_reconciliation_outbox_events WHERE event_id=$1",
            [target.id],
          )
        ).rows[0];
        const barrier = createBarrier(2);
        if (race === "delivery") {
          const guard = Object.freeze({
            identity: draft.identity,
            expectedFingerprint: draft.fingerprint,
            expectedRevision: target.revision,
            expectedSourceState: "claimed" as const,
            expectedOwner: target.claimOwner!,
            expectedFence: target.fencingRevision,
          });
          const results = await Promise.all([
            (async () => {
              await barrier();
              return run(context => outboxV2.transitionV2(context, { ...guard, targetState: "delivered" }));
            })(),
            (async () => {
              await barrier();
              return run(context =>
                outboxV2.transitionV2(context, {
                  ...guard,
                  targetState: "reconciliation-required",
                  safeFailureClass: "delivery-unknown",
                }),
              );
            })(),
          ]);
          const values = results.map(result => {
            assert.equal(result.status, "committed", "safe-delivery-race-transaction");
            if (result.status !== "committed") throw new Error("safe-delivery-race-unavailable");
            return result.value;
          });
          assert.equal(values.filter(value => value.status === "updated").length, 1, "delivery-race-winner-count");
          assert.equal(
            values.filter(
              value => value.status === "conflict" && value.conflictClass === "terminal-preserved",
            ).length,
            1,
            "delivery-race-loser-count",
          );
          assert.ok(values.every(value => value.providerSubmitPermitted === false));
          const row = (
            await environment.pool.query(
              "SELECT delivery_state,revision::text,safe_payload FROM workflow.workflow_reconciliation_outbox_events WHERE event_id=$1",
              [target.id],
            )
          ).rows[0];
          assert.equal(["delivered", "reconciliation-required"].includes(row.delivery_state), true);
          assert.equal(row.revision, String(Number(before.revision) + 1));
          assert.equal(JSON.stringify(row.safe_payload) === JSON.stringify(before.safe_payload), true);
        } else {
          let databaseExpired = false;
          for (let attempt = 0; attempt < 1000 && !databaseExpired; attempt += 1) {
            databaseExpired =
              (
                await environment.pool.query(
                  "SELECT transaction_timestamp()>=$1::timestamptz expired",
                  [leaseExpiresAt],
                )
              ).rows[0].expired === true;
          }
          assert.equal(databaseExpired, true, "database-authoritative-expiry");
          const ownerB = identity("claim-owner", seed + 5);
          const ownerC = identity("claim-owner", seed + 6);
          const renewedLeaseExpiresAt = String(
            (await environment.pool.query("SELECT (transaction_timestamp()+interval '1 hour')::text value")).rows[0]
              .value,
          );
          const takeover = (newOwner: ProtectedIdentity<"claim-owner">) =>
            outboxV2.takeoverExpiredLeaseV2 as typeof outboxV2.takeoverExpiredLeaseV2;
          const results = await Promise.all(
            [ownerB, ownerC].map(newOwner =>
              (async () => {
                await barrier();
                return run(context =>
                  takeover(newOwner)(context, {
                    identity: draft.identity,
                    expectedRevision: target.revision,
                    expectedSourceState: "claimed",
                    expectedFence: target.fencingRevision,
                    newOwner,
                    leaseExpiresAt: renewedLeaseExpiresAt,
                  }),
                );
              })(),
            ),
          );
          const values = results.map(result => {
            assert.equal(result.status, "committed", "safe-takeover-race-transaction");
            if (result.status !== "committed") throw new Error("safe-takeover-race-unavailable");
            return result.value;
          });
          assert.equal(
            values.filter(value => value.status === "updated" && value.outcome === "taken-over").length,
            1,
            "takeover-race-winner-count",
          );
          assert.equal(
            values.filter(value => value.status === "conflict" && value.conflictClass === "stale-fence").length,
            1,
            "takeover-race-loser-count",
          );
          assert.ok(values.every(value => value.providerSubmitPermitted === false));
          const row = (
            await environment.pool.query(
              "SELECT revision::text,fencing_revision::text,claim_owner_digest=$2 owner_b,claim_owner_digest=$3 owner_c,safe_payload FROM workflow.workflow_reconciliation_outbox_events WHERE event_id=$1",
              [target.id, ownerB.digest, ownerC.digest],
            )
          ).rows[0];
          assert.equal(row.revision, String(Number(before.revision) + 1));
          assert.equal(row.fencing_revision, String(Number(before.fencing_revision) + 1));
          assert.equal(Number(row.owner_b) + Number(row.owner_c), 1, "takeover-race-owner-uniqueness");
          assert.equal(JSON.stringify(row.safe_payload) === JSON.stringify(before.safe_payload), true);
          const stale = await run(context =>
            outboxV2.renewLeaseV2(context, {
              identity: draft.identity,
              expectedFingerprint: draft.fingerprint,
              expectedRevision: row.revision,
              expectedSourceState: "claimed",
              expectedOwner: originalOwner,
              expectedFence: row.fencing_revision,
              leaseExpiresAt: renewedLeaseExpiresAt,
            }),
          );
          assert.equal(stale.status, "committed");
          if (stale.status === "committed") {
            assert.deepEqual(stale.value, {
              status: "conflict",
              conflictClass: "stale-fence",
              providerSubmitPermitted: false,
            });
          }
        }
      } finally {
        assert.equal(manager.dispose(), "disposed");
        assert.equal(await bridge.close(), "closed");
      }
    }));
}
