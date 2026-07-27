import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderCapability";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Capability,
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2Result,
  SourceArtifactLocatorVersionNegotiationCapability,
} from "../../../lib/server/sourceArtifactLocator/types";

test("runtime provider contract composes with existing Locator V2 types", () => {
  const acceptsRequest = (value: SourceArtifactLocatorV2Request) => value;
  const acceptsResult = (value: SourceArtifactLocatorV2Result) => value;
  const acceptsLocator = (value: SourceArtifactLocatorV2Capability) => value;
  const acceptsNegotiator = (
    value: SourceArtifactLocatorVersionNegotiationCapability,
  ) => value;
  const acceptsInput = (value: SourceArtifactLocatorV2RuntimeProviderInput) => value;
  const acceptsProvider = (
    value: SourceArtifactLocatorV2RuntimeProviderCapability,
  ) => value;

  assert.equal(typeof acceptsRequest, "function");
  assert.equal(typeof acceptsResult, "function");
  assert.equal(typeof acceptsLocator, "function");
  assert.equal(typeof acceptsNegotiator, "function");
  assert.equal(typeof acceptsInput, "function");
  assert.equal(typeof acceptsProvider, "function");
});

test("existing foundations do not reverse-depend on the provider extension", () => {
  const existingFiles = [
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/sourceArtifactLocator/referenceDeterministicSourceArtifactLocatorV2.ts",
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /locatorV2RuntimeProvider/);
  }
});
