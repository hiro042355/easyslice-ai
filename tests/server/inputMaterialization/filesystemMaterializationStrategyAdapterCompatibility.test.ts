import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  FilesystemMaterializationStrategyAdapter,
} from "../../../lib/server/inputMaterialization/filesystemMaterializationStrategyAdapterTypes";
import type {
  MaterializationRuntimeProviderInput,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";
import type {
  ProductionMaterializationStrategyCapability,
} from "../../../lib/server/inputMaterialization/productionMaterializationProviderTypes";
import {
  ReferenceFilesystemInputMaterializationAdapter,
} from "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter";
import type {
  InputMaterializationCapability,
  InputMaterializationDecision,
} from "../../../lib/server/inputMaterialization/types";

const strategyCompatibility = (
  strategy: FilesystemMaterializationStrategyAdapter,
): ProductionMaterializationStrategyCapability => strategy;

const inputCompatibility = (
  strategy: ProductionMaterializationStrategyCapability,
  input: MaterializationRuntimeProviderInput,
): InputMaterializationDecision | Promise<InputMaterializationDecision> =>
  strategy.materialize(input);

const filesystemCompatibility = (
  adapter: ReferenceFilesystemInputMaterializationAdapter,
): InputMaterializationCapability => adapter;

test("adapter is compatible with existing strategy and filesystem capabilities", () => {
  assert.equal(typeof strategyCompatibility, "function");
  assert.equal(typeof inputCompatibility, "function");
  assert.equal(typeof filesystemCompatibility, "function");
});

test("existing foundations do not reverse-depend on strategy adapter", () => {
  const existing = [
    "lib/server/inputMaterialization/materializationRuntimeProviderTypes.ts",
    "lib/server/inputMaterialization/materializationRuntimeFacade.ts",
    "lib/server/inputMaterialization/materializationRuntimeComposition.ts",
    "lib/server/inputMaterialization/productionMaterializationProvider.ts",
    "lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter.ts",
    "lib/server/locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    existing,
    /filesystemMaterializationStrategyAdapter/,
  );
});
