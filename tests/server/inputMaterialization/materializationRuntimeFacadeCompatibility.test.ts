import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  MaterializationRuntimeFacade,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacadeTypes";
import type {
  MaterializationRuntimeProviderCapability,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInputValidationCapability,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";
import type {
  InputMaterializationCapability,
  InputMaterializationDecision,
} from "../../../lib/server/inputMaterialization/types";
import type {
  LocatorMaterializationHandoffResult,
} from "../../../lib/server/locatorMaterializationHandoff/types";

test("facade remains compatible with provider, handoff, and materialization contracts", () => {
  const acceptsFacade = (value: MaterializationRuntimeFacade) => value;
  const acceptsProvider = (value: MaterializationRuntimeProviderCapability) => value;
  const acceptsValidation = (
    value: MaterializationRuntimeProviderInputValidationCapability,
  ) => value;
  const acceptsDecision = (value: InputMaterializationDecision) => value;
  const acceptsHandoff = (value: LocatorMaterializationHandoffResult) => value;
  const acceptsV1 = (value: InputMaterializationCapability) => value;

  assert.equal(typeof acceptsFacade, "function");
  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsValidation, "function");
  assert.equal(typeof acceptsDecision, "function");
  assert.equal(typeof acceptsHandoff, "function");
  assert.equal(typeof acceptsV1, "function");
});

test("existing foundations do not reverse-depend on facade", () => {
  const existingFiles = [
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeProviderCapability.ts",
    "../../../lib/server/inputMaterialization/materializationRuntimeProviderValidation.ts",
    "../../../lib/server/locatorMaterializationHandoff/types.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /materializationRuntimeFacade/);
  }
});
