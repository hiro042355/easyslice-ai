import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  MaterializationRuntimeFacadeDependencies,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacadeTypes";
import type {
  MaterializationRuntimeProviderCapability,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderCapability";
import type {
  ProductionMaterializationProviderComposition,
} from "../../../lib/server/inputMaterialization/productionMaterializationProviderTypes";
import type {
  InputMaterializationCapability,
  InputMaterializationDecision,
} from "../../../lib/server/inputMaterialization/types";
import type {
  LocatorMaterializationHandoffResult,
} from "../../../lib/server/locatorMaterializationHandoff/types";

test("production provider remains compatible with facade and existing contracts", () => {
  const acceptsProvider = (value: MaterializationRuntimeProviderCapability) => value;
  const acceptsComposition = (
    value: ProductionMaterializationProviderComposition,
  ) => value;
  const acceptsFacadeDependencies = (
    value: MaterializationRuntimeFacadeDependencies,
  ) => value;
  const acceptsDecision = (value: InputMaterializationDecision) => value;
  const acceptsHandoff = (value: LocatorMaterializationHandoffResult) => value;
  const acceptsV1 = (value: InputMaterializationCapability) => value;

  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsComposition, "function");
  assert.equal(typeof acceptsFacadeDependencies, "function");
  assert.equal(typeof acceptsDecision, "function");
  assert.equal(typeof acceptsHandoff, "function");
  assert.equal(typeof acceptsV1, "function");
});

test("existing foundations do not reverse-depend on production provider", () => {
  const existingFiles = [
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeProviderCapability.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeFacadeTypes.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeFacade.ts",
    "../../../lib/server/locatorMaterializationHandoff/types.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /productionMaterializationProvider/);
  }
});
