import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createProductionWorkflowMaterializationEntryExecution,
} from "../../../lib/server/workflowEntry/productionWorkflowMaterializationEntryExecution";
import {
  createProductionWorkflowMaterializationEntryComposition,
} from "../../../lib/server/workflowEntry/productionWorkflowMaterializationEntryComposition";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "../../../lib/server/workflowEntry/workflowMaterializationEntryContractTypes";

const compatibility = (
  composition: ReturnType<
    typeof createProductionWorkflowMaterializationEntryComposition
  >,
  input: WorkflowMaterializationEntryInput,
): Promise<WorkflowMaterializationEntryResult> =>
  createProductionWorkflowMaterializationEntryExecution({
    productionWorkflowMaterializationEntryComposition: composition,
  }).execute(input);

test("execution accepts the existing production composition", () => {
  assert.equal(typeof compatibility, "function");
});

test("existing foundations do not reverse-depend on execution", () => {
  const existing = [
    "lib/server/workflowEntry/workflowMaterializationEntryContractTypes.ts",
    "lib/server/workflowEntry/workflowMaterializationEntryIntegration.ts",
    "lib/server/workflowEntry/productionWorkflowMaterializationEntryComposition.ts",
    "lib/server/authorityLocatorRuntimeBinding/types.ts",
    "lib/server/locatorMaterializationHandoff/types.ts",
    "lib/server/locatorMaterializationRuntimeBinding/types.ts",
    "lib/server/inputMaterialization/types.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    existing,
    /productionWorkflowMaterializationEntryExecution/,
  );
});
