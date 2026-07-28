import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runReferenceMultiCutRequestAdmission } from "../../../lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmission";
import type {
  MultiCutReplayResolutionCapability,
  MultiCutReplayResolutionResult,
  MultiCutRequestAdmissionInput,
} from "../../../lib/server/multiCutRequestAdmission/types";

const createInput = (): MultiCutRequestAdmissionInput => ({
  admissionInputVersion: "3.0",
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
    reservationIdentity: "reservation:authoritative",
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

const resultReference = Object.freeze({
  referenceVersion: "1.0" as const,
  resultReferenceIdentity: "result:authoritative",
});

const replayCapability = (
  project: (
    input: Parameters<MultiCutReplayResolutionCapability["resolveReplay"]>[0],
  ) => MultiCutReplayResolutionResult,
): MultiCutReplayResolutionCapability => ({
  resolveReplay: async (input) => project(input),
});

test("projection is deterministic, immutable, and private", async () => {
  const captures: unknown[] = [];
  const input = createInput();
  const dependency = replayCapability((input) => {
    captures.push(input);
    return {
      resultVersion: "3.0",
      status: "new",
      identity: input.identity,
      reservationEvidence,
    };
  });

  const first = await runReferenceMultiCutRequestAdmission(input, dependency);
  const second = await runReferenceMultiCutRequestAdmission(input, dependency);

  assert.equal(first.status, "new");
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(captures[0]), true);
  const captured = captures[0] as {
    readonly scope: MultiCutRequestAdmissionInput["replayScope"];
    readonly identity: {
      readonly requestFingerprintIdentity: string;
    };
  };
  assert.equal(captured.scope, input.replayScope);
  assert.equal(Object.isFrozen(captured.identity), true);
  assert.match(
    captured.identity.requestFingerprintIdentity,
    /^multi-cut-request-fingerprint:v1:[0-9a-f]{16}$/,
  );

  const module = await import(
    "../../../lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmission"
  );
  assert.deepEqual(Object.keys(module), ["runReferenceMultiCutRequestAdmission"]);
});

test("new preserves authoritative identity and reservation evidence", async () => {
  const result = await runReferenceMultiCutRequestAdmission(
    createInput(),
    replayCapability(() => ({
      resultVersion: "3.0",
      status: "new",
      identity: {
        identityVersion: "1.0",
        keyIdentity: "replay-key:new",
        requestFingerprintIdentity: "replay-fingerprint:new",
      },
      reservationEvidence,
    })),
  );

  assert.equal(result.status, "new");
  if (result.status !== "new") throw new Error("expected new");
  assert.equal(result.replayIdentity.keyIdentity, "replay-key:new");
  assert.equal(result.reservationEvidence, reservationEvidence);
  assert.equal(result.idempotency.replayClassification, "new");
  assert.equal("resultReference" in result, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.idempotency), true);
});

test("replay preserves authoritative identity and result reference", async () => {
  const result = await runReferenceMultiCutRequestAdmission(
    createInput(),
    replayCapability(() => ({
      resultVersion: "3.0",
      status: "replay",
      identity: {
        identityVersion: "1.0",
        keyIdentity: "replay-key:replay",
        requestFingerprintIdentity: "replay-fingerprint:replay",
      },
      resultReference,
    })),
  );

  assert.equal(result.status, "replay");
  if (result.status !== "replay") throw new Error("expected replay");
  assert.equal(result.replayIdentity.keyIdentity, "replay-key:replay");
  assert.equal(result.resultReference, resultReference);
  assert.equal("reservationEvidence" in result, false);
  assert.equal("finalResult" in result, false);
});

test("authoritative failed is passed through without projection", async () => {
  const result = await runReferenceMultiCutRequestAdmission(
    createInput(),
    replayCapability(() => ({
      resultVersion: "3.0",
      status: "authoritative-failed",
    })),
  );

  assert.deepEqual(result, {
    resultVersion: "3.0",
    status: "authoritative-failed",
  });
  assert.equal("failure" in result, false);
  assert.equal("replayIdentity" in result, false);
  assert.equal("reservationEvidence" in result, false);
  assert.equal("resultReference" in result, false);
});

test("replay failures map to admission failures", async () => {
  const cases = [
    ["duplicate-in-flight", "duplicate-in-flight"],
    ["semantic-conflict", "semantic-conflict"],
    ["unavailable", "dependency-unavailable"],
  ] as const;

  for (const [status, failure] of cases) {
    const result = await runReferenceMultiCutRequestAdmission(
      createInput(),
      replayCapability(() => ({ resultVersion: "3.0", status })),
    );
    assert.deepEqual(result, {
      resultVersion: "3.0",
      status: "failed",
      failure,
    });
  }
});

test("dependency exceptions are contained", async () => {
  const result = await runReferenceMultiCutRequestAdmission(createInput(), {
    resolveReplay: async () => {
      throw new Error("private dependency detail");
    },
  });
  assert.deepEqual(result, {
    resultVersion: "3.0",
    status: "failed",
    failure: "internal-failure",
  });
});

test("invalid input is rejected before replay invocation", async () => {
  let invocations = 0;
  const dependency = replayCapability((input) => {
    invocations += 1;
    return {
      resultVersion: "3.0",
      status: "new",
      identity: input.identity,
      reservationEvidence,
    };
  });
  const cases: readonly [
    MultiCutRequestAdmissionInput,
    "missing-key" | "invalid-key" | "unsupported-version",
  ][] = [
    [{ ...createInput(), idempotencyKey: "" }, "missing-key"],
    [{ ...createInput(), idempotencyKey: " key " }, "invalid-key"],
    [
      { ...createInput(), admissionInputVersion: "2.0" as "3.0" },
      "unsupported-version",
    ],
  ];

  for (const [input, failure] of cases) {
    assert.deepEqual(
      await runReferenceMultiCutRequestAdmission(input, dependency),
      { resultVersion: "3.0", status: "failed", failure },
    );
  }
  assert.equal(invocations, 0);
});

test("runtime boundary excludes infrastructure and public projector exports", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutRequestAdmission/referenceMultiCutRequestAdmission.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|fetch\s*\(|filesystem|node:fs|Store|Database|process\.env|Date\.now|Math\.random|crypto|createHash|singleton|globalThis)/i,
  );
  assert.doesNotMatch(
    source,
    /export\s+(?:const|function)\s+projectRequestFingerprintIdentity/,
  );
  assert.match(
    source,
    /const projectRequestFingerprintIdentity\s*=/,
  );
  assert.match(source, /switch\s*\(replayResult\.status\)/);
  assert.match(source, /const unreachable:\s*never\s*=\s*replayResult/);
});
