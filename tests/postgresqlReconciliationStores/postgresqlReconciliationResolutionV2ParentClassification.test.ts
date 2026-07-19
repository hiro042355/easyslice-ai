import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import { createDurableWorkflowTransactionManagerV2, durableTransactionSuccess } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  POSTGRESQL_RECONCILIATION_STATEMENT_CATALOG,
  createPostgreSQLReconciliationRequestStore,
  createPostgreSQLReconciliationRequestStoreV2,
  createPostgreSQLReconciliationResolutionStore,
  createPostgreSQLReconciliationResolutionStoreV2,
  isReconciliationRequestNonTerminalState,
  normalizeExpectedPriorStates,
  registerPostgreSQLReconciliationStatements,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {
  ProtectedIdentity,
  ReconciliationDigestDomain,
  ReconciliationFingerprintDomain,
  ReconciliationRequestDraft,
  ReconciliationRequestState,
  ResolutionDraft,
  SemanticFingerprint,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = () => {
  let value = 900;
  return Object.freeze({
    generatorVersion: "1.0" as const,
    generate: () => `90000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
  });
};
const options = Object.freeze({
  isolation: "read-committed" as const,
  accessMode: "read-write" as const,
  deadlineMonotonicMilliseconds: 100000,
});
const clock = Object.freeze({ nowUtc: () => "2026-07-17T00:00:00.000Z", monotonicMilliseconds: () => 1 });
const sameFlatScalars = (
  left: Readonly<Record<string, string | number | boolean | null>>,
  right: Readonly<Record<string, string | number | boolean | null>>,
) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && Object.is(left[key], right[key]))
  );
};

type DynamicCase =
  | "created"
  | "replayed"
  | "semantic-conflict"
  | "stale-revision"
  | "future-revision"
  | "wrong-prior-state"
  | "stale-owner"
  | "stale-fence"
  | "writer-epoch-mismatch";

const dynamicCases: readonly DynamicCase[] = Object.freeze([
  "created",
  "replayed",
  "semantic-conflict",
  "stale-revision",
  "future-revision",
  "wrong-prior-state",
  "stale-owner",
  "stale-fence",
  "writer-epoch-mismatch",
]);

for (const [caseIndex, caseLabel] of dynamicCases.entries()) {
  test(`Fixture Group 3 dynamically classifies ${caseLabel}`, async () =>
    withPostgreSqlTestEnvironment(async environment => {
      const bridge = new SliceATestStatementBridge({
        ...environment.connection,
        maxConnections: 8,
        connectionTimeoutMs: 5000,
        idleTimeoutMs: 5000,
        applicationName: `resolution-v2-${caseLabel}`,
        tls: { mode: "disabled" },
      });
      assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
      assert.equal(await bridge.start(), "ready");
      const seed = 110 + caseIndex * 7;
      const generator = ids();
      const requestV1 = createPostgreSQLReconciliationRequestStore(generator);
      const requestV2 = createPostgreSQLReconciliationRequestStoreV2(requestV1);
      const resolutionV1 = createPostgreSQLReconciliationResolutionStore(generator);
      const resolutionV2 = createPostgreSQLReconciliationResolutionStoreV2(resolutionV1, generator);
      const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
      const tenant = identity("tenant", seed);
      const workflow = identity("workflow", seed + 1);
      const owner = identity("claim-owner", seed + 2);
      const run = <T>(operation: Parameters<typeof manager.runInTransaction<T>>[1]) =>
        manager.runInTransaction(options, operation);
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
        const createdParent = await run(async context =>
          durableTransactionSuccess(await requestV1.createIfAbsent(context, request)),
        );
        if (createdParent.status !== "committed" || createdParent.value.status !== "created") {
          throw new Error("safe-group3-parent");
        }
        const leaseExpiresAt = String(
          (await environment.pool.query("SELECT (transaction_timestamp()+interval '1 hour')::text value")).rows[0]
            .value,
        );
        const claimedParent = await run(async context =>
          durableTransactionSuccess(
            await requestV1.claimDue(
              context,
              { owner, expectedFence: "0", writerEpoch: "1", leaseExpiresAt },
              1,
            ),
          ),
        );
        if (claimedParent.status !== "committed") throw new Error("safe-group3-claim-status");
        assert.equal(claimedParent.value.length, 1, "safe-group3-claim-count");
        let parent = claimedParent.value[0];
        if (!parent) throw new Error("safe-group3-claim-missing");
        assert.equal(
          parent.identity.digest.every((value, index) => value === request.identity.digest[index]),
          true,
          "safe-group3-parent-isolation",
        );
        let expectedPriorStates = ["claimed"] as const;
        if (caseLabel === "wrong-prior-state") {
          const observing = await run(async context =>
            durableTransactionSuccess(
              await requestV2.transitionV2(context, {
                identity: request.identity,
                expectedRevision: parent.revision,
                expectedPriorStates: ["claimed"],
                authority: { writerEpoch: parent.writerEpoch, expectedFence: parent.fencingRevision, owner },
                nextState: "observing",
              }),
            ),
          );
          if (observing.status !== "committed" || observing.value.status !== "updated") {
            throw new Error("safe-group3-prior-state-setup");
          }
          parent = observing.value.record;
        }
        const draft: ResolutionDraft = Object.freeze({
          requestId: parent.id,
          identity: identity("resolution", seed + 4),
          tenant,
          fingerprint: fingerprint("resolution-semantic", seed + 4),
          sequence: "1",
          resolutionClass: "committed",
          reasonCode: "database-commit-acknowledgement-lost",
          summary: Object.freeze({
            status: "committed",
            outcomeVersion: 1,
            authoritative: true,
            optionalClass: null,
          }),
          committedRevision: String(Number(parent.revision) + 1),
          resolvedAt: "2020-01-01T00:00:00.000Z",
        });
        const baseInput = {
          draft,
          requestIdentity: request.identity,
          expectedRequestRevision: parent.revision,
          expectedPriorStates,
          authority: { writerEpoch: parent.writerEpoch, expectedFence: parent.fencingRevision, owner },
        } as const;
        const parentBefore = (
          await environment.pool.query(
            "SELECT revision::text,safe_reason_code,policy_supplemental FROM workflow.workflow_reconciliation_requests WHERE reconciliation_id=$1",
            [parent.id],
          )
        ).rows[0];
        let result;
        if (caseLabel === "replayed" || caseLabel === "semantic-conflict") {
          const first = await run(async context =>
            durableTransactionSuccess(await resolutionV2.appendStandaloneV2(context, baseInput)),
          );
          assert.equal(first.status, "committed");
          if (first.status === "committed") assert.deepEqual(first.value, { status: "created" });
          const secondDraft =
            caseLabel === "semantic-conflict"
              ? Object.freeze({ ...draft, fingerprint: fingerprint("resolution-semantic", seed + 5) })
              : draft;
          result = await run(async context =>
            durableTransactionSuccess(
              await resolutionV2.appendStandaloneV2(context, { ...baseInput, draft: secondDraft }),
            ),
          );
        } else {
          const input =
            caseLabel === "stale-revision"
              ? { ...baseInput, expectedRequestRevision: String(Math.max(0, Number(parent.revision) - 1)) }
              : caseLabel === "future-revision"
                ? { ...baseInput, expectedRequestRevision: String(Number(parent.revision) + 100) }
                : caseLabel === "stale-owner"
                  ? {
                      ...baseInput,
                      authority: { ...baseInput.authority, owner: identity("claim-owner", seed + 6) },
                    }
                  : caseLabel === "stale-fence"
                    ? { ...baseInput, authority: { ...baseInput.authority, expectedFence: "0" } }
                    : caseLabel === "writer-epoch-mismatch"
                      ? { ...baseInput, authority: { ...baseInput.authority, writerEpoch: "999" } }
                      : baseInput;
          result = await run(async context =>
            durableTransactionSuccess(await resolutionV2.appendStandaloneV2(context, input)),
          );
        }
        assert.equal(result.status, "committed", `safe-${caseLabel}-transaction`);
        if (result.status !== "committed") throw new Error(`safe-${caseLabel}-unavailable`);
        const expected =
          caseLabel === "created"
            ? { status: "created" }
            : caseLabel === "replayed"
              ? { status: "replayed" }
              : caseLabel === "semantic-conflict"
                ? { status: "conflict", conflictClass: "semantic-conflict" }
                : caseLabel === "stale-owner" || caseLabel === "stale-fence"
                  ? { status: "conflict", conflictClass: "stale-fence" }
                  : caseLabel === "writer-epoch-mismatch"
                    ? { status: "conflict", conflictClass: "writer-epoch-mismatch" }
                    : caseLabel === "wrong-prior-state"
                      ? { status: "conflict", conflictClass: "wrong-prior-state" }
                      : { status: "conflict", conflictClass: "stale-revision" };
        assert.deepEqual(result.value, expected, `safe-${caseLabel}-classification`);
        const parentAfter = (
          await environment.pool.query(
            "SELECT revision::text,safe_reason_code,policy_supplemental FROM workflow.workflow_reconciliation_requests WHERE reconciliation_id=$1",
            [parent.id],
          )
        ).rows[0];
        assert.equal(parentAfter.revision, parentBefore.revision, `safe-${caseLabel}-parent-revision`);
        assert.equal(
          sameFlatScalars(parentAfter, parentBefore),
          true,
          `safe-${caseLabel}-parent-unchanged`,
        );
        const resolutionCount = (
          await environment.pool.query(
            "SELECT count(*)::int count FROM workflow.workflow_reconciliation_resolutions WHERE reconciliation_id=$1",
            [parent.id],
          )
        ).rows[0].count;
        assert.equal(
          resolutionCount,
          caseLabel === "created" || caseLabel === "replayed" || caseLabel === "semantic-conflict" ? 1 : 0,
          `safe-${caseLabel}-resolution-count`,
        );
      } finally {
        assert.equal(manager.dispose(), "disposed");
        assert.equal(await bridge.close(), "closed");
      }
    }));
}

const terminalCases: readonly Readonly<{
  state: Extract<
    ReconciliationRequestState,
    "resolved" | "still-unknown" | "corrupted" | "manual-repair-required" | "cancelled"
  >;
  resolutionClass: string;
  escalationClass?: string;
}>[] = Object.freeze([
  Object.freeze({ state: "resolved", resolutionClass: "committed" }),
  Object.freeze({ state: "still-unknown", resolutionClass: "still-unknown", escalationClass: "manual-repair" }),
  Object.freeze({ state: "corrupted", resolutionClass: "corrupted", escalationClass: "manual-repair" }),
  Object.freeze({
    state: "manual-repair-required",
    resolutionClass: "manual-repair",
    escalationClass: "manual-repair",
  }),
  Object.freeze({ state: "cancelled", resolutionClass: "cancelled" }),
]);

for (const [terminalIndex, terminalCase] of terminalCases.entries()) {
  test(`Fixture Group 3 preserves absorbing terminal parent ${terminalCase.state}`, async () =>
    withPostgreSqlTestEnvironment(async environment => {
      const bridge = new SliceATestStatementBridge({
        ...environment.connection,
        maxConnections: 8,
        connectionTimeoutMs: 5000,
        idleTimeoutMs: 5000,
        applicationName: `resolution-v2-terminal-${terminalCase.state}`,
        tls: { mode: "disabled" },
      });
      assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
      assert.equal(await bridge.start(), "ready");
      const seed = 190 + terminalIndex * 8;
      const generator = ids();
      const requestV1 = createPostgreSQLReconciliationRequestStore(generator);
      const requestV2 = createPostgreSQLReconciliationRequestStoreV2(requestV1);
      const resolutionV2 = createPostgreSQLReconciliationResolutionStoreV2(
        createPostgreSQLReconciliationResolutionStore(generator),
        generator,
      );
      const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
      const tenant = identity("tenant", seed);
      const owner = identity("claim-owner", seed + 1);
      const run = <T>(operation: Parameters<typeof manager.runInTransaction<T>>[1]) =>
        manager.runInTransaction(options, operation);
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
        const created = await run(async context =>
          durableTransactionSuccess(await requestV1.createIfAbsent(context, request)),
        );
        if (created.status !== "committed" || created.value.status !== "created") {
          throw new Error("safe-terminal-parent");
        }
        const leaseExpiresAt = String(
          (await environment.pool.query("SELECT (transaction_timestamp()+interval '1 hour')::text value")).rows[0]
            .value,
        );
        const claimed = await run(async context =>
          durableTransactionSuccess(
            await requestV1.claimDue(
              context,
              { owner, expectedFence: "0", writerEpoch: "1", leaseExpiresAt },
              1,
            ),
          ),
        );
        if (claimed.status !== "committed" || claimed.value.length !== 1) {
          throw new Error("safe-terminal-claim");
        }
        const parent = claimed.value[0]!;
        const terminal = await run(async context =>
          durableTransactionSuccess(
            await requestV2.transitionV2(context, {
              identity: request.identity,
              expectedRevision: parent.revision,
              expectedPriorStates: ["claimed"],
              authority: { writerEpoch: parent.writerEpoch, expectedFence: parent.fencingRevision, owner },
              nextState: terminalCase.state,
              resolutionClass: terminalCase.resolutionClass,
              escalationClass: terminalCase.escalationClass,
            }),
          ),
        );
        if (terminal.status !== "committed" || terminal.value.status !== "updated") {
          throw new Error("safe-terminal-transition");
        }
        const terminalRecord = terminal.value.record;
        const before = (
          await environment.pool.query(
            "SELECT revision::text,state,safe_reason_code,policy_supplemental FROM workflow.workflow_reconciliation_requests WHERE reconciliation_id=$1",
            [terminalRecord.id],
          )
        ).rows[0];
        const draft: ResolutionDraft = Object.freeze({
          requestId: terminalRecord.id,
          identity: identity("resolution", seed + 4),
          tenant,
          fingerprint: fingerprint("resolution-semantic", seed + 4),
          sequence: "1",
          resolutionClass: "committed",
          reasonCode: "database-commit-acknowledgement-lost",
          summary: Object.freeze({ status: "late" }),
          committedRevision: String(Number(terminalRecord.revision) + 1),
          resolvedAt: "2020-01-01T00:00:00.000Z",
        });
        const result = await run(async context =>
          durableTransactionSuccess(
            await resolutionV2.appendStandaloneV2(context, {
              draft,
              requestIdentity: request.identity,
              expectedRequestRevision: terminalRecord.revision,
              expectedPriorStates: ["claimed"],
              authority: {
                writerEpoch: terminalRecord.writerEpoch,
                expectedFence: terminalRecord.fencingRevision,
                owner,
              },
            }),
          ),
        );
        assert.equal(result.status, "committed", `safe-terminal-${terminalCase.state}`);
        if (result.status === "committed") {
          assert.deepEqual(
            result.value,
            { status: "conflict", conflictClass: "terminal-preserved" },
            `safe-terminal-${terminalCase.state}-classification`,
          );
        }
        const after = (
          await environment.pool.query(
            "SELECT revision::text,state,safe_reason_code,policy_supplemental FROM workflow.workflow_reconciliation_requests WHERE reconciliation_id=$1",
            [terminalRecord.id],
          )
        ).rows[0];
        assert.equal(
          sameFlatScalars(after, before),
          true,
          `safe-terminal-${terminalCase.state}-unchanged`,
        );
        assert.equal(
          (
            await environment.pool.query(
              "SELECT count(*)::int count FROM workflow.workflow_reconciliation_resolutions WHERE reconciliation_id=$1",
              [terminalRecord.id],
            )
          ).rows[0].count,
          0,
          `safe-terminal-${terminalCase.state}-resolution-count`,
        );
      } finally {
        assert.equal(manager.dispose(), "disposed");
        assert.equal(await bridge.close(), "closed");
      }
    }));
}

test("Fixture Group 3 preserves flat scalar mutation isolation across created, replayed and subsequent reads", async () =>
  withPostgreSqlTestEnvironment(async environment => {
    const bridge = new SliceATestStatementBridge({
      ...environment.connection,
      maxConnections: 8,
      connectionTimeoutMs: 5000,
      idleTimeoutMs: 5000,
      applicationName: "resolution-v2-mutation-isolation",
      tls: { mode: "disabled" },
    });
    assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
    assert.equal(await bridge.start(), "ready");
    const generator = ids();
    const requests = createPostgreSQLReconciliationRequestStore(generator);
    const resolutionV1 = createPostgreSQLReconciliationResolutionStore(generator);
    const resolutionV2 = createPostgreSQLReconciliationResolutionStoreV2(resolutionV1, generator);
    const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
    const tenant = identity("tenant", 240);
    const owner = identity("claim-owner", 241);
    const run = <T>(operation: Parameters<typeof manager.runInTransaction<T>>[1]) =>
      manager.runInTransaction(options, operation);
    try {
      const request: ReconciliationRequestDraft = Object.freeze({
        identity: identity("reconciliation-request", 242),
        tenant,
        workflow: identity("workflow", 243),
        fingerprint: fingerprint("reconciliation-request-semantic", 242),
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
      const createdParent = await run(async context =>
        durableTransactionSuccess(await requests.createIfAbsent(context, request)),
      );
      if (createdParent.status !== "committed" || createdParent.value.status !== "created") {
        throw new Error("safe-mutation-parent");
      }
      const expiry = String(
        (await environment.pool.query("SELECT (transaction_timestamp()+interval '1 hour')::text value")).rows[0].value,
      );
      const claim = await run(async context =>
        durableTransactionSuccess(
          await requests.claimDue(context, { owner, expectedFence: "0", writerEpoch: "1", leaseExpiresAt: expiry }, 1),
        ),
      );
      if (claim.status !== "committed" || claim.value.length !== 1) throw new Error("safe-mutation-claim");
      const parent = claim.value[0]!;
      const parentBefore = await run(async context =>
        durableTransactionSuccess(await requests.readInTransaction(context, request.identity)),
      );
      if (parentBefore.status !== "committed" || parentBefore.value.status !== "found") {
        throw new Error("safe-mutation-parent-before");
      }
      const callerSummary: Record<string, string | number | boolean | null> = {
        status: "committed",
        outcomeVersion: 1,
        authoritative: true,
        optionalClass: null,
      };
      const expectedSummary = Object.freeze({
        status: "committed",
        outcomeVersion: 1,
        authoritative: true,
        optionalClass: null,
      });
      const draft: ResolutionDraft = {
        requestId: parent.id,
        identity: identity("resolution", 244),
        tenant,
        fingerprint: fingerprint("resolution-semantic", 244),
        sequence: "1",
        resolutionClass: "committed",
        reasonCode: "database-commit-acknowledgement-lost",
        summary: callerSummary,
        committedRevision: String(Number(parent.revision) + 1),
        resolvedAt: "2020-01-01T00:00:00.000Z",
      };
      const input = {
        draft,
        requestIdentity: request.identity,
        expectedRequestRevision: parent.revision,
        expectedPriorStates: ["claimed"] as const,
        authority: { writerEpoch: parent.writerEpoch, expectedFence: parent.fencingRevision, owner },
      };
      const created = await run(async context =>
        durableTransactionSuccess(await resolutionV2.appendStandaloneV2(context, input)),
      );
      assert.equal(created.status, "committed");
      if (created.status !== "committed") throw new Error("safe-mutation-created");
      assert.deepEqual(created.value, { status: "created" });
      assert.equal(Object.isFrozen(created.value), true);
      callerSummary.status = "caller-mutated";
      callerSummary.outcomeVersion = 99;
      callerSummary.authoritative = false;
      callerSummary.optionalClass = "caller-mutated";
      const replayed = await run(async context =>
        durableTransactionSuccess(await resolutionV2.appendStandaloneV2(context, input)),
      );
      assert.equal(replayed.status, "committed");
      if (replayed.status !== "committed") throw new Error("safe-mutation-replayed");
      assert.deepEqual(replayed.value, { status: "replayed" });
      assert.equal(Object.isFrozen(replayed.value), true);
      assert.deepEqual(created.value, { status: "created" });
      assert.notEqual(created.value, replayed.value, "safe-mutation-created-replay-reference");
      const read = await run(async context => durableTransactionSuccess(await resolutionV1.latestResolution(context, parent.id)));
      assert.equal(read.status, "committed");
      if (read.status !== "committed" || read.value.status !== "found") throw new Error("safe-mutation-read");
      assert.equal(sameFlatScalars(read.value.record.summary, expectedSummary), true, "safe-mutation-authoritative-summary");
      const sibling = await run(async context => durableTransactionSuccess(await resolutionV1.latestResolution(context, parent.id)));
      assert.equal(sibling.status, "committed");
      if (sibling.status !== "committed" || sibling.value.status !== "found") throw new Error("safe-mutation-sibling");
      assert.notEqual(read.value, sibling.value, "safe-mutation-read-result-reference");
      assert.notEqual(read.value.record, sibling.value.record, "safe-mutation-record-reference");
      assert.notEqual(read.value.record.summary, sibling.value.record.summary, "safe-mutation-summary-reference");
      assert.equal(sameFlatScalars(sibling.value.record.summary, expectedSummary), true, "safe-mutation-sibling-summary");
      assert.equal(
        (
          await environment.pool.query(
            "SELECT count(*)::int count FROM workflow.workflow_reconciliation_resolutions WHERE reconciliation_id=$1",
            [parent.id],
          )
        ).rows[0].count,
        1,
        "safe-mutation-resolution-count",
      );
      const parentAfter = await run(async context =>
        durableTransactionSuccess(await requests.readInTransaction(context, request.identity)),
      );
      if (parentAfter.status !== "committed" || parentAfter.value.status !== "found") {
        throw new Error("safe-mutation-parent-after");
      }
      const beforeRecord = parentBefore.value.record;
      const afterRecord = parentAfter.value.record;
      const parentUnchanged =
        afterRecord.state === beforeRecord.state &&
        afterRecord.revision === beforeRecord.revision &&
        afterRecord.fencingRevision === beforeRecord.fencingRevision &&
        afterRecord.writerEpoch === beforeRecord.writerEpoch &&
        afterRecord.observationCount === beforeRecord.observationCount &&
        afterRecord.attempt === beforeRecord.attempt &&
        afterRecord.nextEligibleAt === beforeRecord.nextEligibleAt &&
        afterRecord.leaseExpiresAt === beforeRecord.leaseExpiresAt &&
        afterRecord.resolutionClass === beforeRecord.resolutionClass &&
        afterRecord.escalationClass === beforeRecord.escalationClass &&
        afterRecord.terminalAt === beforeRecord.terminalAt &&
        afterRecord.claimOwner?.digest.length === beforeRecord.claimOwner?.digest.length &&
        (afterRecord.claimOwner?.digest.every(
          (value, index) => value === beforeRecord.claimOwner?.digest[index],
        ) ?? beforeRecord.claimOwner === undefined);
      assert.equal(parentUnchanged, true, "safe-mutation-parent-unchanged");
    } finally {
      assert.equal(manager.dispose(), "disposed");
      assert.equal(await bridge.close(), "closed");
    }
  }));

test("Fixture Group 3 structurally proves deleted parent exclusion without a dynamic deletion fixture", () => {
  const generator = ids();
  const requestV1 = createPostgreSQLReconciliationRequestStore(generator);
  const requestV2 = createPostgreSQLReconciliationRequestStoreV2(requestV1);
  const publicMethods = Object.freeze([...Object.keys(requestV1), ...Object.keys(requestV2)]);
  assert.equal(publicMethods.some(method => /delete|deleted|markDeleted/i.test(method)), false, "deleted-public-api-unreachable");
  assert.equal(isReconciliationRequestNonTerminalState("deleted"), false, "deleted-public-state-unreachable");
  assert.equal(normalizeExpectedPriorStates(["deleted"]), undefined, "deleted-prior-state-rejected");
  const statement = POSTGRESQL_RECONCILIATION_STATEMENT_CATALOG.statements.find(
    candidate => candidate.statementId === "reconciliation.resolution.insert.v2",
  );
  assert.ok(statement, "resolution-v2-statement-present");
  const activeOnly = statement.sql.includes("deletion_state='active'");
  const terminalExclusion =
    statement.sql.includes("state NOT IN") &&
    ["resolved", "still-unknown", "corrupted", "manual-repair-required", "cancelled", "deleted"].every(state =>
      statement.sql.includes(`'${state}'`),
    );
  assert.equal(activeOnly, true, "deleted-parent-active-only-guard");
  assert.equal(terminalExclusion, true, "deleted-parent-terminal-guard");
  assert.equal(
    POSTGRESQL_RECONCILIATION_STATEMENT_CATALOG.statements.filter(
      candidate => candidate.statementId === "reconciliation.resolution.insert.v2",
    ).length,
    1,
    "resolution-v2-single-write-path",
  );
  const migration = readFileSync(
    "db/workflow/migrations/V000002__add_workflow_reconciliation_schema.sql",
    "utf8",
  );
  assert.equal(
    migration.includes("deletion_state IN ('active', 'deletion-pending', 'deleted')"),
    true,
    "deleted-parent-schema-lifecycle",
  );
  assert.equal(
    migration.includes("AND (state <> 'deleted' OR deletion_state = 'deleted')"),
    true,
    "deleted-parent-schema-alignment",
  );
});
