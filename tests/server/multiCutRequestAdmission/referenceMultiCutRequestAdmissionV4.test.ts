import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  runReferenceMultiCutRequestAdmissionV4,
} from "../../../lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmissionV4";
import type {
  MultiCutRequestAdmissionInputV4,
} from "../../../lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmissionV4";
import type {
  MultiCutReplayResolutionCapabilityV4,
} from "../../../lib/server/multiCutRequestAdmission/replayResolutionTypesV4";

const createInput = (): MultiCutRequestAdmissionInputV4 => ({
  admissionInputVersion: "4.0",
  replayScope: {
    scopeVersion: "1.0",
    replayNamespace: "multi-cut-request-admission",
    tenant: {
      identityVersion: "1.0",
      protectedTenantIdentity: "protected-tenant:admission",
    },
    operationIdentity: "multi-cut:create",
  },
  idempotencyKey: "key:admission",
  fingerprintInput: {
    fingerprintInputVersion: "1.0",
    request: {
      requestVersion: "1.0",
      jobId: "11111111-1111-4111-8111-111111111111",
      mediaId: "22222222-2222-4222-8222-222222222222",
      clips: [{ start: 0, end: 1, title: "clip" }],
      outputFormat: "original",
    },
    authenticatedRequest: {
      contextVersion: "1.0",
      requestIdentity: "request:admission",
      subject: {
        subjectVersion: "1.0",
        subjectReference: "subject:admission",
        subjectClassification: "user",
        tenantReference: "tenant:admission",
        authenticationStrength: "single-factor",
      },
      tenantReference: "tenant:admission",
      action: "multi-cut:create",
      resource: {
        resourceVersion: "1.0",
        resourceKind: "route",
        resourceReference: "multi-cut",
        tenantReference: "tenant:admission",
      },
    },
    sourceArtifactHandoff: {
      handoffVersion: "1.0",
      authorityInput: {
        inputVersion: "1.0",
        sourceArtifact: {
          referenceVersion: "1.0",
          opaqueSourceArtifactReference: "source:admission",
        },
        context: {
          contextVersion: "1.0",
          requestIdentity: "request:admission",
          operationIdentity: "operation:admission",
          ownershipScope: {
            scopeVersion: "1.0",
            sourceTenantReference: "tenant:admission",
            sourceOwnershipReference: "owner:admission",
          },
          authorizationEvidence: {
            evidenceVersion: "1.0",
            authorityDecisionReference: "decision:admission",
            decision: "authorized",
          },
        },
      },
    },
  },
});

const reservationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  reservation: {
    reservationVersion: "1.0" as const,
    reservationIdentity: "reservation:v4",
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

test("V4 generates one authoritative identity and preserves it", async () => {
  const input = createInput();
  let invocations = 0;
  let capturedIdentity: unknown;
  const replay: MultiCutReplayResolutionCapabilityV4 = {
    resolveReplay: async (resolutionInput) => {
      invocations += 1;
      capturedIdentity = resolutionInput.identity;
      return {
        resultVersion: "4.0",
        status: "new",
        identity: resolutionInput.identity,
        reservationEvidence,
      };
    },
  };

  const result = await runReferenceMultiCutRequestAdmissionV4(input, replay);

  assert.equal(invocations, 1);
  assert.equal(result.status, "new");
  if (result.status !== "new") throw new Error("expected new");
  assert.equal(result.replayIdentity, capturedIdentity);
  assert.equal(result.replayIdentity.identityVersion, "2.0");
  assert.equal(result.replayIdentity.protectedScope, input.replayScope);
  assert.equal(
    result.replayIdentity.resolvedIdentity.keyIdentity,
    input.idempotencyKey,
  );
  assert.match(
    result.replayIdentity.resolvedIdentity.requestFingerprintIdentity,
    /^multi-cut-request-fingerprint:v1:[0-9a-f]{16}$/,
  );
  assert.equal(Object.isFrozen(result.replayIdentity), true);
  assert.equal(Object.isFrozen(result.replayIdentity.resolvedIdentity), true);
});

test("V4 preserves the identity returned by Resolution", async () => {
  const input = createInput();
  let handedOffIdentity: Parameters<
    MultiCutReplayResolutionCapabilityV4["resolveReplay"]
  >[0]["identity"] | undefined;
  const replay: MultiCutReplayResolutionCapabilityV4 = {
    resolveReplay: async (resolutionInput) => {
      handedOffIdentity = resolutionInput.identity;
      return {
        resultVersion: "4.0",
        status: "replay",
        identity: resolutionInput.identity,
        resultReference: {
          referenceVersion: "1.0",
          resultReferenceIdentity: "result:v4",
        },
      };
    },
  };

  const result = await runReferenceMultiCutRequestAdmissionV4(input, replay);

  assert.equal(result.status, "replay");
  if (result.status !== "replay") throw new Error("expected replay");
  assert.equal(result.replayIdentity, handedOffIdentity);
  assert.equal(
    result.replayIdentity.protectedScope.tenant.protectedTenantIdentity,
    input.replayScope.tenant.protectedTenantIdentity,
  );
});

test("V4 rejects missing scope without invoking Resolution", async () => {
  let invocations = 0;
  const replay: MultiCutReplayResolutionCapabilityV4 = {
    resolveReplay: async () => {
      invocations += 1;
      throw new Error("must not be invoked");
    },
  };
  const input = {
    ...createInput(),
    replayScope: undefined,
  } as unknown as MultiCutRequestAdmissionInputV4;

  const result = await runReferenceMultiCutRequestAdmissionV4(input, replay);

  assert.deepEqual(result, {
    resultVersion: "4.0",
    status: "failed",
    failure: "invalid-scope",
  });
  assert.equal(invocations, 0);
});

test("V4 has no V3 fallback or implicit input upgrade", async () => {
  let invocations = 0;
  const replay: MultiCutReplayResolutionCapabilityV4 = {
    resolveReplay: async () => {
      invocations += 1;
      throw new Error("must not be invoked");
    },
  };
  const v3Input = {
    ...createInput(),
    admissionInputVersion: "3.0",
  } as unknown as MultiCutRequestAdmissionInputV4;

  const result = await runReferenceMultiCutRequestAdmissionV4(v3Input, replay);

  assert.deepEqual(result, {
    resultVersion: "4.0",
    status: "failed",
    failure: "unsupported-version",
  });
  assert.equal(invocations, 0);
});

test("V4 runtime boundary excludes persistence and lifecycle dependencies", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmissionV4.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /(?:PostgreSQL|node:|next\/|react|filesystem|Store|Database|Lifecycle|Recovery|process\.env|Date\.now|Math\.random|crypto|createHash|singleton|globalThis)/,
  );
  assert.doesNotMatch(source, /runReferenceMultiCutRequestAdmission\b/);
  assert.doesNotMatch(source, /resolutionInputVersion:\s*"3\.0"/);
  assert.match(
    source,
    /createMultiCutReplayAuthoritativeIdentity\s*\(/,
  );
});
