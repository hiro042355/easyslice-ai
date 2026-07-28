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
  admissionInputVersion: "1.0",
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

const replayCapability = (
  project: (
    input: Parameters<MultiCutReplayResolutionCapability["resolveReplay"]>[0],
  ) => MultiCutReplayResolutionResult,
): MultiCutReplayResolutionCapability => ({
  resolveReplay: async (input) => project(input),
});

test("projection is deterministic, immutable, and private", async () => {
  const captures: unknown[] = [];
  const dependency = replayCapability((input) => {
    captures.push(input);
    return { resultVersion: "1.0", status: "new", identity: input.identity };
  });

  const first = await runReferenceMultiCutRequestAdmission(createInput(), dependency);
  const second = await runReferenceMultiCutRequestAdmission(createInput(), dependency);

  assert.equal(first.status, "admitted");
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(captures[0]), true);
  const captured = captures[0] as {
    readonly identity: {
      readonly requestFingerprintIdentity: string;
    };
  };
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

test("new and replay preserve the replay capability identity", async () => {
  for (const status of ["new", "replay"] as const) {
    const result = await runReferenceMultiCutRequestAdmission(
      createInput(),
      replayCapability(() => ({
        resultVersion: "1.0",
        status,
        identity: {
          identityVersion: "1.0",
          keyIdentity: `replay-key:${status}`,
          requestFingerprintIdentity: `replay-fingerprint:${status}`,
        },
      })),
    );

    assert.deepEqual(result, {
      resultVersion: "1.0",
      status: "admitted",
      outcome: status,
      idempotency: {
        identityVersion: "1.0",
        keyIdentity: `replay-key:${status}`,
        requestFingerprintIdentity: `replay-fingerprint:${status}`,
        replayClassification: status,
      },
    });
    assert.equal(Object.isFrozen(result), true);
    if (result.status === "admitted") {
      assert.equal(Object.isFrozen(result.idempotency), true);
    }
  }
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
      replayCapability(() => ({ resultVersion: "1.0", status })),
    );
    assert.deepEqual(result, {
      resultVersion: "1.0",
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
    resultVersion: "1.0",
    status: "failed",
    failure: "internal-failure",
  });
});

test("invalid input is rejected before replay invocation", async () => {
  let invocations = 0;
  const dependency = replayCapability((input) => {
    invocations += 1;
    return { resultVersion: "1.0", status: "new", identity: input.identity };
  });
  const cases: readonly [
    MultiCutRequestAdmissionInput,
    "missing-key" | "invalid-key" | "unsupported-version",
  ][] = [
    [{ ...createInput(), idempotencyKey: "" }, "missing-key"],
    [{ ...createInput(), idempotencyKey: " key " }, "invalid-key"],
    [
      { ...createInput(), admissionInputVersion: "2.0" as "1.0" },
      "unsupported-version",
    ],
  ];

  for (const [input, failure] of cases) {
    assert.deepEqual(
      await runReferenceMultiCutRequestAdmission(input, dependency),
      { resultVersion: "1.0", status: "failed", failure },
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
});
