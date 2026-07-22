import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Reference Server Composition only assembles injected capability descriptors", async () => {
  const source = await readFile(new URL("../../../lib/server/composition/referenceServerComposition.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["'];/g)].map(
    (match) => ({ typeOnly: match[1] !== undefined, target: match[2] }),
  );
  assert.deepEqual(imports, [{ typeOnly: true, target: "./types" }]);
  assert.doesNotMatch(
    source,
    /(?:ReferenceWorkflowEntryRuntime|ReferenceGenerationWorkflow|ReferenceWorkflowRegistry|ReferenceOperationPipeline|OutputIngestion|ProviderClient|Materializer|createReference|defaultComposition|globalRegistry|singleton)/,
  );
  assert.doesNotMatch(source, /(?:next\/|react|http|sql|postgres|queue|worker|poll|node:fs|node:net)/i);
  assert.doesNotMatch(source, /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|randomUUID|setTimeout|setInterval)/);
  assert.doesNotMatch(source, /\b(?:execute|invoke)\s*\(/);
  assert.doesNotMatch(source, /new\s+(?:ReferenceWorkflow|ReferenceOperation|Provider|Materializer|OutputIngestion|Registry)/);
});
