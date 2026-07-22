import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Workflow Entry Runtime keeps transport and composition outside its boundary", async () => {
  const source = await readFile(
    new URL("../../../lib/server/workflowEntry/referenceWorkflowEntryRuntime.ts", import.meta.url),
    "utf8",
  );
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(imports.sort(), ["../../workflows/types", "./types"]);
  assert.doesNotMatch(source, /(?:next\/|react|http|route.?handler|provider|materializer|outputIngestion|upload|queue|worker|poll)/i);
  assert.doesNotMatch(source, /(?:fetch\s*\(|XMLHttpRequest|WebSocket|node:fs|process\.env|Date\.now|Math\.random|setTimeout|setInterval)/);
  assert.doesNotMatch(source, /(?:ReferenceWorkflowRegistry|ReferenceGenerationWorkflow|new\s+Reference|defaultRegistry|singleton|globalRegistry)/);
  assert.doesNotMatch(source, /\b(?:NextRequest|NextResponse|Request|Response)\b/);
});
