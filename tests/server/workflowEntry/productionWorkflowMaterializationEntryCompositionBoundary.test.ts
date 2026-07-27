import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const production = readFileSync(
  "lib/server/workflowEntry/productionWorkflowMaterializationEntryComposition.ts",
  "utf8",
);
const fixture = readFileSync(
  "lib/server/workflowEntry/referenceProductionWorkflowMaterializationEntryComposition.ts",
  "utf8",
);

test("composition owns construction and DI without runtime behavior", () => {
  assert.doesNotMatch(
    production,
    /try\s*\{|catch\s*\(|validateProviderInput|materializationRequest|executionContext|reasonCode|classification|audit|retry|fallback/,
  );
  assert.doesNotMatch(
    `${production}\n${fixture}`,
    /app\/api|route|fetch\(|process\.env|singleton|globalRegistry|serviceLocator/i,
  );
});

test("production construction order follows the existing foundation chain", () => {
  const factoryBody = production.slice(
    production.indexOf(
      "export const createProductionWorkflowMaterializationEntryComposition",
    ),
  );
  const names = [
    "createAuthorityLocatorRuntimeComposition",
    "createAuthorityLocatorRuntimeBinding",
    "createLocatorMaterializationHandoff",
    "createProductionFilesystemMaterializationComposition",
    "createLocatorMaterializationRuntimeBinding",
    "executeWorkflowMaterializationEntryIntegration",
  ];
  const offsets = names.map((name) => factoryBody.indexOf(name));

  assert.equal(offsets.every((offset) => offset >= 0), true);
  assert.equal(
    offsets.every((offset, index) =>
      index === 0 || offset > (offsets[index - 1] ?? -1)),
    true,
  );
});
