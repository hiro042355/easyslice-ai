import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createReferenceMultiCutReplayRecoveryV4,
} from "../../../lib/server/multiCutReplayLifecycle/referenceMultiCutReplayRecoveryV4";
import type {
  MultiCutReplayRecoveryCapabilityV4,
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
      keyIdentity: "key:recovery",
      requestFingerprintIdentity: "fingerprint:recovery",
    }),
  });

const replacementIdentity: MultiCutReplayAuthoritativeIdentity =
  Object.freeze({
    ...authoritativeIdentity,
    protectedScope: Object.freeze({
      ...authoritativeIdentity.protectedScope,
      replayNamespace: "dependency-must-not-replace-input",
    }),
  });

const reservationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  reservation: Object.freeze({
    reservationVersion: "1.0" as const,
    reservationIdentity: "reservation:recovery",
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

const createDependency = (): MultiCutReplayRecoveryCapabilityV4 => ({
  lookupReplay: async () => ({
    resultVersion: "4.0",
    status: "authoritative",
    record: {
      recordVersion: "1.0",
      state: "processing",
      replayIdentity: replacementIdentity,
      revision: "revision:1",
      leaseExpiresAt: "2030-01-01T00:05:00.000Z",
    },
  }),
  takeoverReplay: async () => ({
    resultVersion: "4.0",
    status: "taken-over",
    state: "processing",
    replayIdentity: replacementIdentity,
    reservationEvidence,
  }),
  reconcileReservationMutation: async (input) => ({
    resultVersion: "4.0",
    status: "confirmed",
    mutation: input.mutation,
    replayIdentity: replacementIdentity,
    authoritativeReservationEvidence: reservationEvidence,
  }),
});

test("lookup uses and returns the exact authoritative identity", async () => {
  let capturedIdentity: unknown;
  let invocations = 0;
  const dependency = createDependency();
  const runtime = createReferenceMultiCutReplayRecoveryV4({
    ...dependency,
    lookupReplay: async (input) => {
      invocations += 1;
      capturedIdentity = input.replayIdentity;
      return dependency.lookupReplay(input);
    },
  });

  const result = await runtime.lookupReplay({
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reason: "authoritative-lookup",
  });

  assert.equal(invocations, 1);
  assert.equal(capturedIdentity, authoritativeIdentity);
  assert.equal(result.status, "authoritative");
  if (result.status !== "authoritative") {
    throw new Error("expected authoritative");
  }
  assert.equal(result.record.replayIdentity, authoritativeIdentity);
  assert.equal(
    result.record.replayIdentity.protectedScope,
    authoritativeIdentity.protectedScope,
  );
  assert.equal(
    result.record.replayIdentity.resolvedIdentity,
    authoritativeIdentity.resolvedIdentity,
  );
});

test("takeover preserves the exact lookup identity", async () => {
  const runtime =
    createReferenceMultiCutReplayRecoveryV4(createDependency());
  const result = await runtime.takeoverReplay({
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reservationEvidence,
  });

  assert.equal(result.status, "taken-over");
  if (result.status !== "taken-over") {
    throw new Error("expected taken-over");
  }
  assert.equal(result.replayIdentity, authoritativeIdentity);
  assert.equal(result.reservationEvidence, reservationEvidence);
});

test("reconciliation preserves identity for authoritative outcomes", async () => {
  const runtime =
    createReferenceMultiCutReplayRecoveryV4(createDependency());
  const result = await runtime.reconcileReservationMutation({
    inputVersion: "4.0",
    mutation: "renew",
    replayIdentity: authoritativeIdentity,
    previousReservationEvidence: reservationEvidence,
  });

  assert.equal(result.status, "confirmed");
  if (result.status !== "confirmed") {
    throw new Error("expected confirmed");
  }
  assert.equal(result.replayIdentity, authoritativeIdentity);
});

test("non-authoritative failures are returned without identity synthesis", async () => {
  const unavailable = Object.freeze({
    resultVersion: "4.0" as const,
    status: "unavailable" as const,
    failure: "dependency-unavailable" as const,
  });
  const dependency = createDependency();
  const runtime = createReferenceMultiCutReplayRecoveryV4({
    ...dependency,
    lookupReplay: async () => unavailable,
  });
  const result = await runtime.lookupReplay({
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reason: "authoritative-lookup",
  });

  assert.equal(result, unavailable);
  assert.equal("replayIdentity" in result, false);
});

test("dependency exceptions are contained without identity synthesis", async () => {
  const dependency = createDependency();
  const runtime = createReferenceMultiCutReplayRecoveryV4({
    ...dependency,
    lookupReplay: async () => {
      throw new Error("private lookup detail");
    },
    takeoverReplay: async () => {
      throw new Error("private takeover detail");
    },
    reconcileReservationMutation: async () => {
      throw new Error("private reconciliation detail");
    },
  });

  const lookup = await runtime.lookupReplay({
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reason: "authoritative-lookup",
  });
  const takeover = await runtime.takeoverReplay({
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reservationEvidence,
  });
  const reconciliation = await runtime.reconcileReservationMutation({
    inputVersion: "4.0",
    mutation: "renew",
    replayIdentity: authoritativeIdentity,
    previousReservationEvidence: reservationEvidence,
  });

  assert.deepEqual(lookup, {
    resultVersion: "4.0",
    status: "unavailable",
    failure: "internal-failure",
  });
  assert.deepEqual(takeover, {
    resultVersion: "4.0",
    status: "unavailable",
    failure: "internal-failure",
  });
  assert.deepEqual(reconciliation, {
    resultVersion: "4.0",
    status: "unavailable",
  });
});

test("runtime contains no replay identity generation or persistence", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayLifecycle/referenceMultiCutReplayRecoveryV4.ts",
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
    /(?:Admission|Lifecycle Runtime|PostgreSQL|SQL|Statement|Adapter|Workflow|next\/|react|node:fs|filesystem|process\.env|Date\.now|Math\.random|crypto|singleton|globalThis)/,
  );
  assert.match(
    source,
    /preserveLookupIdentity\(result,\s*input\.replayIdentity\)/,
  );
});
