import assert from "node:assert/strict";
import test from "node:test";
import { withPostgreSqlTestEnvironment } from "@/lib/postgresqlTestEnvironment";
import {
  createDurableWorkflowTransactionManagerV2,
  durableTransactionSuccess,
} from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import type { DurableWorkflowTransactionContext } from "@/lib/server/productionWorkflowRuntime/durableTransaction";
import {
  createPostgreSQLReconciliationRequestStore,
  createPostgreSQLReconciliationRequestStoreV2,
  createPostgreSQLReconciliationResolutionStore,
  createPostgreSQLReconciliationResolutionStoreV2,
  registerPostgreSQLReconciliationStatements,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import type {
  ProtectedIdentity,
  ReconciliationDigestDomain,
  ReconciliationFingerprintDomain,
  ReconciliationRequestDraft,
  ReconciliationRequestRecord,
  ReconciliationRequestStoreV2,
  ReconciliationResolutionAppendResultV2,
  ResolutionAtomicInputV2,
  ResolutionDraft,
  ResolutionRecord,
  ResolutionStore,
  ResolutionStoreV2,
  SemanticFingerprint,
  StoreRecordResult,
} from "@/lib/server/productionWorkflowRuntime/postgresqlReconciliationStores";
import { SliceATestStatementBridge } from "../helpers/sliceAPostgresqlStatementBridge";

const identity = <D extends ReconciliationDigestDomain>(domain: D, seed: number): ProtectedIdentity<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const fingerprint = <D extends ReconciliationFingerprintDomain>(domain: D, seed: number): SemanticFingerprint<D> =>
  Object.freeze({ domain, algorithm: "hmac-sha256", algorithmVersion: 1, digest: new Uint8Array(32).fill(seed) });
const ids = () => {
  let value = 1000;
  return Object.freeze({
    generatorVersion: "1.0" as const,
    generate: () => `a0000000-0000-4000-8000-${String(value++).padStart(12, "0")}`,
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

const sameDigest = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
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

type RaceFixture = Readonly<{
  request: ReconciliationRequestDraft;
  parent: ReconciliationRequestRecord;
  owner: ProtectedIdentity<"claim-owner">;
  draft: ResolutionDraft;
  input: ResolutionAtomicInputV2;
  resolutionsV1: ResolutionStore;
  resolutionsV2: ResolutionStoreV2;
  requestsV2: ReconciliationRequestStoreV2;
  tx<T>(operation: (context: DurableWorkflowTransactionContext) => Promise<T>): Promise<T>;
  list(): Promise<readonly ResolutionRecord[]>;
  readParent(): Promise<ReconciliationRequestRecord>;
}>;

const withRaceFixture = async (
  seed: number,
  applicationName: string,
  verify: (fixture: RaceFixture) => Promise<void>,
) =>
  withPostgreSqlTestEnvironment(async environment => {
    const bridge = new SliceATestStatementBridge({
      ...environment.connection,
      maxConnections: 8,
      connectionTimeoutMs: 5000,
      idleTimeoutMs: 5000,
      applicationName,
      tls: { mode: "disabled" },
    });
    assert.equal(registerPostgreSQLReconciliationStatements(bridge), "registered");
    assert.equal(await bridge.start(), "ready");
    const generator = ids();
    const requestsV1 = createPostgreSQLReconciliationRequestStore(generator);
    const requestsV2 = createPostgreSQLReconciliationRequestStoreV2(requestsV1);
    const resolutionsV1 = createPostgreSQLReconciliationResolutionStore(generator);
    const resolutionsV2 = createPostgreSQLReconciliationResolutionStoreV2(resolutionsV1, generator);
    const manager = createDurableWorkflowTransactionManagerV2(bridge.sessionFactory(), clock);
    const tenant = identity("tenant", seed);
    const owner = identity("claim-owner", seed + 1);
    const tx = async <T>(operation: (context: DurableWorkflowTransactionContext) => Promise<T>): Promise<T> => {
      const result = await manager.runInTransaction(options, async context =>
        durableTransactionSuccess(await operation(context)),
      );
      if (result.status !== "committed") throw new Error("safe-resolution-race-transaction");
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
      const created = await tx(context => requestsV1.createIfAbsent(context, request));
      if (created.status !== "created") throw new Error("safe-resolution-race-parent");
      const expiry = String(
        (await environment.pool.query("SELECT (transaction_timestamp()+interval '1 hour')::text value")).rows[0].value,
      );
      const claimed = await tx(context =>
        requestsV1.claimDue(context, { owner, expectedFence: "0", writerEpoch: "1", leaseExpiresAt: expiry }, 1),
      );
      assert.equal(claimed.length, 1, "safe-resolution-race-claim-count");
      const parent = claimed[0];
      if (!parent) throw new Error("safe-resolution-race-claim-missing");
      assert.equal(sameDigest(parent.identity.digest, request.identity.digest), true, "safe-resolution-race-parent-isolation");
      const draft: ResolutionDraft = Object.freeze({
        requestId: parent.id,
        identity: identity("resolution", seed + 4),
        tenant,
        fingerprint: fingerprint("resolution-semantic", seed + 4),
        sequence: "1",
        resolutionClass: "committed",
        reasonCode: "database-commit-acknowledgement-lost",
        summary: Object.freeze({ participant: "a", outcomeVersion: 1, authoritative: true, optionalClass: null }),
        committedRevision: String(Number(parent.revision) + 1),
        resolvedAt: "2020-01-01T00:00:00.000Z",
      });
      const input: ResolutionAtomicInputV2 = Object.freeze({
        draft,
        requestIdentity: request.identity,
        expectedRequestRevision: parent.revision,
        expectedPriorStates: ["claimed"] as const,
        authority: Object.freeze({
          writerEpoch: parent.writerEpoch,
          expectedFence: parent.fencingRevision,
          owner,
        }),
      });
      assert.equal((await tx(context => resolutionsV1.listByRequest(context, parent.id))).length, 0, "safe-race-empty");
      const fixture: RaceFixture = Object.freeze({
        request,
        parent,
        owner,
        draft,
        input,
        resolutionsV1,
        resolutionsV2,
        requestsV2,
        tx,
        list: () => tx(context => resolutionsV1.listByRequest(context, parent.id)),
        readParent: async () => {
          const value = await tx(context => requestsV1.readInTransaction(context, request.identity));
          if (value.status !== "found") throw new Error("safe-resolution-race-parent-read");
          return value.record;
        },
      });
      await verify(fixture);
    } finally {
      assert.equal(manager.dispose(), "disposed");
      assert.equal(await bridge.close(), "closed");
    }
  });

test("Fixture Group 4 races same Resolution identity and same fingerprint", async () =>
  withRaceFixture(40, "resolution-v2-race-same", async fixture => {
    const barrier = createBarrier(2);
    const participant = async () => {
      await barrier();
      return fixture.tx(context => fixture.resolutionsV2.appendStandaloneV2(context, fixture.input));
    };
    const [left, right] = await Promise.all([participant(), participant()]);
    const outcomes = [left, right];
    assert.equal(outcomes.filter(value => value.status === "created").length, 1, "same-race-created-winner");
    assert.equal(outcomes.filter(value => value.status === "replayed").length, 1, "same-race-replayed-loser");
    assert.notEqual(left, right, "same-race-result-isolation");
    const rows = await fixture.list();
    assert.equal(rows.length, 1, "same-race-row-uniqueness");
    assert.equal(sameDigest(rows[0]!.fingerprint.digest, fixture.draft.fingerprint.digest), true, "same-race-fingerprint");
    assert.equal(sameFlatScalars(rows[0]!.summary, fixture.draft.summary), true, "same-race-payload");
    const parentAfter = await fixture.readParent();
    assert.equal(parentAfter.revision === fixture.parent.revision, true, "same-race-parent-revision");
    assert.equal(parentAfter.fencingRevision === fixture.parent.fencingRevision, true, "same-race-parent-fence");
  }));

test("Fixture Group 4 races same Resolution identity and different fingerprints", async () =>
  withRaceFixture(60, "resolution-v2-race-fingerprint", async fixture => {
    const barrier = createBarrier(2);
    const secondDraft: ResolutionDraft = Object.freeze({
      ...fixture.draft,
      fingerprint: fingerprint("resolution-semantic", 69),
      summary: Object.freeze({ participant: "b", outcomeVersion: 2, authoritative: true, optionalClass: null }),
    });
    const secondInput: ResolutionAtomicInputV2 = Object.freeze({ ...fixture.input, draft: secondDraft });
    const participant = async (input: ResolutionAtomicInputV2) => {
      await barrier();
      return fixture.tx(context => fixture.resolutionsV2.appendStandaloneV2(context, input));
    };
    const [left, right] = await Promise.all([participant(fixture.input), participant(secondInput)]);
    const outcomes = [left, right];
    assert.equal(outcomes.filter(value => value.status === "created").length, 1, "fingerprint-race-winner");
    assert.equal(
      outcomes.filter(value => value.status === "conflict" && value.conflictClass === "semantic-conflict").length,
      1,
      "fingerprint-race-loser",
    );
    const rows = await fixture.list();
    assert.equal(rows.length, 1, "fingerprint-race-row-uniqueness");
    const winnerIsFirst = sameDigest(rows[0]!.fingerprint.digest, fixture.draft.fingerprint.digest);
    const winnerIsSecond = sameDigest(rows[0]!.fingerprint.digest, secondDraft.fingerprint.digest);
    assert.equal(Number(winnerIsFirst) + Number(winnerIsSecond), 1, "fingerprint-race-authoritative-winner");
    assert.equal(
      sameFlatScalars(rows[0]!.summary, winnerIsFirst ? fixture.draft.summary : secondDraft.summary),
      true,
      "fingerprint-race-payload",
    );
    const parentAfter = await fixture.readParent();
    assert.equal(parentAfter.revision === fixture.parent.revision, true, "fingerprint-race-parent-revision");
  }));

test("Fixture Group 4 races distinct Resolution identities at the same sequence", async () =>
  withRaceFixture(80, "resolution-v2-race-sequence", async fixture => {
    const barrier = createBarrier(2);
    const secondDraft: ResolutionDraft = Object.freeze({
      ...fixture.draft,
      identity: identity("resolution", 89),
      fingerprint: fingerprint("resolution-semantic", 89),
      summary: Object.freeze({ participant: "b", outcomeVersion: 2, authoritative: true, optionalClass: null }),
    });
    const secondInput: ResolutionAtomicInputV2 = Object.freeze({ ...fixture.input, draft: secondDraft });
    const participant = async (input: ResolutionAtomicInputV2) => {
      await barrier();
      return fixture.tx(context => fixture.resolutionsV2.appendStandaloneV2(context, input));
    };
    const outcomes = await Promise.all([participant(fixture.input), participant(secondInput)]);
    assert.equal(outcomes.filter(value => value.status === "created").length, 1, "sequence-race-winner");
    assert.equal(
      outcomes.filter(value => value.status === "conflict" && value.conflictClass === "semantic-conflict").length,
      1,
      "sequence-race-loser",
    );
    const rows = await fixture.list();
    assert.equal(rows.length, 1, "sequence-race-row-uniqueness");
    const winnerIsFirst = sameDigest(rows[0]!.identity.digest, fixture.draft.identity.digest);
    const winnerIsSecond = sameDigest(rows[0]!.identity.digest, secondDraft.identity.digest);
    assert.equal(Number(winnerIsFirst) + Number(winnerIsSecond), 1, "sequence-race-authoritative-winner");
    assert.equal(
      sameFlatScalars(rows[0]!.summary, winnerIsFirst ? fixture.draft.summary : secondDraft.summary),
      true,
      "sequence-race-payload",
    );
    const parentAfter = await fixture.readParent();
    assert.equal(parentAfter.revision === fixture.parent.revision, true, "sequence-race-parent-revision");
  }));

test("Fixture Group 4 preserves terminal parent against concurrent and stale Resolution participants", async () =>
  withRaceFixture(100, "resolution-v2-race-terminal", async fixture => {
    const barrier = createBarrier(2);
    const resolutionParticipant = async (): Promise<ReconciliationResolutionAppendResultV2> => {
      await barrier();
      return fixture.tx(context => fixture.resolutionsV2.appendStandaloneV2(context, fixture.input));
    };
    const terminalParticipant = async (): Promise<StoreRecordResult<ReconciliationRequestRecord>> => {
      await barrier();
      return fixture.tx(context =>
        fixture.requestsV2.transitionV2(context, {
          identity: fixture.request.identity,
          expectedRevision: fixture.parent.revision,
          expectedPriorStates: ["claimed"],
          authority: {
            writerEpoch: fixture.parent.writerEpoch,
            expectedFence: fixture.parent.fencingRevision,
            owner: fixture.owner,
          },
          nextState: "cancelled",
          resolutionClass: "cancelled",
        }),
      );
    };
    const [resolutionOutcome, terminalOutcome] = await Promise.all([
      resolutionParticipant(),
      terminalParticipant(),
    ]);
    assert.equal(terminalOutcome.status, "updated", "terminal-race-transition-winner");
    assert.equal(
      resolutionOutcome.status === "created" ||
        (resolutionOutcome.status === "conflict" && resolutionOutcome.conflictClass === "terminal-preserved"),
      true,
      "terminal-race-resolution-outcome",
    );
    const rowsAfterRace = await fixture.list();
    assert.equal(
      rowsAfterRace.length === (resolutionOutcome.status === "created" ? 1 : 0),
      true,
      "terminal-race-row-consistency",
    );
    const terminalParent = await fixture.readParent();
    assert.equal(terminalParent.state === "cancelled", true, "terminal-race-parent-state");
    assert.equal(
      Number(terminalParent.revision) - Number(fixture.parent.revision) === 1,
      true,
      "terminal-race-parent-revision-once",
    );
    assert.equal(terminalParent.fencingRevision === fixture.parent.fencingRevision, true, "terminal-race-parent-fence");
    const staleDraft: ResolutionDraft = Object.freeze({
      ...fixture.draft,
      identity: identity("resolution", 109),
      fingerprint: fingerprint("resolution-semantic", 109),
      sequence: "2",
      summary: Object.freeze({ participant: "stale", outcomeVersion: 2, authoritative: false, optionalClass: null }),
    });
    const stale = await fixture.tx(context =>
      fixture.resolutionsV2.appendStandaloneV2(context, { ...fixture.input, draft: staleDraft }),
    );
    assert.deepEqual(
      stale,
      { status: "conflict", conflictClass: "terminal-preserved" },
      "terminal-race-stale-participant",
    );
    assert.equal((await fixture.list()).length, rowsAfterRace.length, "terminal-race-no-late-row");
    const finalParent = await fixture.readParent();
    assert.equal(finalParent.revision === terminalParent.revision, true, "terminal-race-no-late-revision");
  }));
