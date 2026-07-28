import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  MultiCutRequestAdmissionInput,
  MultiCutRequestAdmissionResult,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResolutionCapability,
} from "../../../lib/server/multiCutRequestAdmission/types";
import type {
  WorkflowEntryIdempotencyIdentity,
} from "../../../lib/server/workflowEntry/types";

test("multi-cut request admission contract is type-only and boundary-safe", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutRequestAdmission/types.ts",
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

  assert.equal(imports.every((entry) => entry.typeOnly), true);
  assert.deepEqual(
    imports.map((entry) => entry.target),
    [
      "../authBoundary/types",
      "../multiCutRoute/multiCutRouteContractTypes",
      "../source/multiCutSourceArtifactHandoffTypes",
      "../workflowEntry/types",
      "../multiCutReplayShared/types",
    ],
  );
  assert.doesNotMatch(
    source,
    /\b(?:const|let|var|function|class|enum|namespace)\b/,
  );
  assert.doesNotMatch(
    source,
    /(?:node:|next\/|react|filesystem|process\.env|fetch\s*\(|createHash|crypto|Map<|WeakMap<|singleton|registry|cache)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:WorkflowMaterializationEntryInput|WorkflowEntryInputEnvelope)/,
  );
  assert.match(
    source,
    /idempotency:\s*WorkflowEntryIdempotencyIdentity;/,
  );
  assert.doesNotMatch(source, /Omit<[\s\S]*WorkflowEntryIdempotencyIdentity/);
  assert.match(
    source,
    /identity:\s*MultiCutReplayResolvedIdentity;/,
  );
});

test("contract reuses the existing identity and exposes immutable unions", () => {
  const existingIdentity: WorkflowEntryIdempotencyIdentity = Object.freeze({
    identityVersion: "1.0",
    keyIdentity: "key:admission",
    requestFingerprintIdentity: "fingerprint:admission",
    replayClassification: "new",
  });
  const input = {
    admissionInputVersion: "2.0",
    replayScope: {
      scopeVersion: "1.0",
      replayNamespace: "multi-cut-request-admission",
      tenant: {
        identityVersion: "1.0",
        protectedTenantIdentity: "protected-tenant:admission",
      },
      operationIdentity: "multi-cut:create",
    },
    idempotencyKey: existingIdentity.keyIdentity,
    fingerprintInput: {
      fingerprintInputVersion: "1.0",
      request: {
        requestVersion: "1.0",
        clips: [{ start: 0, end: 1 }],
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
  } satisfies MultiCutRequestAdmissionInput;
  const replayIdentity: MultiCutReplayResolvedIdentity = Object.freeze({
    identityVersion: "1.0",
    keyIdentity: existingIdentity.keyIdentity,
    requestFingerprintIdentity:
      existingIdentity.requestFingerprintIdentity,
  });
  const replay: MultiCutReplayResolutionCapability = {
    resolveReplay: async () => ({
      resultVersion: "2.0",
      status: "new",
      identity: replayIdentity,
      reservationEvidence: {
        evidenceVersion: "1.0",
        reservation: {
          reservationVersion: "1.0",
          reservationIdentity: "reservation:admission",
        },
        expectedRevision: {
          revisionVersion: "1.0",
          expectedRevision: "revision:1",
        },
        fencing: {
          fencingVersion: "1.0",
          fencingToken: "fence:1",
        },
        lease: {
          leaseVersion: "1.0",
          leaseIdentity: "lease:1",
        },
        leaseExpiresAt: "2030-01-01T00:05:00.000Z",
        reservationAttempt: 1,
      },
    }),
  };
  const result: MultiCutRequestAdmissionResult = {
    resultVersion: "2.0",
    status: "new",
    idempotency: existingIdentity,
    replayIdentity,
    reservationEvidence: {
      evidenceVersion: "1.0",
      reservation: {
        reservationVersion: "1.0",
        reservationIdentity: "reservation:admission",
      },
      expectedRevision: {
        revisionVersion: "1.0",
        expectedRevision: "revision:1",
      },
      fencing: {
        fencingVersion: "1.0",
        fencingToken: "fence:1",
      },
      lease: {
        leaseVersion: "1.0",
        leaseIdentity: "lease:1",
      },
      leaseExpiresAt: "2030-01-01T00:05:00.000Z",
      reservationAttempt: 1,
    },
  };

  assert.equal(input.fingerprintInput.authenticatedRequest.requestIdentity, "request:admission");
  assert.equal(result.idempotency, existingIdentity);
  assert.equal(typeof replay.resolveReplay, "function");
});
