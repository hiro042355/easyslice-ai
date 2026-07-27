import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  AuthorityLocatorRuntimeBindingResult,
} from "../../../lib/server/authorityLocatorRuntimeBinding/types";
import type {
  LocatorMaterializationHandoffInput,
} from "../../../lib/server/locatorMaterializationHandoff/types";
import type {
  InputMaterializationV2Request,
} from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type {
  WorkflowEntryTrustedContextAdapterResult,
} from "../../../lib/server/workflowEntryMaterialization/adapterTypes";

test("handoff remains compatible with binding, Materialization V2, and workflow adapter", () => {
  const acceptsBinding = (value: AuthorityLocatorRuntimeBindingResult) => value;
  const acceptsRequest = (value: InputMaterializationV2Request) => value;
  const acceptsHandoff = (value: LocatorMaterializationHandoffInput) => value;
  const acceptsWorkflowResult = (
    value: WorkflowEntryTrustedContextAdapterResult,
  ) => value;

  assert.equal(typeof acceptsBinding, "function");
  assert.equal(typeof acceptsRequest, "function");
  assert.equal(typeof acceptsHandoff, "function");
  assert.equal(typeof acceptsWorkflowResult, "function");
});

test("existing foundations do not reverse-depend on handoff", () => {
  const existingFiles = [
    "../../../lib/server/authorityLocatorRuntimeBinding/types.ts",
    "../../../lib/server/sourceArtifactLocator/types.ts",
    "../../../lib/server/inputMaterialization/types.ts",
    "../../../lib/server/inputMaterialization/resolutionContextV2Types.ts",
    "../../../lib/server/workflowEntryMaterialization/adapterTypes.ts",
  ];

  for (const path of existingFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /locatorMaterializationHandoff/);
  }
});
