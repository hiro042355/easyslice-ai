import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  MaterializationRuntimeComposition,
} from "../../../lib/server/inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  MaterializationRuntimeFacadeResult,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacadeTypes";
import type {
  MaterializationRuntimeProviderInput,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";
import type {
  LocatorMaterializationHandoffResult,
} from "../../../lib/server/locatorMaterializationHandoff/types";
import type {
  LocatorMaterializationRuntimeBindingInput,
  LocatorMaterializationRuntimeBindingResult,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/types";

const inputCompatibility = (
  handoffResult: LocatorMaterializationHandoffResult,
  runtimeComposition: MaterializationRuntimeComposition,
): LocatorMaterializationRuntimeBindingInput => ({
  bindingInputVersion: "1.0",
  handoffResult,
  runtimeComposition,
});

const providerCompatibility = (
  input: Extract<
    LocatorMaterializationRuntimeBindingResult,
    { status: "completed" }
  >,
): MaterializationRuntimeProviderInput => ({
  providerInputVersion: "1.0",
  handoffResult: input.handoffResult,
});

const facadeCompatibility = (
  result: Extract<
    LocatorMaterializationRuntimeBindingResult,
    { status: "completed" }
  >,
): MaterializationRuntimeFacadeResult => result.facadeResult;

test("binding remains compatible with handoff, provider, facade, and composition", () => {
  assert.equal(typeof inputCompatibility, "function");
  assert.equal(typeof providerCompatibility, "function");
  assert.equal(typeof facadeCompatibility, "function");
});

test("existing foundations do not reverse-depend on runtime binding", () => {
  const existing = [
    "lib/server/locatorMaterializationHandoff/types.ts",
    "lib/server/inputMaterialization/materializationRuntimeProviderTypes.ts",
    "lib/server/inputMaterialization/materializationRuntimeFacadeTypes.ts",
    "lib/server/inputMaterialization/materializationRuntimeCompositionTypes.ts",
    "lib/server/inputMaterialization/types.ts",
    "lib/server/inputMaterialization/resolutionContextV2Types.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(existing, /locatorMaterializationRuntimeBinding/);
});
