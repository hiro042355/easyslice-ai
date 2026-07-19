import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import { createDurableWorkflowTransactionManagerV2, durableTransactionSuccess } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type { DurableWorkflowTransactionContext, DurableWorkflowTransactionOperationResult } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  createPostgreSQLManualRepairApprovalStore,
  createPostgreSQLManualRepairTransitions,
  createPostgreSQLReconciliationManualRepairStore,
  createPostgreSQLReconciliationRequestStore,
  registerPostgreSQLReconciliationStatements,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {
  ManualRepairApprovalInput,
  ManualRepairRecord,
  ManualRepairState,
  ProtectedIdentity,
  ReconciliationDigestDomain,
  ReconciliationFingerprintDomain,
  SemanticFingerprint,
  StoreRecordResult,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import {
  createManualRepairLifecycleFixtureAdapter,
  registerManualRepairLifecycleFixture,
} from "../helpers/manualRepairLifecycleFixtureAdapter";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = () => {
  let value = 1;
  return Object.freeze({ generatorVersion: "1.0" as const, generate: () => `60000000-0000-4000-8000-${String(value++).padStart(12, "0")}` });
};
const options = Object.freeze({ isolation: "read-committed" as const, accessMode: "read-write" as const, deadlineMonotonicMilliseconds: 100000 });
const clock = Object.freeze({ nowUtc: () => "2026-07-17T00:00:00.000Z", monotonicMilliseconds: () => 1 });

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(environment: Parameters<Parameters<typeof withPostgreSqlTestEnvironment>[0]>[0]) {
  const bridge = new SliceATestStatementBridge({ ...environment.connection, maxConnections: 8, connectionTimeoutMs: 5000, idleTimeoutMs: 5000, applicationName: "manual-repair-invalid-matrix", tls: { mode: "disabled" } });
  assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
  assert.equal(registerManualRepairLifecycleFixture(bridge), "registered");
  assert.equal(await bridge.start(), "ready");
  const generator = ids();
  const requests = createPostgreSQLReconciliationRequestStore(generator);
  const repairs = createPostgreSQLReconciliationManualRepairStore(generator);
  const approvals = createPostgreSQLManualRepairApprovalStore(repairs);
  const transitions = createPostgreSQLManualRepairTransitions(repairs);
  const lifecycle = createManualRepairLifecycleFixtureAdapter();
  const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
  const run = <T>(operation: (context: DurableWorkflowTransactionContext) => Promise<DurableWorkflowTransactionOperationResult<T>>) => manager.runInTransaction(options, operation);
  const requestDraft = Object.freeze({
    identity: identity("reconciliation-request", 1), tenant: identity("tenant", 2), workflow: identity("workflow", 3),
    fingerprint: fingerprint("reconciliation-request-semantic", 4), reconciliationClass: "database-commit-unknown",
    operation: "generate-music" as const, region: "test-region", state: "pending-observation" as const,
    policyClass: "immediate-database", maxObservations: 8, maxAttempts: 4, writerEpoch: "1",
    nextEligibleAt: "2027-01-01T00:00:00.000Z", policyDeadlineAt: "2027-01-02T00:00:00.000Z",
    retentionClass: "reconciliation-standard",
  });
  const request = await run(async context => durableTransactionSuccess(await requests.createIfAbsent(context, requestDraft)));
  assert.equal(request.status, "committed");
  if (request.status !== "committed" || request.value.status !== "created") throw new Error("safe-group6-request-setup");
  const approver = identity("operator-subject", 9);
  const approvalDecision = identity("approval-decision", 10);
  const repairDraft = Object.freeze({
    requestId: request.value.record.id, identity: identity("manual-repair", 5), tenant: requestDraft.tenant,
    fingerprint: fingerprint("manual-repair-semantic", 6), requester: identity("operator-subject", 7),
    approver, authorizationDecision: identity("authorization-decision", 8), approvalDecision, action: "cancel-repair",
    reasonCode: "manual-repair-required", metadata: Object.freeze({ scope: "safe" }), writerEpoch: "1",
    requestedAt: "2020-01-01T00:00:00.000Z", legalHoldState: "none" as const,
  });
  const created = await run(async context => durableTransactionSuccess(await repairs.createRequest(context, repairDraft)));
  assert.equal(created.status, "committed");
  if (created.status !== "committed" || created.value.status !== "created") throw new Error("safe-group6-repair-setup");
  const input = Object.freeze({
    repairIdentity: repairDraft.identity, expectedRevision: "0", expectedPriorState: "requested" as const,
    writerEpoch: "1", fencingRevision: "0", requester: repairDraft.requester,
    approver, approvalDecision,
    authorizationPolicyVersion: 1, safeReasonCode: "authorization-required",
    semanticFingerprint: repairDraft.fingerprint,
  });
  const read = async (): Promise<ManualRepairRecord> => {
    const result = await run(async context => durableTransactionSuccess(await repairs.read(context, repairDraft.identity)));
    assert.equal(result.status, "committed");
    if (result.status !== "committed" || result.value.status !== "found") throw new Error("safe-group6-read");
    return result.value.record;
  };
  return Object.freeze({ bridge, manager, run, repairs, approvals, transitions, lifecycle, repairDraft, input, read });
}

async function closeFixture(fixture: Fixture) {
  assert.equal(fixture.manager.dispose(), "disposed");
  assert.equal(await fixture.bridge.close(), "closed");
}

async function assertUnchanged(fixture: Fixture, before: ManualRepairRecord, result: StoreRecordResult<ManualRepairRecord>, expected: StoreRecordResult<ManualRepairRecord>["status"]) {
  assert.equal(result.status, expected);
  const after = await fixture.read();
  assert.deepEqual(after, before);
  assert.equal(after.revision, before.revision);
  assert.equal(after.writerEpoch, before.writerEpoch);
  assert.equal(after.fencingRevision, before.fencingRevision);
  assert.deepEqual(after.metadata, before.metadata);
}

test("Fixture Group 6 valid control approves exactly once", async () => withPostgreSqlTestEnvironment(async environment => {
  const fixture = await createFixture(environment);
  try {
    const before = await fixture.read();
    const result = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, fixture.input)));
    assert.equal(result.status, "committed");
    if (result.status !== "committed" || result.value.status !== "updated") throw new Error("safe-group6-valid-control");
    assert.equal(result.value.record.state, "authorized");
    assert.equal(BigInt(result.value.record.revision) - BigInt(before.revision), BigInt(1));
    assert.equal(result.value.record.writerEpoch, before.writerEpoch);
    assert.equal(result.value.record.fencingRevision, before.fencingRevision);
    assert.deepEqual(result.value.record.metadata, before.metadata);
  } finally { await closeFixture(fixture); }
}));

const approvalFailureCases = Object.freeze([
  Object.freeze({ label: "invalid-input", expected: "conflict" as const, change: (fixture: Fixture) => Object.freeze({ ...fixture.input, approver: fixture.input.requester }) }),
  Object.freeze({ label: "stale-revision", expected: "stale-revision" as const, change: (fixture: Fixture) => Object.freeze({ ...fixture.input, expectedRevision: "1" }) }),
  Object.freeze({ label: "future-revision", expected: "stale-revision" as const, change: (fixture: Fixture) => Object.freeze({ ...fixture.input, expectedRevision: "999" }) }),
  Object.freeze({ label: "stale-fence", expected: "stale-fence" as const, change: (fixture: Fixture) => Object.freeze({ ...fixture.input, fencingRevision: "1" }) }),
  Object.freeze({ label: "writer-epoch-mismatch", expected: "stale-writer" as const, change: (fixture: Fixture) => Object.freeze({ ...fixture.input, writerEpoch: "2" }) }),
]);

for (const failureCase of approvalFailureCases) {
  test(`Fixture Group 6 rejects ${failureCase.label} without mutation`, async () => withPostgreSqlTestEnvironment(async environment => {
    const fixture = await createFixture(environment);
    try {
      const before = await fixture.read();
      const outcome = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, failureCase.change(fixture))));
      assert.equal(outcome.status, "committed", failureCase.label);
      if (outcome.status === "committed") await assertUnchanged(fixture, before, outcome.value, failureCase.expected);
    } finally { await closeFixture(fixture); }
  }));
}

test("Fixture Group 6 classifies wrong prior state without mutation", async () => withPostgreSqlTestEnvironment(async environment => {
  const fixture = await createFixture(environment);
  try {
    const prior = await fixture.run(async context => durableTransactionSuccess(await fixture.transitions.recordApproval(context, fixture.repairDraft.identity, "0", "1", "0")));
    assert.equal(prior.status, "committed");
    if (prior.status !== "committed" || prior.value.status !== "updated") throw new Error("safe-group6-prior-state-setup");
    const before = await fixture.read();
    const outcome = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, Object.freeze({ ...fixture.input, expectedRevision: before.revision, approvalDecision: identity("approval-decision", 11) }))));
    assert.equal(outcome.status, "committed");
    if (outcome.status === "committed") await assertUnchanged(fixture, before, outcome.value, "conflict");
  } finally { await closeFixture(fixture); }
}));

const terminalStates = Object.freeze(["rejected", "reconciled", "deferred", "terminal-safe-failure", "cancelled"] as const);
for (const terminalState of terminalStates) {
  test(`Fixture Group 6 preserves terminal repair ${terminalState}`, async () => withPostgreSqlTestEnvironment(async environment => {
    const fixture = await createFixture(environment);
    try {
      let revision = "0";
      if (terminalState === "rejected" || terminalState === "cancelled") {
        const method = terminalState === "rejected" ? fixture.transitions.markRejected : fixture.transitions.markCancelled;
        const transitioned = await fixture.run(async context => durableTransactionSuccess(await method(context, fixture.repairDraft.identity, revision, "1", "0")));
        assert.equal(transitioned.status, "committed");
        if (transitioned.status !== "committed" || transitioned.value.status !== "updated") throw new Error("safe-group6-terminal-setup");
      } else {
        const approved = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, fixture.input)));
        assert.equal(approved.status, "committed");
        if (approved.status !== "committed" || approved.value.status !== "updated") throw new Error("safe-group6-terminal-approval");
        revision = approved.value.record.revision;
        const executing = await fixture.run(async context => durableTransactionSuccess(await fixture.transitions.markExecuting(context, fixture.repairDraft.identity, revision, "1", "0")));
        assert.equal(executing.status, "committed");
        if (executing.status !== "committed" || executing.value.status !== "updated") throw new Error("safe-group6-terminal-executing");
        revision = executing.value.record.revision;
        const method = terminalState === "reconciled" ? fixture.transitions.markReconciled : terminalState === "deferred" ? fixture.transitions.markDeferred : fixture.transitions.markTerminalSafeFailure;
        const transitioned = await fixture.run(async context => durableTransactionSuccess(await method(context, fixture.repairDraft.identity, revision, "1", "0")));
        assert.equal(transitioned.status, "committed");
        if (transitioned.status !== "committed" || transitioned.value.status !== "updated") throw new Error("safe-group6-terminal-completion");
      }
      const before = await fixture.read();
      const outcome = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, Object.freeze({ ...fixture.input, expectedRevision: before.revision }))));
      assert.equal(outcome.status, "committed");
      if (outcome.status === "committed") await assertUnchanged(fixture, before, outcome.value, "terminal");
    } finally { await closeFixture(fixture); }
  }));
}

test("Fixture Group 6 rejects approval of deleted repair", async () => withPostgreSqlTestEnvironment(async environment => {
  const fixture = await createFixture(environment);
  try {
    const deleted = await fixture.run(async context => durableTransactionSuccess(await fixture.lifecycle.markDeleted(context, { identity: fixture.repairDraft.identity, expectedRevision: "0", expectedWriterEpoch: "1", expectedFencingRevision: "0" })));
    assert.equal(deleted.status, "committed");
    if (deleted.status !== "committed" || deleted.value.status !== "deleted") throw new Error("safe-group6-delete-setup");
    const before = await fixture.read();
    const outcome = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, Object.freeze({ ...fixture.input, expectedRevision: before.revision }))));
    assert.equal(outcome.status, "committed");
    if (outcome.status === "committed") await assertUnchanged(fixture, before, outcome.value, "terminal");
  } finally { await closeFixture(fixture); }
}));

test("Fixture Group 6 classifies repeated and conflicting second repair", async () => withPostgreSqlTestEnvironment(async environment => {
  const fixture = await createFixture(environment);
  try {
    const first = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, fixture.input)));
    assert.equal(first.status, "committed");
    if (first.status !== "committed" || first.value.status !== "updated") throw new Error("safe-group6-first-approval");
    const beforeReplay = await fixture.read();
    const replay = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, fixture.input)));
    assert.equal(replay.status, "committed");
    if (replay.status !== "committed") throw new Error("safe-group6-replay-transaction");
    await assertUnchanged(fixture, beforeReplay, replay.value, "replayed");
    const conflict = await fixture.run(async context => durableTransactionSuccess(await fixture.approvals.recordApproval(context, Object.freeze({ ...fixture.input, semanticFingerprint: fingerprint("manual-repair-semantic", 99) }))));
    assert.equal(conflict.status, "committed");
    if (conflict.status === "committed") await assertUnchanged(fixture, beforeReplay, conflict.value, "conflict");
  } finally { await closeFixture(fixture); }
}));

test("Fixture Group 6 structurally proves unreachable owner and target inputs", async () => {
  const [types, approval, statements, transitions] = await Promise.all([
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/types.ts", "utf8"),
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/postgresqlManualRepairApprovalStore.ts", "utf8"),
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/postgresqlReconciliationStatementCatalog.ts", "utf8"),
    readFile("lib/server/productionWorkflowRuntime/postgresqlReconciliationStores/postgresqlReconciliationTransitions.ts", "utf8"),
  ]);
  const approvalInput = types.slice(types.indexOf("export type ManualRepairApprovalInput"), types.indexOf("export type ManualRepairApprovalStore"));
  const approvalStatement = statements.slice(statements.indexOf("statementId: \"reconciliation.repair.approve\""), statements.indexOf("statementId: \"reconciliation.outbox.insert\""));
  assert.equal(approvalInput.includes("claimOwner"), false, "public-unreachable-owner");
  assert.equal(approvalInput.includes("targetState"), false, "public-unreachable-target");
  assert.equal(approval.includes("input.claimOwner"), false, "validation-unreachable-owner");
  assert.equal(approvalStatement.includes("claim_owner_digest"), false, "statement-unreachable-owner");
  assert.equal(approvalStatement.includes("state='authorized'"), true, "statement-fixed-target");
  assert.equal(approvalStatement.includes("state=$"), true, "statement-expected-prior-state");
  assert.equal(transitions.includes("recordApproval:(c,i,r,w,f)=>store.compareAndSet(c,i,r,w,f,\"authorized\")"), true, "adapter-fixed-target");
  assert.equal(approval.indexOf("if(input.expectedPriorState") < approval.indexOf("await execute("), true, "validation-before-query");
});
