import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  LocatorRuntimeFacadeDependencies,
} from "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes";
import type {
  SourceArtifactLocatorV2RuntimeProviderCapability,
} from "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderCapability";
import type {
  ProductionLocatorProviderComposition,
} from "../../../lib/server/sourceArtifactLocator/productionLocatorProviderTypes";
import type {
  SourceArtifactLocatorV2Capability,
  SourceArtifactLocatorV2Result,
} from "../../../lib/server/sourceArtifactLocator/types";

test("production composition is compatible with provider, facade, and Locator V2", () => {
  const acceptsProvider = (
    value: SourceArtifactLocatorV2RuntimeProviderCapability,
  ) => value;
  const acceptsFacadeDependencies = (
    value: LocatorRuntimeFacadeDependencies,
  ) => value;
  const acceptsComposition = (
    value: ProductionLocatorProviderComposition,
  ) => value;
  const acceptsLocator = (value: SourceArtifactLocatorV2Capability) => value;
  const acceptsResult = (value: SourceArtifactLocatorV2Result) => value;

  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsFacadeDependencies, "function");
  assert.equal(typeof acceptsComposition, "function");
  assert.equal(typeof acceptsLocator, "function");
  assert.equal(typeof acceptsResult, "function");
});

test("existing contracts and facade do not reverse-depend on production provider", () => {
  const existingFiles = [
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderTypes.ts",
    "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderCapability.ts",
    "../../../lib/server/sourceArtifactLocator/locatorV2RuntimeProviderValidation.ts",
    "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacadeTypes.ts",
    "../../../lib/server/locatorRuntimeFacade/locatorRuntimeFacade.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /productionLocatorProvider/);
  }
});
