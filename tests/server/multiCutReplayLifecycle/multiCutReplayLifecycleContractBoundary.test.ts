import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  MultiCutReplayAuthoritativeRecord,
  MultiCutReplayLifecycleCapability,
  MultiCutReplayLifecycleInput,
  MultiCutReplayLifecycleResult,
  MultiCutReplayRecordState,
  MultiCutReplayRecoveryCapability,
  MultiCutReplayRecoveryLookupResult,
  MultiCutReplayReservationMutationReconciliationResult,
  MultiCutReplayRecoveryTakeoverResult,
} from "../../../lib/server/multiCutReplayLifecycle/types";

const replayIdentity = Object.freeze({
  identityVersion: "1.0" as const,
  keyIdentity: "key:boundary",
  requestFingerprintIdentity: "fingerprint:boundary",
});

const reservationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  reservation: {
    reservationVersion: "1.0" as const,
    reservationIdentity: "reservation:boundary",
  },
  expectedRevision: {
    revisionVersion: "1.0" as const,
    expectedRevision: "revision:1",
  },
  fencing: {
    fencingVersion: "1.0" as const,
    fencingToken: "fence:1",
  },
  lease: {
    leaseVersion: "1.0" as const,
    leaseIdentity: "lease:1",
  },
  leaseExpiresAt: "2030-01-01T00:05:00.000Z",
  reservationAttempt: 1,
});

const renewedReservationEvidence = Object.freeze({
  ...reservationEvidence,
  expectedRevision: {
    revisionVersion: "1.0" as const,
    expectedRevision: "revision:2",
  },
  lease: {
    leaseVersion: "1.0" as const,
    leaseIdentity: "lease:1",
  },
  leaseExpiresAt: "2030-01-01T00:10:00.000Z",
  reservationAttempt: 1,
});

const takeoverReservationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  reservation: {
    reservationVersion: "1.0" as const,
    reservationIdentity: "reservation:takeover",
  },
  expectedRevision: {
    revisionVersion: "1.0" as const,
    expectedRevision: "revision:2",
  },
  fencing: {
    fencingVersion: "1.0" as const,
    fencingToken: "fence:2",
  },
  lease: {
    leaseVersion: "1.0" as const,
    leaseIdentity: "lease:takeover",
  },
  leaseExpiresAt: "2030-01-01T00:10:00.000Z",
  reservationAttempt: 2,
});

test("replay lifecycle contract is type-only and boundary-safe", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayLifecycle/types.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const imports = [
    ...source.matchAll(
      /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g,
    ),
  ].map((match) => ({
    typeOnly: match[1] !== undefined,
    target: match[2],
  }));

  assert.deepEqual(imports, [
    {
      typeOnly: true,
      target: "../multiCutReplayShared/types",
    },
  ]);
  assert.doesNotMatch(
    source,
    /\b(?:const|let|var|function|class|enum|namespace)\b/,
  );
  assert.doesNotMatch(
    source,
    /(?:PostgreSQL|node:|next\/|react|filesystem|process\.env|crypto|Math\.random|Date\.now|new\s+Date|globalThis|from\s+["'][^"']*(?:Store|Adapter|Provider|Composition)[^"']*["'])/,
  );
  assert.doesNotMatch(source, /:\s*(?:Request|Response|Date)\b/);
  assert.doesNotMatch(source, /MultiCutReplayResolutionCapability/);
});

test("lifecycle input and result are immutable discriminated unions", async () => {
  const completion: MultiCutReplayLifecycleInput = Object.freeze({
    inputVersion: "3.0",
    transition: "complete",
    replayIdentity,
    reservationEvidence,
    resultReference: {
      referenceVersion: "1.0",
      resultReferenceIdentity: "result:boundary",
    },
    metadata: {
      metadataVersion: "1.0",
      completedAt: "2030-01-01T00:00:00.000Z",
      completionClassification: "workflow-completed",
    },
  } as const);
  const capability: MultiCutReplayLifecycleCapability = {
    transitionReplay: async (input): Promise<MultiCutReplayLifecycleResult> => {
      assert.equal(input.transition, "complete");
      if (input.transition !== "complete") {
        throw new Error("unexpected transition");
      }
      return {
        resultVersion: "3.0",
        status: "completed",
        state: "completed",
        replayIdentity: input.replayIdentity,
        resultReference: input.resultReference,
        revision: "revision:2",
      };
    },
  };

  const result = await capability.transitionReplay(completion);
  assert.equal(result.status, "completed");
  assert.equal(completion.resultReference.resultReferenceIdentity, "result:boundary");
});

test("renew is processing-only and returns updated immutable evidence", async () => {
  const renew: MultiCutReplayLifecycleInput = Object.freeze({
    inputVersion: "3.0",
    transition: "renew",
    replayIdentity,
    reservationEvidence,
  });
  const capability: MultiCutReplayLifecycleCapability = {
    transitionReplay: async (input): Promise<MultiCutReplayLifecycleResult> => {
      assert.equal(input.transition, "renew");
      return {
        resultVersion: "3.0",
        status: "renewed",
        state: "processing",
        replayIdentity: input.replayIdentity,
        reservationEvidence: renewedReservationEvidence,
      };
    },
  };

  const result = await capability.transitionReplay(renew);
  assert.equal(result.status, "renewed");
  if (result.status === "renewed") {
    assert.equal(result.state, "processing");
    assert.equal(result.reservationEvidence, renewedReservationEvidence);
    assert.equal(
      result.reservationEvidence.reservation.reservationIdentity,
      reservationEvidence.reservation.reservationIdentity,
    );
    assert.equal(
      result.reservationEvidence.lease.leaseIdentity,
      reservationEvidence.lease.leaseIdentity,
    );
    assert.equal(
      result.reservationEvidence.fencing.fencingToken,
      reservationEvidence.fencing.fencingToken,
    );
    assert.equal(
      result.reservationEvidence.reservationAttempt,
      reservationEvidence.reservationAttempt,
    );
    assert.notEqual(
      result.reservationEvidence.expectedRevision.expectedRevision,
      reservationEvidence.expectedRevision.expectedRevision,
    );
    assert.notEqual(
      result.reservationEvidence.leaseExpiresAt,
      reservationEvidence.leaseExpiresAt,
    );
  }

  for (const terminalState of ["completed", "failed", "released"] as const) {
    const rejected: MultiCutReplayLifecycleResult = {
      resultVersion: "3.0",
      status: "conflict",
      failure: "terminal-preserved",
    };
    assert.equal(rejected.failure, "terminal-preserved", terminalState);
  }
});

test("only takeover issues a new fence", () => {
  const terminalResults: readonly MultiCutReplayLifecycleResult[] = [
    {
      resultVersion: "3.0",
      status: "completed",
      state: "completed",
      replayIdentity,
      resultReference: {
        referenceVersion: "1.0",
        resultReferenceIdentity: "result:boundary",
      },
      revision: "revision:2",
    },
    {
      resultVersion: "3.0",
      status: "failed",
      state: "failed",
      replayIdentity,
      revision: "revision:2",
    },
    {
      resultVersion: "3.0",
      status: "released",
      state: "released",
      replayIdentity,
      revision: "revision:2",
    },
  ];

  for (const result of terminalResults) {
    assert.equal("reservationEvidence" in result, false);
  }
  assert.notEqual(
    takeoverReservationEvidence.fencing.fencingToken,
    reservationEvidence.fencing.fencingToken,
  );
});

test("authoritative states are exhaustive", () => {
  const describe = (record: MultiCutReplayAuthoritativeRecord): string => {
    switch (record.state) {
      case "processing":
        return record.leaseExpiresAt;
      case "completed":
        return record.resultReference.resultReferenceIdentity;
      case "released":
        return record.releasedAt;
      case "failed":
        return record.failureClassification;
      default: {
        const exhaustive: never = record;
        return exhaustive;
      }
    }
  };
  const states: readonly MultiCutReplayRecordState[] = [
    "processing",
    "completed",
    "released",
    "failed",
  ];

  assert.deepEqual(states, [
    "processing",
    "completed",
    "released",
    "failed",
  ]);
  assert.equal(
    describe({
      recordVersion: "1.0",
      state: "failed",
      replayIdentity,
      revision: "revision:3",
      failedAt: "2030-01-01T00:00:00.000Z",
      failureClassification: "workflow-failed",
    }),
    "workflow-failed",
  );
});

test("recovery lookup is read-only across all authoritative states", async () => {
  const records: readonly MultiCutReplayAuthoritativeRecord[] = [
    {
      recordVersion: "1.0",
      state: "processing",
      replayIdentity,
      revision: "revision:1",
      leaseExpiresAt: "2030-01-01T00:05:00.000Z",
    },
    {
      recordVersion: "1.0",
      state: "completed",
      replayIdentity,
      revision: "revision:2",
      resultReference: {
        referenceVersion: "1.0",
        resultReferenceIdentity: "result:boundary",
      },
      completedAt: "2030-01-01T00:06:00.000Z",
    },
    {
      recordVersion: "1.0",
      state: "failed",
      replayIdentity,
      revision: "revision:2",
      failedAt: "2030-01-01T00:06:00.000Z",
      failureClassification: "workflow-failed",
    },
    {
      recordVersion: "1.0",
      state: "released",
      replayIdentity,
      revision: "revision:2",
      releasedAt: "2030-01-01T00:06:00.000Z",
    },
  ];
  let recordIndex = 0;
  const authoritative: MultiCutReplayRecoveryCapability = {
    lookupReplay: async (): Promise<MultiCutReplayRecoveryLookupResult> => ({
      resultVersion: "3.0",
      status: "authoritative",
      record: records[recordIndex++],
    }),
    takeoverReplay: async (): Promise<MultiCutReplayRecoveryTakeoverResult> => ({
      resultVersion: "3.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    reconcileReservationMutation: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
    }),
  };

  for (const state of ["processing", "completed", "failed", "released"] as const) {
    const result = await authoritative.lookupReplay({
      inputVersion: "3.0",
      replayIdentity,
      reason: "authoritative-lookup",
    });
    assert.equal(result.status, "authoritative");
    if (result.status === "authoritative") {
      assert.equal(result.record.state, state);
      assert.equal("reservationEvidence" in result.record, false);
    }
  }
});

test("recovery takeover returns new evidence or classified failures", async () => {
  const results: readonly MultiCutReplayRecoveryTakeoverResult[] = [
    {
      resultVersion: "3.0",
      status: "taken-over",
      state: "processing",
      replayIdentity,
      reservationEvidence: takeoverReservationEvidence,
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      failure: "stale-revision",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      failure: "stale-fence",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      failure: "takeover-conflict",
    },
  ];
  let resultIndex = 0;
  const capability: MultiCutReplayRecoveryCapability = {
    lookupReplay: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    takeoverReplay: async (input) => {
      assert.equal(input.reservationEvidence, reservationEvidence);
      return results[resultIndex++];
    },
    reconcileReservationMutation: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
    }),
  };

  for (const expected of results) {
    const result = await capability.takeoverReplay({
      inputVersion: "3.0",
      replayIdentity,
      reservationEvidence,
    });
    assert.deepEqual(result, expected);
  }
});

test("renew reconciliation is read-only and exhaustively classified", async () => {
  const results: readonly MultiCutReplayReservationMutationReconciliationResult[] = [
    {
      resultVersion: "3.0",
      status: "confirmed",
      mutation: "renew",
      replayIdentity,
      authoritativeReservationEvidence: renewedReservationEvidence,
    },
    {
      resultVersion: "3.0",
      status: "not-applied",
      mutation: "renew",
      replayIdentity,
      authoritativeReservationEvidence: reservationEvidence,
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "renew",
      failure: "reservation-changed",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "renew",
      failure: "lease-changed",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "renew",
      failure: "fence-changed",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "renew",
      failure: "attempt-changed",
    },
    {
      resultVersion: "3.0",
      status: "terminal",
      state: "completed",
      replayIdentity,
    },
    {
      resultVersion: "3.0",
      status: "terminal",
      state: "failed",
      replayIdentity,
    },
    {
      resultVersion: "3.0",
      status: "terminal",
      state: "released",
      replayIdentity,
    },
    { resultVersion: "3.0", status: "not-found" },
    { resultVersion: "3.0", status: "corrupted" },
    { resultVersion: "3.0", status: "unavailable" },
    { resultVersion: "3.0", status: "reconciliation-required" },
  ];
  let index = 0;
  const capability: MultiCutReplayRecoveryCapability = {
    lookupReplay: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    takeoverReplay: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    reconcileReservationMutation: async (input) => {
      assert.equal(input.mutation, "renew");
      assert.equal(input.previousReservationEvidence, reservationEvidence);
      return results[index++];
    },
  };

  for (const expected of results) {
    const actual = await capability.reconcileReservationMutation({
      inputVersion: "3.0",
      mutation: "renew",
      replayIdentity,
      previousReservationEvidence: reservationEvidence,
    });
    assert.deepEqual(actual, expected);
    if (actual.status === "terminal") {
      assert.equal("authoritativeReservationEvidence" in actual, false);
    }
  }
});

test("takeover reconciliation preserves caller intent without a requested fence", async () => {
  const results: readonly MultiCutReplayReservationMutationReconciliationResult[] = [
    {
      resultVersion: "3.0",
      status: "confirmed",
      mutation: "takeover",
      replayIdentity,
      authoritativeReservationEvidence: takeoverReservationEvidence,
    },
    {
      resultVersion: "3.0",
      status: "not-applied",
      mutation: "takeover",
      replayIdentity,
      authoritativeReservationEvidence: reservationEvidence,
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "takeover",
      failure: "takeover-intent-mismatch",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "takeover",
      failure: "reservation-changed",
    },
    {
      resultVersion: "3.0",
      status: "conflict",
      mutation: "takeover",
      failure: "lease-changed",
    },
    {
      resultVersion: "3.0",
      status: "terminal",
      state: "completed",
      replayIdentity,
    },
    {
      resultVersion: "3.0",
      status: "terminal",
      state: "failed",
      replayIdentity,
    },
    {
      resultVersion: "3.0",
      status: "terminal",
      state: "released",
      replayIdentity,
    },
    { resultVersion: "3.0", status: "not-found" },
    { resultVersion: "3.0", status: "corrupted" },
    { resultVersion: "3.0", status: "unavailable" },
    { resultVersion: "3.0", status: "reconciliation-required" },
  ];
  let index = 0;
  const capability: MultiCutReplayRecoveryCapability = {
    lookupReplay: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    takeoverReplay: async () => ({
      resultVersion: "3.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    reconcileReservationMutation: async (input) => {
      assert.equal(input.mutation, "takeover");
      if (input.mutation !== "takeover") {
        throw new Error("unexpected mutation");
      }
      assert.equal(
        input.requestedNextReservation.reservationIdentity,
        takeoverReservationEvidence.reservation.reservationIdentity,
      );
      assert.equal(
        input.requestedNextLease.leaseIdentity,
        takeoverReservationEvidence.lease.leaseIdentity,
      );
      assert.equal("fencing" in input, false);
      assert.equal("leaseExpiresAt" in input, false);
      return results[index++];
    },
  };

  for (const expected of results) {
    const actual = await capability.reconcileReservationMutation({
      inputVersion: "3.0",
      mutation: "takeover",
      replayIdentity,
      previousReservationEvidence: reservationEvidence,
      requestedNextReservation: takeoverReservationEvidence.reservation,
      requestedNextLease: takeoverReservationEvidence.lease,
    });
    assert.deepEqual(actual, expected);
    if (actual.status === "terminal") {
      assert.equal("authoritativeReservationEvidence" in actual, false);
    }
  }
});

test("reconciliation result union is exhaustive", () => {
  const describe = (
    result: MultiCutReplayReservationMutationReconciliationResult,
  ): string => {
    switch (result.status) {
      case "confirmed":
      case "not-applied":
        return result.authoritativeReservationEvidence.evidenceVersion;
      case "conflict":
        return result.mutation;
      case "terminal":
        return result.state;
      case "not-found":
      case "corrupted":
      case "unavailable":
      case "reconciliation-required":
        return result.status;
      default: {
        const exhaustive: never = result;
        return exhaustive;
      }
    }
  };

  assert.equal(
    describe({ resultVersion: "3.0", status: "reconciliation-required" }),
    "reconciliation-required",
  );
});
