import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  executeWorkflowMaterializationEntryIntegration,
} from "../../../lib/server/workflowEntry/workflowMaterializationEntryIntegration";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "../../../lib/server/workflowEntry/workflowMaterializationEntryContractTypes";
import {
  createProductionFilesystemMaterializationComposition,
} from "../../../lib/server/inputMaterialization/productionFilesystemMaterializationComposition";

const integrationCompatibility = (
  input: WorkflowMaterializationEntryInput,
): Promise<WorkflowMaterializationEntryResult> =>
  executeWorkflowMaterializationEntryIntegration(input, {
    authorityLocatorBinding: Object.freeze({}) as never,
    handoff: Object.freeze({}) as never,
    materializationBinding: Object.freeze({}) as never,
    materializationRuntimeComposition: Object.freeze({}) as never,
  });

test("integration uses the execution contract and production composition API", () => {
  assert.equal(typeof integrationCompatibility, "function");
  assert.equal(
    typeof createProductionFilesystemMaterializationComposition,
    "function",
  );
});

test("existing foundations do not reverse-depend on integration", () => {
  const existing = [
    "lib/server/workflowEntry/workflowMaterializationEntryContractTypes.ts",
    "lib/server/authorityLocatorRuntimeBinding/authorityLocatorRuntimeBinding.ts",
    "lib/server/locatorMaterializationHandoff/locatorMaterializationHandoff.ts",
    "lib/server/locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding.ts",
    "lib/server/inputMaterialization/productionFilesystemMaterializationComposition.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    existing,
    /workflowMaterializationEntryIntegration/,
  );
});
