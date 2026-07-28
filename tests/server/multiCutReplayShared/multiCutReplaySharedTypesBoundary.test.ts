import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  MultiCutReplayProtectedScope,
  MultiCutReplayReservationEvidence,
  MultiCutReplayResolvedIdentity,
  MultiCutReplayResultReference,
} from "../../../lib/server/multiCutReplayShared/types";

test("replay shared package is type-only and dependency-free", async () => {
  const source = await readFile(
    new URL(
      "../../../lib/server/multiCutReplayShared/types.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /\bimport\b/);
  assert.doesNotMatch(
    source,
    /\b(?:const|let|var|function|class|enum|namespace)\b/,
  );
  assert.doesNotMatch(
    source,
    /(?:Promise<|PostgreSQL|node:|next\/|react|filesystem|process\.env|Date\b|crypto|random|Factory|Runtime|Store|Adapter|Provider|Composition)/,
  );
});

test("shared replay values are readonly structural contracts", () => {
  const identity: MultiCutReplayResolvedIdentity = Object.freeze({
    identityVersion: "1.0",
    keyIdentity: "key:shared",
    requestFingerprintIdentity: "fingerprint:shared",
  });
  const scope: MultiCutReplayProtectedScope = Object.freeze({
    scopeVersion: "1.0",
    replayNamespace: "multi-cut",
    tenant: {
      identityVersion: "1.0",
      protectedTenantIdentity: "tenant:protected",
    },
    operationIdentity: "multi-cut:create",
  } as const);
  const evidence: MultiCutReplayReservationEvidence = Object.freeze({
    evidenceVersion: "1.0",
    reservation: {
      reservationVersion: "1.0",
      reservationIdentity: "reservation:shared",
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
      leaseIdentity: "lease:shared",
    },
    leaseExpiresAt: "2030-01-01T00:05:00.000Z",
    reservationAttempt: 1,
  } as const);
  const reference: MultiCutReplayResultReference = Object.freeze({
    referenceVersion: "1.0",
    resultReferenceIdentity: "result:shared",
  });

  assert.equal(identity.identityVersion, "1.0");
  assert.equal(scope.tenant.protectedTenantIdentity, "tenant:protected");
  assert.equal(evidence.reservationAttempt, 1);
  assert.equal(reference.resultReferenceIdentity, "result:shared");
});
