import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  MultiCutReplayLogicalIdentityInvariantsV2,
  MultiCutReplayLogicalRecordIdentityV2,
  MultiCutReplayLogicalRecordV2,
  MultiCutReplayLogicalRequestSemanticsV2,
} from "../../../lib/server/multiCutReplayLogicalSchema/typesV2";
import type {
  MultiCutReplayAuthoritativeIdentity,
} from "../../../lib/server/multiCutReplayShared/types";

const authoritativeIdentity: MultiCutReplayAuthoritativeIdentity = {
  identityVersion: "2.0",
  protectedScope: {
    scopeVersion: "1.0",
    replayNamespace: "multi-cut",
    tenant: {
      identityVersion: "1.0",
      protectedTenantIdentity: "tenant:protected",
    },
    operationIdentity: "multi-cut:create",
  },
  resolvedIdentity: {
    identityVersion: "1.0",
    keyIdentity: "key:logical",
    requestFingerprintIdentity: "fingerprint:logical",
  },
};

const recordIdentity = (
  identity: MultiCutReplayAuthoritativeIdentity,
): MultiCutReplayLogicalRecordIdentityV2 => ({
  identityVersion: "2.0",
  protectedScope: identity.protectedScope,
  keyIdentity: identity.resolvedIdentity.keyIdentity,
});

const requestSemantics = (
  identity: MultiCutReplayAuthoritativeIdentity,
): MultiCutReplayLogicalRequestSemanticsV2 => ({
  semanticsVersion: "1.0",
  requestFingerprintIdentity:
    identity.resolvedIdentity.requestFingerprintIdentity,
  role: "semantic-compatibility-only",
});

const processingRecord = (
  identity: MultiCutReplayAuthoritativeIdentity,
): MultiCutReplayLogicalRecordV2 => ({
  logicalSchemaVersion: "2.0",
  recordIdentity: recordIdentity(identity),
  requestSemantics: requestSemantics(identity),
  revision: "revision:1",
  state: "processing",
  reservationEvidence: {
    evidenceVersion: "1.0",
    reservation: {
      reservationVersion: "1.0",
      reservationIdentity: "reservation:logical",
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
});

test("logical schema V2 is type-only and boundary-safe", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayLogicalSchema/typesV2.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const imports = [
    ...source.matchAll(
      /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g,
    ),
  ];

  assert.equal(imports.every((entry) => entry[1] !== undefined), true);
  assert.deepEqual(
    imports.map((entry) => entry[2]),
    [
      "../multiCutReplayShared/types",
      "../multiCutReplayLifecycle/typesV4",
    ],
  );
  assert.doesNotMatch(
    source,
    /\b(?:const|let|var|function|class|enum|namespace)\b/,
  );
  assert.doesNotMatch(
    source,
    /(?:PostgreSQL|SQL|Statement|Adapter|Runtime|Client|table|column|index|constraint|JSONB|migration|node:|next\/|react|filesystem|process\.env)/,
  );
});

test("record identity requires complete scope and key", () => {
  const identity = recordIdentity(authoritativeIdentity);

  assert.equal(identity.identityVersion, "2.0");
  assert.equal(identity.protectedScope.scopeVersion, "1.0");
  assert.equal(
    identity.protectedScope.tenant.protectedTenantIdentity,
    "tenant:protected",
  );
  assert.equal(identity.keyIdentity, "key:logical");

  // @ts-expect-error A V2 record identity cannot omit Protected Scope.
  const missingScope: MultiCutReplayLogicalRecordIdentityV2 = {
    identityVersion: "2.0",
    keyIdentity: "key:logical",
  };
  assert.equal("protectedScope" in missingScope, false);
});

test("fingerprint semantics are separate from the record selector", () => {
  const identity = recordIdentity(authoritativeIdentity);
  const semantics = requestSemantics(authoritativeIdentity);

  assert.equal("requestFingerprintIdentity" in identity, false);
  assert.equal(
    semantics.requestFingerprintIdentity,
    "fingerprint:logical",
  );
  assert.equal(semantics.role, "semantic-compatibility-only");
});

test("scope plus key determines logical identity with scope isolation", () => {
  const same = recordIdentity(authoritativeIdentity);
  const sameAgain = recordIdentity(authoritativeIdentity);
  const otherScope = recordIdentity({
    ...authoritativeIdentity,
    protectedScope: {
      ...authoritativeIdentity.protectedScope,
      tenant: {
        ...authoritativeIdentity.protectedScope.tenant,
        protectedTenantIdentity: "tenant:other",
      },
    },
  });

  assert.deepEqual(same, sameAgain);
  assert.notDeepEqual(same, otherScope);
  assert.equal(same.keyIdentity, otherScope.keyIdentity);
});

test("lifecycle and recovery state projections preserve record identity", () => {
  const processing = processingRecord(authoritativeIdentity);
  const completed: MultiCutReplayLogicalRecordV2 = {
    logicalSchemaVersion: "2.0",
    recordIdentity: processing.recordIdentity,
    requestSemantics: processing.requestSemantics,
    revision: "revision:2",
    state: "completed",
    resultReference: {
      referenceVersion: "1.0",
      resultReferenceIdentity: "result:logical",
    },
    metadata: {
      metadataVersion: "1.0",
      completedAt: "2030-01-01T00:06:00.000Z",
      completionClassification: "workflow-completed",
    },
  };

  assert.equal(completed.recordIdentity, processing.recordIdentity);
  assert.equal(completed.requestSemantics, processing.requestSemantics);
});

test("V2 invariants reject implicit V1 mixing and inference", () => {
  const invariants: MultiCutReplayLogicalIdentityInvariantsV2 = {
    logicalSchemaVersion: "2.0",
    authoritativeSelector: "complete-protected-scope-and-key",
    fingerprintAuthority: "semantic-compatibility-only",
    lifecycleIdentityBehavior: "preserved",
    recoveryIdentityBehavior: "preserved",
    incompleteIdentityAcceptance: "rejected",
    v1UpgradeBehavior: "not-supported",
    mixedVersionLookup: "not-supported",
  };

  assert.equal(invariants.incompleteIdentityAcceptance, "rejected");
  assert.equal(invariants.v1UpgradeBehavior, "not-supported");
  assert.equal(invariants.mixedVersionLookup, "not-supported");

  const v1Record: MultiCutReplayLogicalRecordV2 = {
    ...processingRecord(authoritativeIdentity),
    // @ts-expect-error V1 is not an accepted V2 logical schema version.
    logicalSchemaVersion: "1.0",
  };
  assert.equal(v1Record.logicalSchemaVersion, "1.0");
});
