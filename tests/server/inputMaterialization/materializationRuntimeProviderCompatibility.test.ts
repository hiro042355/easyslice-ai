import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  InputMaterializationV2Request,
} from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type {
  MaterializationRuntimeProviderCapability,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderCapability";
import type {
  MaterializationRuntimeProviderInput,
} from "../../../lib/server/inputMaterialization/materializationRuntimeProviderTypes";
import type {
  InputMaterializationCapability,
  InputMaterializationContext,
  InputMaterializationDecision,
} from "../../../lib/server/inputMaterialization/types";
import type {
  LocatorMaterializationHandoffResult,
} from "../../../lib/server/locatorMaterializationHandoff/types";

test("provider extension remains compatible with existing handoff and materialization types", () => {
  const acceptsProvider = (value: MaterializationRuntimeProviderCapability) => value;
  const acceptsInput = (value: MaterializationRuntimeProviderInput) => value;
  const acceptsHandoff = (value: LocatorMaterializationHandoffResult) => value;
  const acceptsV2 = (value: InputMaterializationV2Request) => value;
  const acceptsContext = (value: InputMaterializationContext) => value;
  const acceptsDecision = (value: InputMaterializationDecision) => value;
  const acceptsV1 = (value: InputMaterializationCapability) => value;

  assert.equal(typeof acceptsProvider, "function");
  assert.equal(typeof acceptsInput, "function");
  assert.equal(typeof acceptsHandoff, "function");
  assert.equal(typeof acceptsV2, "function");
  assert.equal(typeof acceptsContext, "function");
  assert.equal(typeof acceptsDecision, "function");
  assert.equal(typeof acceptsV1, "function");
});

test("existing foundations do not reverse-depend on provider extension", () => {
  const existingFiles = [
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/inputMaterialization/referenceFilesystemInputMaterializationAdapter.ts",
    "../../../lib/server/locatorMaterializationHandoff/types.ts",
    "../../../lib/server/workflowEntryMaterialization/adapterTypes.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /materializationRuntimeProvider/);
  }
});
