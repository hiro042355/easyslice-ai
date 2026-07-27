import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createProductionWorkflowMaterializationEntryComposition,
} from "../../../lib/server/workflowEntry/productionWorkflowMaterializationEntryComposition";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "../../../lib/server/workflowEntry/workflowMaterializationEntryContractTypes";

const integrationCompatibility = (
  composition: ReturnType<
    typeof createProductionWorkflowMaterializationEntryComposition
  >,
  input: WorkflowMaterializationEntryInput,
): Promise<WorkflowMaterializationEntryResult> =>
  composition.integration.execute(input);

test("production composition exposes the existing integration contract", () => {
  assert.equal(typeof integrationCompatibility, "function");
});

test("existing foundations do not reverse-depend on production composition", () => {
  const existing = [
    "lib/server/workflowEntry/workflowMaterializationEntryIntegration.ts",
    "lib/server/workflowEntry/workflowMaterializationEntryContractTypes.ts",
    "lib/server/authorityLocatorRuntimeComposition/authorityLocatorRuntimeComposition.ts",
    "lib/server/authorityLocatorRuntimeBinding/authorityLocatorRuntimeBinding.ts",
    "lib/server/locatorMaterializationHandoff/locatorMaterializationHandoff.ts",
    "lib/server/locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding.ts",
    "lib/server/inputMaterialization/productionFilesystemMaterializationComposition.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    existing,
    /productionWorkflowMaterializationEntryComposition/,
  );
});
