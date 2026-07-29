import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createReferenceMultiCutReplayLifecycleV4,
} from "../../../lib/server/multiCutReplayLifecycle/referenceMultiCutReplayLifecycleV4";
import type {
  MultiCutReplayLifecycleCapabilityV4,
  MultiCutReplayLifecycleInputV4,
  MultiCutReplayLifecycleResultV4,
} from "../../../lib/server/multiCutReplayLifecycle/typesV4";
import type {
  MultiCutReplayAuthoritativeIdentity,
} from "../../../lib/server/multiCutReplayShared/types";

const authoritativeIdentity: MultiCutReplayAuthoritativeIdentity =
  Object.freeze({
    identityVersion: "2.0",
    protectedScope: Object.freeze({
      scopeVersion: "1.0",
      replayNamespace: "multi-cut",
      tenant: Object.freeze({
        identityVersion: "1.0",
        protectedTenantIdentity: "tenant:protected",
      }),
      operationIdentity: "multi-cut:create",
    }),
    resolvedIdentity: Object.freeze({
      identityVersion: "1.0",
      keyIdentity: "key:lifecycle",
      requestFingerprintIdentity: "fingerprint:lifecycle",
    }),
  });

const reservationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  reservation: Object.freeze({
    reservationVersion: "1.0" as const,
    reservationIdentity: "reservation:lifecycle",
  }),
  expectedRevision: Object.freeze({
    revisionVersion: "1.0" as const,
    expectedRevision: "revision:1",
  }),
  fencing: Object.freeze({
    fencingVersion: "1.0" as const,
    fencingToken: "fence:1",
  }),
  lease: Object.freeze({
    leaseVersion: "1.0" as const,
    leaseIdentity: "lease:1",
  }),
  leaseExpiresAt: "2030-01-01T00:05:00.000Z",
  reservationAttempt: 1,
});

const createInput = (
  transition: MultiCutReplayLifecycleInputV4["transition"],
): MultiCutReplayLifecycleInputV4 => {
  switch (transition) {
    case "complete":
      return {
        inputVersion: "4.0",
        transition,
        replayIdentity: authoritativeIdentity,
        reservationEvidence,
        resultReference: {
          referenceVersion: "1.0",
          resultReferenceIdentity: "result:lifecycle",
        },
        metadata: {
          metadataVersion: "1.0",
          completedAt: "2030-01-01T00:06:00.000Z",
          completionClassification: "workflow-completed",
        },
      };
    case "fail":
      return {
        inputVersion: "4.0",
        transition,
        replayIdentity: authoritativeIdentity,
        reservationEvidence,
        metadata: {
          metadataVersion: "1.0",
          failedAt: "2030-01-01T00:06:00.000Z",
          failureClassification: "workflow-failed",
        },
      };
    case "release":
      return {
        inputVersion: "4.0",
        transition,
        replayIdentity: authoritativeIdentity,
        reservationEvidence,
        metadata: {
          metadataVersion: "1.0",
          releasedAt: "2030-01-01T00:06:00.000Z",
          releaseClassification: "safe-checkpoint",
        },
      };
    case "renew":
      return {
        inputVersion: "4.0",
        transition,
        replayIdentity: authoritativeIdentity,
        reservationEvidence,
      };
  }
};

const resultFor = (
  input: MultiCutReplayLifecycleInputV4,
): MultiCutReplayLifecycleResultV4 => {
  switch (input.transition) {
    case "complete":
      return {
        resultVersion: "4.0",
        status: "completed",
        state: "completed",
        replayIdentity: {
          ...authoritativeIdentity,
          protectedScope: {
            ...authoritativeIdentity.protectedScope,
            replayNamespace: "dependency-must-not-replace-input",
          },
        },
        resultReference: input.resultReference,
        revision: "revision:2",
      };
    case "fail":
      return {
        resultVersion: "4.0",
        status: "failed",
        state: "failed",
        replayIdentity: authoritativeIdentity,
        revision: "revision:2",
      };
    case "release":
      return {
        resultVersion: "4.0",
        status: "released",
        state: "released",
        replayIdentity: authoritativeIdentity,
        revision: "revision:2",
      };
    case "renew":
      return {
        resultVersion: "4.0",
        status: "renewed",
        state: "processing",
        replayIdentity: authoritativeIdentity,
        reservationEvidence,
      };
  }
};

test("V4 lifecycle preserves the exact input identity for every success", async () => {
  let invocations = 0;
  const dependency: MultiCutReplayLifecycleCapabilityV4 = {
    transitionReplay: async (input) => {
      invocations += 1;
      return resultFor(input);
    },
  };
  const runtime = createReferenceMultiCutReplayLifecycleV4(dependency);

  for (const transition of [
    "complete",
    "fail",
    "release",
    "renew",
  ] as const) {
    const input = createInput(transition);
    const result = await runtime.transitionReplay(input);

    assert.ok(
      result.status === "completed" ||
        result.status === "failed" ||
        result.status === "released" ||
        result.status === "renewed",
    );
    if (
      result.status === "completed" ||
      result.status === "failed" ||
      result.status === "released" ||
      result.status === "renewed"
    ) {
      assert.equal(result.replayIdentity, input.replayIdentity);
      assert.equal(
        result.replayIdentity.protectedScope,
        input.replayIdentity.protectedScope,
      );
      assert.equal(
        result.replayIdentity.resolvedIdentity,
        input.replayIdentity.resolvedIdentity,
      );
    }
  }

  assert.equal(invocations, 4);
});

test("V4 lifecycle preserves non-identity transition output", async () => {
  const input = createInput("complete");
  const dependency: MultiCutReplayLifecycleCapabilityV4 = {
    transitionReplay: async (received) => resultFor(received),
  };
  const result =
    await createReferenceMultiCutReplayLifecycleV4(
      dependency,
    ).transitionReplay(input);

  assert.equal(result.status, "completed");
  if (result.status !== "completed") throw new Error("expected completed");
  assert.equal(result.revision, "revision:2");
  assert.equal(
    result.resultReference.resultReferenceIdentity,
    "result:lifecycle",
  );
});

test("V4 lifecycle leaves non-identity failures unchanged", async () => {
  const conflict = Object.freeze({
    resultVersion: "4.0" as const,
    status: "conflict" as const,
    failure: "stale-revision" as const,
  });
  const dependency: MultiCutReplayLifecycleCapabilityV4 = {
    transitionReplay: async () => conflict,
  };
  const result =
    await createReferenceMultiCutReplayLifecycleV4(
      dependency,
    ).transitionReplay(createInput("renew"));

  assert.equal(result, conflict);
});

test("V4 lifecycle contains dependency exceptions without identity synthesis", async () => {
  const dependency: MultiCutReplayLifecycleCapabilityV4 = {
    transitionReplay: async () => {
      throw new Error("private dependency detail");
    },
  };
  const result =
    await createReferenceMultiCutReplayLifecycleV4(
      dependency,
    ).transitionReplay(createInput("renew"));

  assert.deepEqual(result, {
    resultVersion: "4.0",
    status: "unavailable",
    failure: "internal-failure",
  });
  assert.equal("replayIdentity" in result, false);
});

test("runtime contains no replay identity generation or infrastructure", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayLifecycle/referenceMultiCutReplayLifecycleV4.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /identityVersion\s*:/);
  assert.doesNotMatch(source, /protectedScope\s*:/);
  assert.doesNotMatch(source, /resolvedIdentity\s*:/);
  assert.doesNotMatch(source, /requestFingerprintIdentity/);
  assert.doesNotMatch(source, /keyIdentity/);
  assert.doesNotMatch(
    source,
    /(?:Admission|Recovery|PostgreSQL|SQL|Statement|Adapter|Workflow|next\/|react|node:fs|filesystem|process\.env|Date\.now|Math\.random|crypto|singleton|globalThis)/,
  );
  assert.match(
    source,
    /preserveInputIdentity\(result,\s*input\.replayIdentity\)/,
  );
});
