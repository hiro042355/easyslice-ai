import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import { createDurableWorkflowTransactionManagerV2, durableTransactionSuccess } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import { createPostgreSQLManualRepairApprovalStore, createPostgreSQLReconciliationManualRepairStore, createPostgreSQLReconciliationRequestStore, registerPostgreSQLReconciliationStatements } from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type { ProtectedIdentity, ReconciliationDigestDomain, ReconciliationFingerprintDomain, SemanticFingerprint } from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import { createManualRepairLifecycleFixtureAdapter, MANUAL_REPAIR_LIFECYCLE_FIXTURE_DESCRIPTOR, registerManualRepairLifecycleFixture } from "../helpers/manualRepairLifecycleFixtureAdapter";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> => Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> => Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = () => { let value = 1; return Object.freeze({ generatorVersion: "1.0" as const, generate: () => `20000000-0000-4000-8000-${String(value++).padStart(12, "0")}` }); };
const options = Object.freeze({ isolation: "read-committed" as const, accessMode: "read-write" as const, deadlineMonotonicMilliseconds: 100000 });
const clock = Object.freeze({ nowUtc: () => "2026-07-17T00:00:00.000Z", monotonicMilliseconds: () => 1 });
const sameBytes = (left: unknown, right: unknown) => left instanceof Uint8Array && right instanceof Uint8Array && left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

test("test-only lifecycle adapter proves deleted Manual Repair approval guard", async () => withPostgreSqlTestEnvironment(async environment => {
  const bridge = new SliceATestStatementBridge({ ...environment.connection, maxConnections: 8, connectionTimeoutMs: 5000, idleTimeoutMs: 5000, applicationName: "manual-repair-deleted-guard", tls: { mode: "disabled" } });
  assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
  assert.equal(registerManualRepairLifecycleFixture(bridge), "registered");
  assert.equal(await bridge.start(), "ready");
  const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
  try {
    assert.deepEqual(MANUAL_REPAIR_LIFECYCLE_FIXTURE_DESCRIPTOR, { id: "manual-repair-deletion-lifecycle-fixture", fixtureVersion: "1.0", mode: "test-only", productionReady: false, runtimeComposable: false, arbitrarySqlSupported: false, allowedTransition: "active-to-deleted" });
    const generator = ids(); const requests = createPostgreSQLReconciliationRequestStore(generator); const repairs = createPostgreSQLReconciliationManualRepairStore(generator); const approvals = createPostgreSQLManualRepairApprovalStore(repairs); const lifecycle = createManualRepairLifecycleFixtureAdapter();
    const requestDraft = Object.freeze({ identity: identity("reconciliation-request", 1), tenant: identity("tenant", 2), workflow: identity("workflow", 3), fingerprint: fingerprint("reconciliation-request-semantic", 4), reconciliationClass: "database-commit-unknown", operation: "generate-music" as const, region: "test-region", state: "pending-observation" as const, policyClass: "immediate-database", maxObservations: 8, maxAttempts: 4, writerEpoch: "1", nextEligibleAt: "2027-01-01T00:00:00.000Z", policyDeadlineAt: "2027-01-02T00:00:00.000Z", retentionClass: "reconciliation-standard" });
    const requestResult = await manager.runInTransaction(options, async context => durableTransactionSuccess(await requests.createIfAbsent(context, requestDraft)));
    assert.equal(requestResult.status, "committed"); if (requestResult.status !== "committed" || requestResult.value.status !== "created") throw new Error("safe-request-precondition");
    const repair = Object.freeze({ requestId: requestResult.value.record.id, identity: identity("manual-repair", 5), tenant: requestDraft.tenant, fingerprint: fingerprint("manual-repair-semantic", 6), requester: identity("operator-subject", 7), approver: identity("operator-subject", 8), authorizationDecision: identity("authorization-decision", 9), approvalDecision: identity("approval-decision", 10), action: "cancel-repair", reasonCode: "manual-repair-required", metadata: Object.freeze({ scope: "safe" }), writerEpoch: "1", requestedAt: "2020-01-01T00:00:00.000Z", legalHoldState: "none" as const });
    const repairResult = await manager.runInTransaction(options, async context => durableTransactionSuccess(await repairs.createRequest(context, repair)));
    assert.equal(repairResult.status, "committed"); if (repairResult.status !== "committed" || repairResult.value.status !== "created") throw new Error("safe-repair-precondition");
    for (const invalid of [{ expectedRevision: "1", expectedWriterEpoch: "1", expectedFencingRevision: "0" }, { expectedRevision: "0", expectedWriterEpoch: "2", expectedFencingRevision: "0" }, { expectedRevision: "0", expectedWriterEpoch: "1", expectedFencingRevision: "1" }]) {
      const result = await manager.runInTransaction(options, async context => durableTransactionSuccess(await lifecycle.markDeleted(context, { identity: repair.identity, ...invalid })));
      assert.equal(result.status, "committed"); if (result.status === "committed") assert.equal(result.value.status, "lifecycle-conflict");
    }
    const deleted = await manager.runInTransaction(options, async context => durableTransactionSuccess(await lifecycle.markDeleted(context, { identity: repair.identity, expectedRevision: "0", expectedWriterEpoch: "1", expectedFencingRevision: "0" })));
    assert.equal(deleted.status, "committed"); if (deleted.status !== "committed" || deleted.value.status !== "deleted") throw new Error("safe-delete-fixture-precondition"); assert.equal(deleted.value.revision, "1");
    const duplicate = await manager.runInTransaction(options, async context => durableTransactionSuccess(await lifecycle.markDeleted(context, { identity: repair.identity, expectedRevision: "1", expectedWriterEpoch: "1", expectedFencingRevision: "0" })));
    assert.equal(duplicate.status, "committed"); if (duplicate.status === "committed") assert.equal(duplicate.value.status, "lifecycle-conflict");
    const before = await environment.pool.query("SELECT state, revision::text, approved_at, approver_subject_digest, approval_decision_reference_digest, deletion_state FROM workflow.workflow_reconciliation_manual_repairs WHERE repair_request_id=$1", [repairResult.value.record.id]);
    const approvalInput = Object.freeze({ repairIdentity: repair.identity, expectedRevision: "1", expectedPriorState: "requested" as const, writerEpoch: "1", fencingRevision: "0", requester: repair.requester, approver: repair.approver, approvalDecision: repair.approvalDecision, authorizationPolicyVersion: 1, safeReasonCode: "authorization-required", semanticFingerprint: repair.fingerprint });
    const approval = await manager.runInTransaction(options, async context => durableTransactionSuccess(await approvals.recordApproval(context, approvalInput)));
    assert.equal(approval.status, "committed"); if (approval.status === "committed") assert.equal(approval.value.status, "terminal");
    const after = await environment.pool.query("SELECT state, revision::text, approved_at, approver_subject_digest, approval_decision_reference_digest, deletion_state FROM workflow.workflow_reconciliation_manual_repairs WHERE repair_request_id=$1", [repairResult.value.record.id]);
    assert.equal(after.rows[0]?.deletion_state, "deleted"); assert.equal(after.rows[0]?.state, before.rows[0]?.state); assert.equal(after.rows[0]?.revision, before.rows[0]?.revision); assert.equal(after.rows[0]?.approved_at, before.rows[0]?.approved_at); assert.equal(sameBytes(after.rows[0]?.approver_subject_digest, before.rows[0]?.approver_subject_digest), true); assert.equal(sameBytes(after.rows[0]?.approval_decision_reference_digest, before.rows[0]?.approval_decision_reference_digest), true);
  } finally {
    assert.equal(manager.dispose(), "disposed"); assert.equal(await bridge.close(), "closed");
  }
}));
