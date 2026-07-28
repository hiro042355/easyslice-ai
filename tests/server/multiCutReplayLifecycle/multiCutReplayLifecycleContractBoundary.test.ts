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
    leaseIdentity: "lease:2",
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
    inputVersion: "2.0",
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
        resultVersion: "2.0",
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
    inputVersion: "2.0",
    transition: "renew",
    replayIdentity,
    reservationEvidence,
  });
  const capability: MultiCutReplayLifecycleCapability = {
    transitionReplay: async (input): Promise<MultiCutReplayLifecycleResult> => {
      assert.equal(input.transition, "renew");
      return {
        resultVersion: "2.0",
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
  }

  for (const terminalState of ["completed", "failed", "released"] as const) {
    const rejected: MultiCutReplayLifecycleResult = {
      resultVersion: "2.0",
      status: "conflict",
      failure: "terminal-preserved",
    };
    assert.equal(rejected.failure, "terminal-preserved", terminalState);
  }
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
      resultVersion: "2.0",
      status: "authoritative",
      record: records[recordIndex++],
    }),
    takeoverReplay: async (): Promise<MultiCutReplayRecoveryTakeoverResult> => ({
      resultVersion: "2.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
  };

  for (const state of ["processing", "completed", "failed", "released"] as const) {
    const result = await authoritative.lookupReplay({
      inputVersion: "2.0",
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
      resultVersion: "2.0",
      status: "taken-over",
      state: "processing",
      replayIdentity,
      reservationEvidence: renewedReservationEvidence,
    },
    {
      resultVersion: "2.0",
      status: "conflict",
      failure: "stale-revision",
    },
    {
      resultVersion: "2.0",
      status: "conflict",
      failure: "stale-fence",
    },
    {
      resultVersion: "2.0",
      status: "conflict",
      failure: "takeover-conflict",
    },
  ];
  let resultIndex = 0;
  const capability: MultiCutReplayRecoveryCapability = {
    lookupReplay: async () => ({
      resultVersion: "2.0",
      status: "unavailable",
      failure: "dependency-unavailable",
    }),
    takeoverReplay: async (input) => {
      assert.equal(input.reservationEvidence, reservationEvidence);
      return results[resultIndex++];
    },
  };

  for (const expected of results) {
    const result = await capability.takeoverReplay({
      inputVersion: "2.0",
      replayIdentity,
      reservationEvidence,
    });
    assert.deepEqual(result, expected);
  }
});
