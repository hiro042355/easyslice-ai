import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type {
  AuthorityLocatorRuntimeBindingInput,
  AuthorityLocatorRuntimeBindingResult,
} from "../../../lib/server/authorityLocatorRuntimeBinding/types";
import type {
  InputMaterializationV2Request,
} from "../../../lib/server/inputMaterialization/resolutionContextV2Types";
import type {
  InputMaterializationContext,
  InputMaterializationDecision,
} from "../../../lib/server/inputMaterialization/types";
import type {
  MaterializationRuntimeFacadeResult,
} from "../../../lib/server/inputMaterialization/materializationRuntimeFacadeTypes";
import type {
  LocatorMaterializationHandoffResult,
} from "../../../lib/server/locatorMaterializationHandoff/types";
import type {
  LocatorMaterializationRuntimeBindingResult,
} from "../../../lib/server/locatorMaterializationRuntimeBinding/types";
import type {
  WorkflowEntryInputEnvelope,
  WorkflowEntryResult,
} from "../../../lib/server/workflowEntry/types";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "../../../lib/server/workflowEntry/workflowMaterializationEntryContractTypes";

const inputCompatibility = (
  input: WorkflowMaterializationEntryInput,
): Readonly<{
  authority: AuthorityLocatorRuntimeBindingInput;
  request: InputMaterializationV2Request;
  context: InputMaterializationContext;
}> => ({
  authority: input.authorityLocatorBindingInput,
  request: input.materializationRequest,
  context: input.materializationExecutionContext,
});

const resultCompatibility = (
  result: WorkflowMaterializationEntryResult,
): Readonly<{
  authority: AuthorityLocatorRuntimeBindingResult;
  handoff?: LocatorMaterializationHandoffResult;
  runtime?: LocatorMaterializationRuntimeBindingResult;
}> => ({
  authority: result.authorityLocatorBindingResult,
  handoff: result.handoffResult,
  runtime: result.materializationRuntimeBindingResult,
});

type CanonicalInputCompatibility =
  WorkflowEntryInputEnvelope<WorkflowMaterializationEntryInput>;
type CanonicalResultCompatibility =
  WorkflowEntryResult<WorkflowMaterializationEntryResult>;

const preserveRuntimeTypes = (
  facade: MaterializationRuntimeFacadeResult,
  decision: InputMaterializationDecision,
): readonly [MaterializationRuntimeFacadeResult, InputMaterializationDecision] =>
  [facade, decision];

test("dedicated contract composes with canonical and runtime type systems", () => {
  assert.equal(typeof inputCompatibility, "function");
  assert.equal(typeof resultCompatibility, "function");
  assert.equal(typeof preserveRuntimeTypes, "function");
  const compileOnly:
    readonly [CanonicalInputCompatibility?, CanonicalResultCompatibility?] =
    [];
  assert.equal(compileOnly.length, 0);
});

test("existing foundations do not reverse-depend on dedicated contract", () => {
  const existing = [
    "lib/server/workflowEntry/types.ts",
    "lib/server/authorityLocatorRuntimeBinding/types.ts",
    "lib/server/locatorMaterializationHandoff/types.ts",
    "lib/server/locatorMaterializationRuntimeBinding/types.ts",
    "lib/server/inputMaterialization/materializationRuntimeFacadeTypes.ts",
    "lib/server/inputMaterialization/types.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(existing, /workflowMaterializationEntryContract/);
});
