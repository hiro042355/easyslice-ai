import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const types = readFileSync(
  "lib/server/workflowEntry/workflowMaterializationEntryContractTypes.ts",
  "utf8",
);
const contract = readFileSync(
  "lib/server/workflowEntry/workflowMaterializationEntryContract.ts",
  "utf8",
);
const fixtures = readFileSync(
  "lib/server/workflowEntry/referenceWorkflowMaterializationEntryContractFixtures.ts",
  "utf8",
);

test("contract directly reuses existing inputs and results", () => {
  assert.match(types, /AuthorityLocatorRuntimeBindingInput/);
  assert.match(types, /AuthorityLocatorRuntimeBindingResult/);
  assert.match(types, /InputMaterializationV2Request/);
  assert.match(types, /InputMaterializationContext/);
  assert.match(types, /LocatorMaterializationHandoffResult/);
  assert.match(types, /LocatorMaterializationRuntimeBindingResult/);
  assert.doesNotMatch(types, /status:\s*["']not-run["']/);
  assert.doesNotMatch(types, /Failure|Classification/);
});

test("foundation contains shape guards and fixtures but no execution", () => {
  const combined = `${contract}\n${fixtures}`;
  assert.doesNotMatch(
    combined,
    /createAuthorityLocatorRuntimeBinding|createLocatorMaterializationHandoff|createLocatorMaterializationRuntimeBinding|\.execute\(|\.prepare\(|\.bind\(/,
  );
  assert.doesNotMatch(
    combined,
    /app\/api|route|node:fs|node:path|fetch\(|process\.env|try\s*\{|catch\s*\(/i,
  );
});
