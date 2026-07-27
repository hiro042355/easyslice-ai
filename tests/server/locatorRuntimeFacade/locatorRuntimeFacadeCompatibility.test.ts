import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  LocatorRuntimeFacade,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes";
import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderCapability";
import type {
  SourceArtifactLocatorV2RuntimeProviderInput,
  SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderTypes";
import type {
  SourceArtifactLocatorV2Capability,
  SourceArtifactLocatorV2Request,
  SourceArtifactLocatorV2Result,
} from "../../../lib/server/sourceArtifactLocator/types";

test("facade remains compatible with provider and Locator V2 contracts", () => {
  const acceptsFacade = (value: LocatorRuntimeFacade) => value;
  const acceptsProvider = (
    value: SourceArtifactLocatorV2RuntimeProviderCapability,
  ) => value;
  const acceptsValidation = (
    value: SourceArtifactLocatorV2RuntimeProviderInputValidationCapability,
  ) => value;
  const acceptsInput = (value: SourceArtifactLocatorV2RuntimeProviderInput) => value;
  const acceptsLocator = (value: SourceArtifactLocatorV2Capability) => value;
  const acceptsRequest = (value: SourceArtifactLocatorV2Request) => value;
  const acceptsResult = (value: SourceArtifactLocatorV2Result) => value;

  assert.equal(typeof acceptsFacade, "function");
  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsValidation, "function");
  assert.equal(typeof acceptsInput, "function");
  assert.equal(typeof acceptsLocator, "function");
  assert.equal(typeof acceptsRequest, "function");
  assert.equal(typeof acceptsResult, "function");
});

test("existing foundations do not reverse-depend on Locator Runtime Facade", () => {
  const existingFiles = [
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderTypes.ts",
    "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderCapability.ts",
    "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderValidation.ts",
    "../../../lib/server/authorityRuntimeFacade/authorityRuntimeFacadeTypes.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/authorityLocatorResolution/authorityLocatorAdapterTypes.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /locatorRuntimeFacade/);
  }
});
