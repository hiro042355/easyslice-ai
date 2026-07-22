import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Workflow Runtime uses only public contracts and injected pipelines", async () => {
  const source = await readFile(new URL("../../lib/workflows/referenceGenerationWorkflow.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(imports, ["../operationPipelines/types", "./types"]);
  assert.match(source, /constructor\(dependencies: ReferenceWorkflowRuntimeDependencies\)/);
  assert.doesNotMatch(source, /defaultRegistry|globalRegistry|singleton/i);
  assert.doesNotMatch(
    source,
    /(?:referenceOperationPipeline|operationBindings|referenceWorkflowRegistry|workflowEntry|server\/|providerClients?|providers\/reference|materializers\/reference|referenceOutputIngestion|providerUploads?|react|next\/|node:|http|sql|postgres|queue|worker|poll)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /while\s*\(|retryLoop|scheduleRetry|executeReconciliation|background/i);
});
