import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  MultiCutReplayResolutionInputV4,
  MultiCutReplayResolutionResultV4,
} from "../../../lib/server/multiCutRequestAdmission/replayResolutionTypesV4";
import type {
  MultiCutReplayLifecycleInputV4,
  MultiCutReplayLifecycleResultV4,
  MultiCutReplayRecoveryLookupInputV4,
  MultiCutReplayRecoveryLookupResultV4,
} from "../../../lib/server/multiCutReplayLifecycle/typesV4";
import type {
  MultiCutReplayAuthoritativeIdentity,
  MultiCutReplayResolvedIdentity,
} from "../../../lib/server/multiCutReplayShared/types";

const resolvedIdentity: MultiCutReplayResolvedIdentity = Object.freeze({
  identityVersion: "1.0",
  keyIdentity: "key:v4",
  requestFingerprintIdentity: "fingerprint:v4",
});

const authoritativeIdentity: MultiCutReplayAuthoritativeIdentity =
  Object.freeze({
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
    resolvedIdentity,
  } as const);

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

test("V4 contracts are type-only and depend only on shared types", async () => {
  for (const relativePath of [
    "../../../lib/server/multiCutRequestAdmission/replayResolutionTypesV4.ts",
    "../../../lib/server/multiCutReplayLifecycle/typesV4.ts",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    const imports = [
      ...source.matchAll(
        /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g,
      ),
    ];

    assert.equal(imports.every((match) => match[1] !== undefined), true);
    assert.equal(
      imports.every(
        (match) => match[2] === "../multiCutReplayShared/types",
      ),
      true,
    );
    assert.doesNotMatch(
      source,
      /\b(?:const|let|var|function|class|enum|namespace)\b/,
    );
    assert.doesNotMatch(
      source,
      /(?:PostgreSQL|node:|next\/|react|filesystem|process\.env|Runtime|Adapter|Store|Provider|Composition)/,
    );
    assert.doesNotMatch(source, /from\s+["']\.\/types["']/);
  }
});

test("V4 resolution success preserves the authoritative identity", () => {
  const input: MultiCutReplayResolutionInputV4 = {
    resolutionInputVersion: "4.0",
    identity: authoritativeIdentity,
  };
  const result: MultiCutReplayResolutionResultV4 = {
    resultVersion: "4.0",
    status: "new",
    identity: input.identity,
    reservationEvidence,
  };

  assert.equal(result.identity.identityVersion, "2.0");
  assert.equal(
    result.identity.protectedScope.tenant.protectedTenantIdentity,
    "tenant:protected",
  );
  assert.equal(
    result.identity.resolvedIdentity.requestFingerprintIdentity,
    "fingerprint:v4",
  );
});

test("V4 lifecycle requires and preserves the complete identity", () => {
  const input: MultiCutReplayLifecycleInputV4 = {
    inputVersion: "4.0",
    transition: "renew",
    replayIdentity: authoritativeIdentity,
    reservationEvidence,
  };
  const result: MultiCutReplayLifecycleResultV4 = {
    resultVersion: "4.0",
    status: "renewed",
    state: "processing",
    replayIdentity: input.replayIdentity,
    reservationEvidence,
  };

  assert.equal(result.replayIdentity.protectedScope.scopeVersion, "1.0");
  assert.equal(
    result.replayIdentity.resolvedIdentity.keyIdentity,
    "key:v4",
  );
});

test("V4 recovery requires the same complete identity", () => {
  const input: MultiCutReplayRecoveryLookupInputV4 = {
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reason: "authoritative-lookup",
  };
  const result: MultiCutReplayRecoveryLookupResultV4 = {
    resultVersion: "4.0",
    status: "authoritative",
    record: {
      recordVersion: "1.0",
      state: "processing",
      replayIdentity: input.replayIdentity,
      revision: "revision:1",
      leaseExpiresAt: "2030-01-01T00:05:00.000Z",
    },
  };

  assert.equal(
    result.record.replayIdentity.protectedScope.replayNamespace,
    "multi-cut",
  );
});

test("V3 resolved identity is not an implicit V4 authoritative identity", () => {
  const invalid: MultiCutReplayResolutionInputV4 = {
    resolutionInputVersion: "4.0",
    // @ts-expect-error V4 requires Protected Scope through Identity Schema V2.
    identity: resolvedIdentity,
  };

  assert.equal(invalid.identity.identityVersion, "1.0");
});

test("fingerprint remains nested semantic identity, not a lookup field", () => {
  const resolutionInput: MultiCutReplayResolutionInputV4 = {
    resolutionInputVersion: "4.0",
    identity: authoritativeIdentity,
  };
  const lifecycleInput: MultiCutReplayLifecycleInputV4 = {
    inputVersion: "4.0",
    transition: "renew",
    replayIdentity: authoritativeIdentity,
    reservationEvidence,
  };
  const recoveryInput: MultiCutReplayRecoveryLookupInputV4 = {
    inputVersion: "4.0",
    replayIdentity: authoritativeIdentity,
    reason: "authoritative-lookup",
  };

  assert.equal("requestFingerprintIdentity" in resolutionInput, false);
  assert.equal("requestFingerprintIdentity" in lifecycleInput, false);
  assert.equal("requestFingerprintIdentity" in recoveryInput, false);
});
