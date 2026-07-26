import assert from "node:assert/strict";
import test from "node:test";

import { createDeterministicSourceArtifactAuthorityFixture } from "../../../lib/server/sourceArtifactAuthority/referenceDeterministicSourceArtifactAuthority";
import type {
  SourceArtifactAuthorityResolutionInput,
  SourceArtifactAuthorityResolutionResult,
} from "../../../lib/server/sourceArtifactAuthority/types";

const ownershipScope = Object.freeze({
  scopeVersion: "1.0" as const,
  sourceTenantReference: "tenant-alpha",
  sourceOwnershipReference: "owner-alpha",
});
const authorizationEvidence = Object.freeze({
  evidenceVersion: "1.0" as const,
  authorityDecisionReference: "decision-alpha",
  decision: "authorized" as const,
});
const input = (
  overrides: Partial<SourceArtifactAuthorityResolutionInput> = {},
): SourceArtifactAuthorityResolutionInput => ({
  inputVersion: "1.0",
  sourceArtifact: {
    referenceVersion: "1.0",
    opaqueSourceArtifactReference: "source-alpha",
  },
  context: {
    contextVersion: "1.0",
    requestIdentity: "request-alpha",
    operationIdentity: "operation-alpha",
    ownershipScope,
    authorizationEvidence,
  },
  ...overrides,
});

const fixture = createDeterministicSourceArtifactAuthorityFixture([
  {
    recordVersion: "1.0",
    opaqueSourceArtifactReference: "source-alpha",
    opaqueAuthorityRecordReference: "authority-alpha",
    opaqueResolutionReference: "resolution-alpha",
    ownershipScope,
    authorizationEvidence,
    outcome: "authorized",
  },
  {
    recordVersion: "1.0",
    opaqueSourceArtifactReference: "source-revoked",
    opaqueAuthorityRecordReference: "authority-revoked",
    opaqueResolutionReference: "resolution-revoked",
    ownershipScope,
    authorizationEvidence,
    outcome: "revoked",
  },
]);

test("deterministically resolves an authorized source without exposing a location", () => {
  const first = fixture.resolveSourceArtifact(input()) as SourceArtifactAuthorityResolutionResult;
  const second = fixture.resolveSourceArtifact(input()) as SourceArtifactAuthorityResolutionResult;

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    resultVersion: "1.0",
    status: "authorized",
    opaqueAuthorityRecordReference: "authority-alpha",
    opaqueResolutionReference: "resolution-alpha",
    ownershipScope,
    authorizationEvidence,
  });
  assert.equal("location" in first, false);
  assert.equal(Object.isFrozen(first), true);
  if (first.status === "authorized") {
    assert.equal(Object.isFrozen(first.ownershipScope), true);
    assert.equal(Object.isFrozen(first.authorizationEvidence), true);
  }
});

test("enforces authority ownership scope without cross-scope disclosure", () => {
  const result = fixture.resolveSourceArtifact(input({
    context: {
      ...input().context,
      ownershipScope: {
        ...ownershipScope,
        sourceOwnershipReference: "owner-other",
      },
    },
  }));

  assert.deepEqual(result, {
    resultVersion: "1.0",
    status: "rejected",
    classification: "unauthorized",
  });
});

test("returns classified failures for lifecycle and lookup outcomes", () => {
  const revoked = fixture.resolveSourceArtifact(input({
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-revoked",
    },
  }));
  const missing = fixture.resolveSourceArtifact(input({
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-missing",
    },
  }));
  const invalid = fixture.resolveSourceArtifact(input({
    context: {
      ...input().context,
      requestIdentity: "",
    },
  }));

  assert.deepEqual(revoked, {
    resultVersion: "1.0",
    status: "rejected",
    classification: "revoked",
  });
  assert.deepEqual(missing, {
    resultVersion: "1.0",
    status: "rejected",
    classification: "missing",
  });
  assert.deepEqual(invalid, {
    resultVersion: "1.0",
    status: "rejected",
    classification: "invalid-context",
  });
});

test("isolates fixture records and returned projections from caller mutation", () => {
  const mutableScope = {
    scopeVersion: "1.0" as const,
    sourceTenantReference: "tenant-copy",
    sourceOwnershipReference: "owner-copy",
  };
  const mutableEvidence = {
    evidenceVersion: "1.0" as const,
    authorityDecisionReference: "decision-copy",
    decision: "authorized" as const,
  };
  const isolated = createDeterministicSourceArtifactAuthorityFixture([
    {
      recordVersion: "1.0",
      opaqueSourceArtifactReference: "source-copy",
      opaqueAuthorityRecordReference: "authority-copy",
      opaqueResolutionReference: "resolution-copy",
      ownershipScope: mutableScope,
      authorizationEvidence: mutableEvidence,
      outcome: "authorized",
    },
  ]);
  mutableScope.sourceOwnershipReference = "mutated-owner";
  mutableEvidence.authorityDecisionReference = "mutated-decision";

  const result = isolated.resolveSourceArtifact({
    ...input(),
    sourceArtifact: {
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source-copy",
    },
    context: {
      ...input().context,
      ownershipScope: {
        scopeVersion: "1.0",
        sourceTenantReference: "tenant-copy",
        sourceOwnershipReference: "owner-copy",
      },
      authorizationEvidence: {
        evidenceVersion: "1.0",
        authorityDecisionReference: "decision-copy",
        decision: "authorized",
      },
    },
  }) as SourceArtifactAuthorityResolutionResult;

  assert.equal(result.status, "authorized");
});
