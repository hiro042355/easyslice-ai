import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Generation Job Entry Runtime uses only contract types and one injected entry capability", async () => {
  const source = await readFile(new URL("../../../lib/server/generationJobEntry/referenceGenerationJobEntryRuntime.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ["../composition/types", "../workflowEntry/types", "./types"]);
  assert.doesNotMatch(
    source,
    /(?:ReferenceServerComposition|ReferenceWorkflowEntryRuntime|ReferenceGenerationWorkflow|ReferenceWorkflowRegistry|ReferenceOperationPipeline|OutputIngestion|ProviderClient|Materializer|Upload)/,
  );
  assert.doesNotMatch(source, /(?:next\/|react|http|sql|postgres|queue|worker|poll|scheduler|node:fs|node:net)/i);
  assert.doesNotMatch(source, /(?:fetch\s*\(|XMLHttpRequest|WebSocket|process\.env|Date\.now|new\s+Date|Math\.random|randomUUID|setTimeout|setInterval|setImmediate|process\.hrtime)/);
  assert.doesNotMatch(source, /(?:singleton|globalComposition|globalRegistry|defaultDependency|createReference)/i);
  assert.doesNotMatch(source, /(?:credential|token|cookie|authorizationHeader|signedUrl|providerReference|storageLocator|stackTrace)/i);
});
