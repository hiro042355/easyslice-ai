import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  MaterializationRuntimeFacade,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacadeTypes";
import type {
  MaterializationRuntimeComposition,
} from "../../../lib/server/inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  MaterializationRuntimeProviderCapability,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInputValidationCapability,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";

const compatible = (
  composition: MaterializationRuntimeComposition,
): Readonly<{
  facade: MaterializationRuntimeFacade;
  provider: MaterializationRuntimeProviderCapability;
  validation: MaterializationRuntimeProviderInputValidationCapability;
}> => composition;

test("composition result remains compatible with existing capabilities", () => {
  assert.equal(typeof compatible, "function");
});

test("existing foundations do not reverse-depend on runtime composition", () => {
  const existing = [
    "lib/server/inputMaterialization/materializationRuntimeFacade.ts",
    "lib/server/inputMaterialization/materializationRuntimeFacadeTypes.ts",
    "lib/server/inputMaterialization/materializationRuntimeProviderCapability.ts",
    "lib/server/inputMaterialization/materializationRuntimeProviderTypes.ts",
    "lib/server/inputMaterialization/materializationRuntimeProviderValidation.ts",
    "lib/server/inputMaterialization/productionMaterializationProvider.ts",
    "lib/server/inputMaterialization/productionMaterializationProviderComposition.ts",
    "lib/server/inputMaterialization/productionMaterializationProviderTypes.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    existing,
    /materializationRuntimeComposition|referenceDeterministicMaterializationRuntimeComposition/,
  );
});
