import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createProductionFilesystemMaterializationComposition,
} from "../../../lib/server/inputMaterialization/productionFilesystemMaterializationComposition";
import type {
  MaterializationRuntimeComposition,
} from "../../../lib/server/inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  InputMaterializationDependencies,
} from "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter";

const compatibility = (
  dependencies: InputMaterializationDependencies,
): MaterializationRuntimeComposition =>
  createProductionFilesystemMaterializationComposition(dependencies);

test("production composition returns the existing runtime composition", () => {
  assert.equal(typeof compatibility, "function");
});

test("existing strategy, provider, facade, runtime, and binding do not reverse-depend", () => {
  const existing = [
    "lib/server/inputMaterialization/filesystemMaterializationStrategyAdapter.ts",
    "lib/server/inputMaterialization/productionMaterializationProvider.ts",
    "lib/server/inputMaterialization/materializationRuntimeFacade.ts",
    "lib/server/inputMaterialization/materializationRuntimeComposition.ts",
    "lib/server/locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    existing,
    /productionFilesystemMaterializationComposition/,
  );
});
