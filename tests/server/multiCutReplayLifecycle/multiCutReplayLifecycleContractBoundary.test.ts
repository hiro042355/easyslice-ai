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
  MultiCutReplayRecoveryResult,
} from "../../../lib/server/multiCutReplayLifecycle/types";

const replayIdentity = Object.freeze({
  identityVersion: "1.0" as const,
  keyIdentity: "key:boundary",
  requestFingerprintIdentity: "fingerprint:boundary",
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
    inputVersion: "1.0",
    transition: "complete",
    replayIdentity,
    reservation: {
      reservationVersion: "1.0",
      reservationIdentity: "reservation:boundary",
    },
    expectedRevision: {
      revisionVersion: "1.0",
      expectedRevision: "revision:1",
    },
    fencing: {
      fencingVersion: "1.0",
      fencingToken: "fence:1",
    },
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
        resultVersion: "1.0",
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

test("recovery capability returns authoritative state or safe unavailability", async () => {
  const authoritative: MultiCutReplayRecoveryCapability = {
    recoverReplay: async (): Promise<MultiCutReplayRecoveryResult> => ({
      resultVersion: "1.0",
      status: "authoritative",
      record: {
        recordVersion: "1.0",
        state: "processing",
        replayIdentity,
        reservation: {
          reservationVersion: "1.0",
          reservationIdentity: "reservation:boundary",
        },
        revision: "revision:1",
        fencing: {
          fencingVersion: "1.0",
          fencingToken: "fence:1",
        },
        leaseExpiresAt: "2030-01-01T00:05:00.000Z",
      },
    }),
  };
  const result = await authoritative.recoverReplay({
    inputVersion: "1.0",
    replayIdentity,
    reason: "stale-processing",
  });

  assert.equal(result.status, "authoritative");
  if (result.status === "authoritative") {
    assert.equal(result.record.state, "processing");
  }
});
