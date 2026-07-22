import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Workflow Registry stores definitions only and has no default instance", async () => {
  const source = await readFile(new URL("../../lib/workflows/referenceWorkflowRegistry.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g)].map(
    (match) => ({ typeOnly: match[1] !== undefined, target: match[2] }),
  );
  assert.deepEqual(imports, [{ typeOnly: true, target: "./types" }]);
  assert.doesNotMatch(source, /referenceGenerationWorkflow|ReferenceGenerationWorkflow|workflowEntry|server\//i);
  assert.doesNotMatch(source, /defaultRegistry|globalRegistry|referenceWorkflowRegistry\s*=|export\s+default/i);
  assert.doesNotMatch(
    source,
    /(?:operationPipelines|providerClients?|providers?|materializers?|outputIngestion|providerUploads?|react|next\/|node:|http|sql|postgres|queue|worker|poll)/i,
  );
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval|setImmediate)/,
  );
  assert.doesNotMatch(source, /\b(?:execute|run|schedule|reconcile)\s*\(/);
});
