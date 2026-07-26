import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicSourceArtifactLocatorV2Fixture,
  createSourceArtifactLocatorV1CompatibilityAdapter,
  createSourceArtifactLocatorVersionNegotiator,
} from "../../../lib/server/sourceArtifactLocator/referenceDeterministicSourceArtifactLocatorV2";
import type {
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2Result,
} from "../../../lib/server/sourceArtifactLocator/types";

const request = (
  overrides: Partial<SourceArtifactLocatorV2Request> = {},
): SourceArtifactLocatorV2Request => ({
  version: "2.0",
  opaqueReference: "source-alpha",
  resolutionContext: {
    contextVersion: "2.0",
    requestIdentity: "request-alpha",
    operationIdentity: "operation-alpha",
    workflowIdentity: "workflow-alpha",
    ownershipScope: {
      scopeVersion: "1.0",
      sourceTenantReference: "tenant-alpha",
      sourceOwnershipReference: "owner-alpha",
    },
    authorizationEvidence: {
      evidenceVersion: "1.0",
      authorityDecisionReference: "decision-alpha",
      decision: "authorized",
    },
  },
  ...overrides,
});

const fixture = createDeterministicSourceArtifactLocatorV2Fixture([
  {
    recordVersion: "1.0",
    opaqueReference: "source-alpha",
    sourceTenantReference: "tenant-alpha",
    sourceOwnershipReference: "owner-alpha",
    workflowIdentity: "workflow-alpha",
    authorityDecisionReference: "decision-alpha",
    result: {
      resultVersion: "2.0",
      status: "authorized",
      opaqueResolutionReference: "resolution-alpha",
    },
  },
  {
    recordVersion: "1.0",
    opaqueReference: "source-revoked",
    sourceTenantReference: "tenant-alpha",
    sourceOwnershipReference: "owner-alpha",
    workflowIdentity: "workflow-alpha",
    authorityDecisionReference: "decision-alpha",
    result: { resultVersion: "2.0", status: "revoked" },
  },
]);

test("negotiates the highest supported caller version deterministically", () => {
  const negotiator = createSourceArtifactLocatorVersionNegotiator();

  assert.deepEqual(
    negotiator.negotiateVersion({
      negotiationVersion: "1.0",
      requestedVersions: ["1.0", "2.0"],
    }),
    {
      resultVersion: "1.0",
      status: "selected",
      selectedVersion: "2.0",
    },
  );
  assert.deepEqual(
    negotiator.negotiateVersion({
      negotiationVersion: "1.0",
      requestedVersions: ["1.0"],
    }),
    {
      resultVersion: "1.0",
      status: "selected",
      selectedVersion: "1.0",
    },
  );
  assert.deepEqual(
    negotiator.negotiateVersion({
      negotiationVersion: "1.0",
      requestedVersions: [],
    }),
    { resultVersion: "1.0", status: "unsupported" },
  );
});

test("propagates V2 resolution context and returns deterministic authorized results", () => {
  const first = fixture.locateSourceV2(request()) as SourceArtifactLocatorV2Result;
  const second = fixture.locateSourceV2(request()) as SourceArtifactLocatorV2Result;

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    resultVersion: "2.0",
    status: "authorized",
    opaqueResolutionReference: "resolution-alpha",
  });
  assert.equal("location" in first, false);
  assert.equal(Object.isFrozen(first), true);
});

test("classifies ownership, workflow, authorization, lifecycle, lookup, and input failures", () => {
  const cases: readonly [
    SourceArtifactLocatorV2Request,
    SourceArtifactLocatorV2Result,
  ][] = [
    [
      request({
        resolutionContext: {
          ...request().resolutionContext,
          ownershipScope: {
            ...request().resolutionContext.ownershipScope,
            sourceOwnershipReference: "owner-other",
          },
        },
      }),
      { resultVersion: "2.0", status: "ownership-mismatch" },
    ],
    [
      request({
        resolutionContext: {
          ...request().resolutionContext,
          workflowIdentity: "workflow-other",
        },
      }),
      { resultVersion: "2.0", status: "workflow-mismatch" },
    ],
    [
      request({
        resolutionContext: {
          ...request().resolutionContext,
          authorizationEvidence: {
            ...request().resolutionContext.authorizationEvidence,
            authorityDecisionReference: "decision-other",
          },
        },
      }),
      {
        resultVersion: "2.0",
        status: "rejected",
        classification: "authorization-denied",
      },
    ],
    [
      request({ opaqueReference: "source-revoked" }),
      { resultVersion: "2.0", status: "revoked" },
    ],
    [
      request({ opaqueReference: "source-missing" }),
      { resultVersion: "2.0", status: "not-found" },
    ],
    [
      request({ opaqueReference: "" }),
      { resultVersion: "2.0", status: "invalid-reference" },
    ],
  ];

  for (const [input, expected] of cases) {
    assert.deepEqual(fixture.locateSourceV2(input), expected);
  }
});

test("adapts legacy V1 capability without exposing its internal location", async () => {
  const observed: string[] = [];
  const adapter = createSourceArtifactLocatorV1CompatibilityAdapter({
    locateSource(value) {
      observed.push(value.opaqueReference);
      return { location: "internal-only-location" };
    },
  });

  const result = await adapter.locateSourceV2(request());

  assert.deepEqual(observed, ["source-alpha"]);
  assert.deepEqual(result, {
    resultVersion: "2.0",
    status: "authorized",
    opaqueResolutionReference: "decision-alpha",
  });
  assert.equal("location" in result, false);
});

test("normalizes legacy V1 failures without leaking errors", async () => {
  const adapter = createSourceArtifactLocatorV1CompatibilityAdapter({
    locateSource() {
      throw new Error("secret-path-and-stack");
    },
  });

  assert.deepEqual(await adapter.locateSourceV2(request()), {
    resultVersion: "2.0",
    status: "internal-failure",
  });
});
